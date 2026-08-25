import jwt
import re
import datetime
from django.db import transaction as db_transaction
from decimal import Decimal, InvalidOperation
from django.core.paginator import Paginator
    
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from django.db.models import Count, Q, Sum, Max
from django.db.models.deletion import ProtectedError

from app.models import User, UserToken, Role, Brand, UserRole, Permission, RolePermission, Broker, BrokerPayout, Client, ClientTransaction, ClientMonthlyLegitimacy, ClientMonthlyEquity, ClientMonthlyPaid, AuditLog
from app.utils import verify_password, generate_access_token, generate_refresh_token, decode_token, hash_password
from app.tenancy import (
    is_admin,
    current_brand_ids,
    scope_to_brand,
    assert_same_brand,
    has_brand_access,
    assert_brand_in_scope,
    assert_brands_in_scope,
)


DEFAULT_USER_PASSWORD = '123456'
PASSWORD_COMPLEXITY_MESSAGE = 'Password must be at least 8 characters long and include at least one uppercase letter, one number, and one symbol.'


def _extract_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '')


def _validate_password_strength(password):
    if len(password) < 8:
        return PASSWORD_COMPLEXITY_MESSAGE
    if not re.search(r'[A-Z]', password):
        return PASSWORD_COMPLEXITY_MESSAGE
    if not re.search(r'\d', password):
        return PASSWORD_COMPLEXITY_MESSAGE
    if not re.search(r'[^A-Za-z0-9]', password):
        return PASSWORD_COMPLEXITY_MESSAGE
    return None


def _month_bounds(month_date):
    """Return month start/end as both date and timezone-aware datetime bounds.

    The datetime bounds are safe for filtering DateTimeField columns while
    USE_TZ is enabled.
    """
    month_start = month_date
    if month_date.month == 12:
        next_month = month_date.replace(year=month_date.year + 1, month=1)
    else:
        next_month = month_date.replace(month=month_date.month + 1)

    tz = timezone.get_current_timezone()
    month_start_dt = timezone.make_aware(datetime.datetime.combine(month_start, datetime.time.min), tz)
    next_month_dt = timezone.make_aware(datetime.datetime.combine(next_month, datetime.time.min), tz)
    return month_start, next_month, month_start_dt, next_month_dt


def _normalize_audit_value(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _normalize_audit_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_normalize_audit_value(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _build_audit_change_details(previous_values, current_values, extra_details=None):
    changes = {}

    for key, previous_value in previous_values.items():
        current_value = current_values.get(key)
        if _normalize_audit_value(previous_value) == _normalize_audit_value(current_value):
            continue
        changes[key] = {
            'from': previous_value,
            'to': current_value,
        }

    details = {}
    if changes:
        details['changes'] = changes

    for key, value in (extra_details or {}).items():
        normalized = _normalize_audit_value(value)
        if normalized in (None, '', [], {}):
            continue
        details[key] = normalized

    return details


def log_audit_event(
    request,
    module,
    action,
    description,
    entity_type='',
    entity_id='',
    entity_label='',
    details=None,
    actor=None,
    username='',
):
    actor_obj = actor if actor is not None else getattr(request, 'user', None)
    actor_id = getattr(actor_obj, 'id', None)
    AuditLog.objects.create(
        actor=actor_obj if actor_id else None,
        username=username or (getattr(actor_obj, 'username', '') if actor_id else ''),
        module=module,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id or ''),
        entity_label=entity_label or '',
        description=description,
        details=_normalize_audit_value(details or {}),
        ip_address=_extract_ip(request) if request is not None else '',
    )


def format_audit_log(entry):
    return {
        'id': entry.id,
        'username': entry.username,
        'module': entry.module,
        'action': entry.action,
        'entity_type': entry.entity_type,
        'entity_id': entry.entity_id,
        'entity_label': entry.entity_label,
        'description': entry.description,
        'details': entry.details or {},
        'ip_address': entry.ip_address,
        'created_at': entry.created_at.strftime('%Y-%m-%d %H:%M:%S'),
    }


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '').strip()

    if not username or not password:
        return Response(
            {'success': False, 'message': 'Username and password are required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Invalid credentials.'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    if not verify_password(password, user.password):
        return Response(
            {'success': False, 'message': 'Invalid credentials.'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    if user.status != 'Active':
        return Response(
            {'success': False, 'message': 'Your account is inactive. Contact admin.'},
            status=status.HTTP_403_FORBIDDEN
        )

    access_token  = generate_access_token(user)
    refresh_token = generate_refresh_token(user.id)

    # Stamp last_login on each successful authentication.
    user.last_login = timezone.now()
    user.save(update_fields=['last_login'])

    # Save refresh token to DB
    expires_at = timezone.now() + timezone.timedelta(
        days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
    )
    UserToken.objects.create(
        user=user,
        refresh_token=refresh_token,
        expires_at=expires_at
    )

    log_audit_event(
        request,
        module='auth',
        action='login',
        description=f'User "{user.username}" logged in.',
        entity_type='user',
        entity_id=user.id,
        entity_label=user.username,
        details={'roles': user.role_names, 'brand': user.brand_name},
        actor=user,
    )

    return Response({
        'success': True,
        'message': 'Login successful.',
        'data': {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': {
                'id': user.id,
                'username': user.username,
                'roles': user.role_names,
                # Legacy single-brand field (kept for backwards compatibility).
                'brand': user.brand_name,
                # Multi-brand access scope (BBAC source of truth).
                'brands': list(user.brands.values_list('name', flat=True)),
                'brand_ids': list(user.brands.values_list('id', flat=True)),
                'must_change_password': user.must_change_password,
                'permissions': sorted({
                    f'{m}:{a}'
                    for m, a in user.roles
                        .values_list(
                            'role_permissions__permission__module',
                            'role_permissions__permission__action'
                        )
                        .distinct()
                    if m and a
                }),
            }
        }
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    """Return a fresh snapshot of the currently authenticated user.

    The frontend calls this on app boot (and whenever it wants to refresh
    sidebar / permission state) so that role/permission/brand changes
    made by an admin propagate without requiring the user to log out.

    Mirrors the `user` object returned by `login`.
    """
    user = request.user
    return Response({
        'success': True,
        'data': {
            'id': user.id,
            'username': user.username,
            'roles': user.role_names,
            'brand': user.brand_name,
            'brands': list(user.brands.values_list('name', flat=True)),
            'brand_ids': list(user.brands.values_list('id', flat=True)),
            'must_change_password': user.must_change_password,
            'permissions': sorted({
                f'{m}:{a}'
                for m, a in user.roles
                    .values_list(
                        'role_permissions__permission__module',
                        'role_permissions__permission__action'
                    )
                    .distinct()
                if m and a
            }),
        }
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def refresh_token(request):
    token = (request.data.get('refresh_token') or '').strip()

    if not token:
        return Response(
            {'success': False, 'message': 'Refresh token is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        return Response(
            {'success': False, 'message': 'Refresh token has expired. Please login again.'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    except jwt.InvalidTokenError:
        return Response(
            {'success': False, 'message': 'Invalid refresh token.'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    if payload.get('type') != 'refresh':
        return Response(
            {'success': False, 'message': 'Invalid token type.'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    # Check token exists in DB (not logged out)
    try:    
        token_obj = UserToken.objects.get(refresh_token=token)
    except UserToken.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Token not found. Please login again.'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    try:
        user = User.objects.get(id=payload['user_id'])
    except User.DoesNotExist:
        return Response(
            {'success': False, 'message': 'User not found.'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    if user.status != 'Active':
        return Response(
            {'success': False, 'message': 'Account is inactive.'},
            status=status.HTTP_403_FORBIDDEN
        )

    new_access_token = generate_access_token(user)

    return Response({
        'success': True,
        'message': 'Token refreshed.',
        'data': {
            'access_token': new_access_token,
        }
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    token = request.data.get('refresh_token', '').strip()

    if not token:
        return Response(
            {'success': False, 'message': 'Refresh token is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    deleted, _ = UserToken.objects.filter(
        user=request.user, refresh_token=token
    ).delete()

    if not deleted:
        return Response(
            {'success': False, 'message': 'Token not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    log_audit_event(
        request,
        module='auth',
        action='logout',
        description=f'User "{request.user.username}" logged out.',
        entity_type='user',
        entity_id=request.user.id,
        entity_label=request.user.username,
    )

    return Response({
        'success': True,
        'message': 'Logged out successfully.'
    }, status=status.HTTP_200_OK)


# ─── Helper ───────────────────────────────────────────────────────────────────

def format_user(user):
    role_objs = [
        {'id': r.id, 'name': r.name}
        for r in user.roles.all()
    ]
    brand_objs = [
        {'id': b.id, 'name': b.name}
        for b in user.brands.all()
    ]
    return {
        'id':           user.id,
        'username':     user.username,
        'roles':        [r['name'] for r in role_objs],
        'role_ids':     [r['id']   for r in role_objs],
        'role_objects': role_objs,
        # Legacy single-brand fields (kept for backwards compatibility).
        'brand':        user.brand_name,
        'brand_id':     user.brand_id,
        # Multi-brand access scope (BBAC source of truth).
        'brands':       [b['name'] for b in brand_objs],
        'brand_ids':    [b['id']   for b in brand_objs],
        'brand_objects': brand_objs,
        'status':       user.status,
        'must_change_password': user.must_change_password,
        'last_login':   user.last_login.strftime('%Y-%m-%d %H:%M:%S') if user.last_login else None,
        'created_by':   user.created_by.username if user.created_by else None,
        'created_at':   user.created_at.strftime('%Y-%m-%d %H:%M:%S'),
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def audit_log_list(request):
    is_export = str(request.query_params.get('export', '')).lower() in ('1', 'true', 'yes')
    required_perm = 'auditlog:export' if is_export else 'auditlog:view'
    if not has_perm(request, required_perm):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    _allowed_sort_fields = {
        'created_at', '-created_at', 'username', '-username',
        'module', '-module', 'action', '-action',
        'entity_label', '-entity_label', 'description', '-description',
        'ip_address', '-ip_address',
    }
    ordering = (request.query_params.get('ordering') or '').strip()
    if ordering not in _allowed_sort_fields:
        ordering = '-created_at'
    logs = AuditLog.objects.select_related('actor').all().order_by(ordering, '-id')

    # Tenant isolation: show rows whose actor shares any brand with the requester,
    # PLUS system-generated rows (actor is NULL, e.g. failed logins, scheduled
    # jobs) so they aren't silently hidden from non-Admin viewers.
    brand_ids = current_brand_ids(request)
    if not brand_ids:
        logs = logs.none()
    else:
        logs = logs.filter(
            Q(actor__brands__in=brand_ids) | Q(actor__isnull=True)
        ).distinct()

    search = (request.query_params.get('search') or '').strip()
    module = (request.query_params.get('module') or '').strip()
    action = (request.query_params.get('action') or '').strip()
    from_date = parse_date((request.query_params.get('from_date') or '').strip())
    to_date = parse_date((request.query_params.get('to_date') or '').strip())

    if search:
        logs = logs.filter(
            Q(username__icontains=search)
            | Q(module__icontains=search)
            | Q(action__icontains=search)
            | Q(entity_type__icontains=search)
            | Q(entity_label__icontains=search)
            | Q(description__icontains=search)
            | Q(ip_address__icontains=search)
        )
    if module:
        logs = logs.filter(module=module)
    if action:
        logs = logs.filter(action=action)
    if from_date:
        logs = logs.filter(created_at__date__gte=from_date)
    if to_date:
        logs = logs.filter(created_at__date__lte=to_date)

    try:
        page = max(int(request.query_params.get('page', 1) or 1), 1)
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.query_params.get('page_size', 20) or 20)
    except (TypeError, ValueError):
        page_size = 20
    page_size = min(max(page_size, 1), 100)

    paginator = Paginator(logs, page_size)
    current_page = paginator.get_page(page)

    return Response({
        'success': True,
        'data': [format_audit_log(log) for log in current_page.object_list],
        'pagination': {
            'page': current_page.number,
            'page_size': page_size,
            'total_rows': paginator.count,
            'total_pages': paginator.num_pages,
        },
    }, status=status.HTTP_200_OK)


# ─── User CRUD ────────────────────────────────────────────────────────────────

def create_user(request):
    if not has_perm(request, 'user:create'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    username   = request.data.get('username', '').strip()
    # Multi-brand assignment (preferred): list of brand IDs.
    raw_brand_ids = request.data.get('brand_ids')
    # Legacy single-brand input (still accepted for backwards compatibility).
    brand_name = (request.data.get('brand') or '').strip()
    # Accept role IDs (most precise) OR role names (now globally unique)
    role_ids   = request.data.get('role_ids')
    role_names = request.data.get('roles')
    if role_ids is None and role_names is None:
        single = (request.data.get('role') or '').strip()
        role_names = [single] if single else []

    if not username or not (role_ids or role_names):
        return Response(
            {'success': False, 'message': 'username and at least one role are required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {'success': False, 'message': 'Username already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Resolve target brands (multi). Prefer `brand_ids`; fall back to legacy `brand`.
    target_brand_ids = []
    if raw_brand_ids is not None:
        try:
            target_brand_ids = [int(x) for x in raw_brand_ids]
        except (TypeError, ValueError):
            return Response(
                {'success': False, 'message': 'brand_ids must be a list of integers.'},
                status=status.HTTP_400_BAD_REQUEST
            )
    elif brand_name:
        try:
            target_brand_ids = [Brand.objects.get(name=brand_name).id]
        except Brand.DoesNotExist:
            return Response(
                {'success': False, 'message': f'Brand "{brand_name}" not found.'},
                status=status.HTTP_400_BAD_REQUEST
            )

    if not target_brand_ids:
        return Response(
            {'success': False, 'message': 'At least one brand must be assigned.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    target_brands = list(Brand.objects.filter(id__in=target_brand_ids))
    if len(target_brands) != len(set(target_brand_ids)):
        return Response(
            {'success': False, 'message': 'One or more brands not found.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Note: the 'user:create' permission gate above is the authority for who may
    # assign brands. We intentionally do NOT restrict the assignable set to the
    # creator's own brands — user managers must be able to grant access to any
    # brand even if they personally are not assigned to it.

    # Primary brand = first selected (legacy single-FK field).
    primary_brand = target_brands[0]

    if role_ids:
        try:
            role_ids = [int(x) for x in role_ids]
        except (TypeError, ValueError):
            return Response(
                {'success': False, 'message': 'role_ids must be a list of integers.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        roles = list(Role.objects.filter(id__in=role_ids))
        if len(roles) != len(set(role_ids)):
            return Response(
                {'success': False, 'message': 'One or more roles not found.'},
                status=status.HTTP_400_BAD_REQUEST
            )
    else:
        role_names = [r.strip() for r in role_names if r and r.strip()]
        roles = list(Role.objects.filter(name__in=role_names))
        found_names = {r.name for r in roles}
        missing = [n for n in role_names if n not in found_names]
        if missing:
            return Response(
                {'success': False, 'message': f'Role(s) not found: {", ".join(missing)}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

    new_user = User.objects.create(
        username=username,
        password=hash_password(DEFAULT_USER_PASSWORD),
        brand=primary_brand,
        status='Active',
        must_change_password=True,
        created_by=request.user,
    )
    new_user.brands.set(target_brands)
    for role in roles:
        UserRole.objects.create(user=new_user, role=role)

    log_audit_event(
        request,
        module='user',
        action='create',
        description=f'User "{new_user.username}" created.',
        entity_type='user',
        entity_id=new_user.id,
        entity_label=new_user.username,
        details={
            'brands': [b.name for b in target_brands],
            'roles': [role.name for role in roles],
            'status': new_user.status,
            'default_password_assigned': True,
        },
    )

    return Response({
        'success': True,
        'message': f'User created successfully. Default password is {DEFAULT_USER_PASSWORD}.',
        'data': format_user(new_user)
    }, status=status.HTTP_201_CREATED)


def get_users(request):
    if not has_perm(request, 'user:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    all_users = User.objects.select_related('created_by', 'brand').prefetch_related('roles', 'brands').all()
    # Tenant isolation: show users that share any brand with the requester.
    # Exception: if the requester is an Admin with no brands yet (bootstrap
    # scenario — no brands have been created), show all users unfiltered.
    from app.tenancy import current_brand_ids, is_admin
    if not (is_admin(request) and not current_brand_ids(request)):
        all_users = scope_to_brand(all_users, request, brand_field='brands')
    return Response({
        'success': True,
        'data': [format_user(u) for u in all_users]
    }, status=status.HTTP_200_OK)


def get_user(request, user_id):
    if not has_perm(request, 'user:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        user = User.objects.select_related('created_by', 'brand').prefetch_related('roles').get(id=user_id)
    except User.DoesNotExist:
        return Response(
            {'success': False, 'message': 'User not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    assert_same_brand(request, user)

    return Response({
        'success': True,
        'data': format_user(user)
    }, status=status.HTTP_200_OK)


def update_user(request, user_id):
    if not has_perm(request, 'user:update'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response(
            {'success': False, 'message': 'User not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    assert_same_brand(request, user)

    previous_user = {
        'username': user.username,
        'brands':   list(user.brands.values_list('name', flat=True)),
        'roles':    list(user.roles.values_list('name', flat=True)),
        'status':   user.status,
    }

    new_username = request.data.get('username')
    # Multi-brand assignment (preferred)
    raw_brand_ids = request.data.get('brand_ids')
    # Legacy single-brand input (still accepted for backwards compatibility)
    brand_name   = request.data.get('brand')
    # Accept role IDs (most precise) OR role names (globally unique now)
    role_ids     = request.data.get('role_ids')
    role_names   = request.data.get('roles')
    if role_ids is None and role_names is None and 'role' in request.data:
        single = (request.data.get('role') or '').strip()
        role_names = [single] if single else []
    new_status   = request.data.get('status')
    new_password = request.data.get('password')

    if new_username:
        if User.objects.filter(username=new_username).exclude(id=user_id).exists():
            return Response(
                {'success': False, 'message': 'Username already taken.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user.username = new_username

    # Brand assignment update (multi-brand). Preferred path: brand_ids list.
    # Legacy path (single `brand` name) is still honored — treated as a 1-element list.
    new_brands = None  # type: list[Brand] | None
    if raw_brand_ids is not None:
        try:
            wanted_ids = [int(x) for x in raw_brand_ids]
        except (TypeError, ValueError):
            return Response(
                {'success': False, 'message': 'brand_ids must be a list of integers.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not wanted_ids:
            return Response(
                {'success': False, 'message': 'At least one brand must be assigned.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        new_brands = list(Brand.objects.filter(id__in=wanted_ids))
        if len(new_brands) != len(set(wanted_ids)):
            return Response(
                {'success': False, 'message': 'One or more brands not found.'},
                status=status.HTTP_400_BAD_REQUEST
            )
    elif brand_name is not None:
        brand_name = brand_name.strip()
        if brand_name == '':
            return Response(
                {'success': False, 'message': 'At least one brand must be assigned.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            new_brands = [Brand.objects.get(name=brand_name)]
        except Brand.DoesNotExist:
            return Response(
                {'success': False, 'message': f'Brand "{brand_name}" not found.'},
                status=status.HTTP_400_BAD_REQUEST
            )

    if new_brands is not None:
        # The 'user:update' permission gate already controls access here; user
        # managers may grant any brand to a user, regardless of their own scope.
        user.brands.set(new_brands)
        # Keep legacy single-FK primary brand in sync with the first assignment.
        user.brand = new_brands[0]

    if role_ids is not None or role_names is not None:
        if role_ids is not None:
            try:
                role_ids = [int(x) for x in role_ids]
            except (TypeError, ValueError):
                return Response(
                    {'success': False, 'message': 'role_ids must be a list of integers.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if not role_ids:
                return Response(
                    {'success': False, 'message': 'At least one role is required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            roles = list(Role.objects.filter(id__in=role_ids))
            if len(roles) != len(set(role_ids)):
                return Response(
                    {'success': False, 'message': 'One or more roles not found.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            role_names = [r.strip() for r in role_names if r and r.strip()]
            if not role_names:
                return Response(
                    {'success': False, 'message': 'At least one role is required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            roles = list(Role.objects.filter(name__in=role_names))
            found_names = {r.name for r in roles}
            missing = [n for n in role_names if n not in found_names]
            if missing:
                return Response(
                    {'success': False, 'message': f'Role(s) not found: {", ".join(missing)}.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        UserRole.objects.filter(user=user).delete()
        for role in roles:
            UserRole.objects.create(user=user, role=role)

    if new_status:
        normalized_status = new_status.capitalize()
        if normalized_status not in ('Active', 'Inactive'):
            return Response(
                {'success': False, 'message': 'Status must be "Active" or "Inactive".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user.status = normalized_status

    if new_password:
        password_error = _validate_password_strength(new_password)
        if password_error:
            return Response(
                {'success': False, 'message': password_error},
                status=status.HTTP_400_BAD_REQUEST
            )
        user.password = hash_password(new_password)
        user.must_change_password = True

    user.save()

    log_audit_event(
        request,
        module='user',
        action='update',
        description=f'User "{user.username}" updated.',
        entity_type='user',
        entity_id=user.id,
        entity_label=user.username,
        details=_build_audit_change_details(
            previous_user,
            {
                'username': user.username,
                'brands':   list(user.brands.values_list('name', flat=True)),
                'roles':    list(user.roles.values_list('name', flat=True)),
                'status':   user.status,
                'must_change_password': user.must_change_password,
            },
            {'password_changed': True} if new_password else None,
        ),
    )

    return Response({
        'success': True,
        'message': 'User updated successfully.',
        'data': format_user(user)
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_own_password(request):
    current_password = (request.data.get('current_password') or '').strip()
    new_password = (request.data.get('new_password') or '').strip()

    if not current_password or not new_password:
        return Response(
            {'success': False, 'message': 'Current password and new password are required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not verify_password(current_password, request.user.password):
        return Response(
            {'success': False, 'message': 'Current password is incorrect.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if current_password == new_password:
        return Response(
            {'success': False, 'message': 'New password must be different from the current password.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    password_error = _validate_password_strength(new_password)
    if password_error:
        return Response(
            {'success': False, 'message': password_error},
            status=status.HTTP_400_BAD_REQUEST
        )

    request.user.password = hash_password(new_password)
    request.user.must_change_password = False
    request.user.save(update_fields=['password', 'must_change_password'])

    log_audit_event(
        request,
        module='auth',
        action='change_password',
        description=f'User "{request.user.username}" changed password.',
        entity_type='user',
        entity_id=request.user.id,
        entity_label=request.user.username,
        actor=request.user,
    )

    return Response({
        'success': True,
        'message': 'Password changed successfully.',
        'data': {
            'must_change_password': False,
        }
    }, status=status.HTTP_200_OK)


def delete_user(request, user_id):
    if not has_perm(request, 'user:delete'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    if request.user.id == user_id:
        return Response(
            {'success': False, 'message': 'You cannot delete your own account.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response(
            {'success': False, 'message': 'User not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    assert_same_brand(request, user)

    deleted_username = user.username
    user.delete()
    log_audit_event(
        request,
        module='user',
        action='delete',
        description=f'User "{deleted_username}" deleted.',
        entity_type='user',
        entity_id=user_id,
        entity_label=deleted_username,
    )
    return Response({
        'success': True,
        'message': 'User deleted successfully.'
    }, status=status.HTTP_200_OK)


# ─── Combined route handlers ──────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def user_create(request):
    return create_user(request)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def user_bulk_upload(request):
    import csv, io

    if not has_perm(request, 'user:create'):
        return Response({'success': False, 'message': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

    uploaded = request.FILES.get('file')
    if not uploaded:
        return Response({'success': False, 'message': 'No file uploaded. Send a CSV as form-data field "file".'}, status=status.HTTP_400_BAD_REQUEST)

    if not uploaded.name.lower().endswith('.csv'):
        return Response({'success': False, 'message': 'Only .csv files are accepted.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        text = uploaded.read().decode('utf-8-sig')
    except UnicodeDecodeError:
        return Response({'success': False, 'message': 'File must be UTF-8 encoded.'}, status=status.HTTP_400_BAD_REQUEST)

    reader = csv.DictReader(io.StringIO(text))
    required_cols = {'username', 'brand', 'role'}
    if not required_cols.issubset({c.strip().lower() for c in (reader.fieldnames or [])}):
        return Response(
            {'success': False, 'message': 'CSV must have columns: username, brand, role'},
            status=status.HTTP_400_BAD_REQUEST
        )

    rows = list(reader)
    if not rows:
        return Response({'success': False, 'message': 'CSV file is empty.'}, status=status.HTTP_400_BAD_REQUEST)
    # No hard row cap — frontend uploads in chunks (e.g. 100 rows per request).

    # Pre-load brands and roles into dicts for fast lookup
    brand_map = {b.name.lower(): b for b in Brand.objects.all()}
    role_map  = {r.name.lower(): r for r in Role.objects.all()}

    # Note: the 'user:create' permission gate above is the authority for who may
    # bulk-create users. We do not restrict assignable brands to the uploader's
    # own scope — user managers can onboard staff into any brand.

    created_count = 0
    failed = []
    seen_usernames = set()

    for idx, row in enumerate(rows, start=2):  # row 1 = header
        username   = (row.get('username') or '').strip()
        brand_name = (row.get('brand')    or '').strip()
        role_name  = (row.get('role')     or '').strip()

        def fail(reason):
            failed.append({'row': idx, 'username': username or f'(row {idx})', 'reason': reason})

        if not username:
            fail('username is required'); continue
        if not brand_name:
            fail('brand is required'); continue
        if not role_name:
            fail('role is required'); continue
        if username.lower() in seen_usernames:
            fail('duplicate username in this file'); continue
        if User.objects.filter(username=username).exists():
            fail('username already exists'); continue
        if brand_name.lower() not in brand_map:
            fail(f'brand "{brand_name}" not found'); continue
        if role_name.lower() not in role_map:
            fail(f'role "{role_name}" not found'); continue

        seen_usernames.add(username.lower())
        brand_obj = brand_map[brand_name.lower()]
        role_obj  = role_map[role_name.lower()]

        try:
            with db_transaction.atomic():
                new_user = User.objects.create(
                    username=username,
                    password=hash_password(DEFAULT_USER_PASSWORD),
                    brand=brand_obj,
                    status='Active',
                    must_change_password=True,
                    created_by=request.user,
                )
                new_user.brands.add(brand_obj)
                UserRole.objects.create(user=new_user, role=role_obj)
            created_count += 1
        except Exception as exc:
            fail(str(exc))

    if created_count:
        log_audit_event(
            request,
            module='user',
            action='bulk_create',
            description=f'Bulk uploaded {created_count} user(s)',
            details={'created': created_count, 'failed_count': len(failed), 'default_password_assigned': True},
        )

    return Response({
        'success': True,
        'created': created_count,
        'failed':  failed,
        'message': f'{created_count} user(s) created, {len(failed)} failed.',
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_list(request):
    return get_users(request)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_get(request, user_id):
    return get_user(request, user_id)


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def user_update(request, user_id):
    return update_user(request, user_id)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def user_delete(request, user_id):
    return delete_user(request, user_id)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def rm_jrm_users(request):
    """Return every user who can be assigned as a broker's relationship manager.

    Primary list: roles with `broker:create` but NOT `broker:view_all`.
    Additionally: if the requesting user themselves has `broker:create` (even
    as an overseer role like Admin/MD), they are always included so they can
    manage their own broker portfolio — no hardcoded role names involved.
    """
    overseer_role_ids = Role.objects.filter(
        role_permissions__permission__module='broker',
        role_permissions__permission__action='view_all',
    ).values_list('id', flat=True)

    rm_role_ids = Role.objects.filter(
        role_permissions__permission__module='broker',
        role_permissions__permission__action='create',
    ).exclude(id__in=overseer_role_ids).values_list('id', flat=True)

    users = (
        User.objects
        .select_related('created_by', 'brand')
        .prefetch_related('roles', 'managed_brokers')
        .filter(roles__in=rm_role_ids)
        .distinct()
        .order_by('username')
    )

    # Tenant isolation first.
    users = scope_to_brand(users, request, brand_field='brands')

    # Non-privileged users can only see themselves in this list.
    if not _user_sees_all_brokers(request):
        users = users.filter(id=request.user.id)

    # Only users holding a true RM/JRM-style role (broker:create without
    # broker:view_all) appear here. Admin/Checker/MD-style overseer roles are
    # intentionally excluded even if the requesting user holds broker:create.
    user_list = list(users)

    return Response({
        'success': True,
        'data': [
            {
                'id':           u.id,
                'username':     u.username,
                'roles':        u.role_names,
                'brand':        u.brand_name,
                'status':       u.status,
                'created_by':   u.created_by.username if u.created_by else None,
                'created_at':   u.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                'broker_count': u.managed_brokers.count(),
            }
            for u in user_list
        ]
    }, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Brand CRUD (Admin only)
# ---------------------------------------------------------------------------

def format_brand(brand):
    return {
        'id':         brand.id,
        'name':       brand.name,
        'code':       brand.code,
        'created_at': brand.created_at.strftime('%b %d, %Y') if brand.created_at else '—',
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def brand_create(request):
    if not has_perm(request, 'brand:create'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    name = request.data.get('name', '').strip()
    code = request.data.get('code', '').strip().upper()
    if not name:
        return Response(
            {'success': False, 'message': 'Brand name is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    if not code:
        return Response(
            {'success': False, 'message': 'Brand code is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if Brand.objects.filter(name=name).exists():
        return Response(
            {'success': False, 'message': f'Brand "{name}" already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    if Brand.objects.filter(code=code).exists():
        return Response(
            {'success': False, 'message': f'Code "{code}" already in use.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    brand = Brand.objects.create(name=name, code=code or None)

    # Auto-assign every new brand to all Admin users so they can immediately
    # see and manage it without a manual brand-assignment step. Uses the
    # User.roles M2M (declared on the User model) so we don't depend on
    # related_name conventions of the through table.
    admin_users = User.objects.filter(roles__name='Admin').distinct()
    for admin_user in admin_users:
        admin_user.brands.add(brand)

    log_audit_event(
        request,
        module='brand',
        action='create',
        description=f'Brand "{brand.name}" created.',
        entity_type='brand',
        entity_id=brand.id,
        entity_label=brand.name,
    )
    return Response(
        {'success': True, 'message': 'Brand created successfully.', 'data': format_brand(brand)},
        status=status.HTTP_201_CREATED
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def brand_list(request):
    # Allow any user who can view brokers, clients, or users to read brands.
    # Write operations remain Admin-only (enforced in create/update/delete views).
    can_read = (
        has_perm(request, 'brand:view')
        or has_perm(request, 'broker:view')
        or has_perm(request, 'broker:create')
        or has_perm(request, 'client:view')
    )
    if not can_read:
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    brands = Brand.objects.all().order_by('id')
    # User-management forms need to see every brand so that admins can grant
    # access to brands they themselves do not yet hold. Anyone allowed to
    # create users may request the full list via ?scope=all.
    if request.GET.get('scope') == 'all' and has_perm(request, 'user:create'):
        return Response(
            {'success': True, 'data': [format_brand(b) for b in brands]},
            status=status.HTTP_200_OK
        )
    # Admins see all brands — they manage the brand list itself.
    # All other roles are tenant-isolated to their assigned brands.
    if not is_admin(request):
        ids = current_brand_ids(request)
        brands = brands.filter(id__in=ids) if ids else brands.none()
    return Response(
        {'success': True, 'data': [format_brand(b) for b in brands]},
        status=status.HTTP_200_OK
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def brand_get(request, brand_id):
    if not has_perm(request, 'brand:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        brand = Brand.objects.get(id=brand_id)
    except Brand.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Brand not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    assert_same_brand(request, brand)

    return Response(
        {'success': True, 'data': format_brand(brand)},
        status=status.HTTP_200_OK
    )


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def brand_update(request, brand_id):
    if not has_perm(request, 'brand:update'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        brand = Brand.objects.get(id=brand_id)
    except Brand.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Brand not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    assert_same_brand(request, brand)

    name = request.data.get('name', '').strip()
    code = request.data.get('code', '').strip().upper()
    if not name:
        return Response(
            {'success': False, 'message': 'Brand name is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    if not code:
        return Response(
            {'success': False, 'message': 'Brand code is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if Brand.objects.filter(name=name).exclude(id=brand_id).exists():
        return Response(
            {'success': False, 'message': f'Brand "{name}" already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    if Brand.objects.filter(code=code).exclude(id=brand_id).exists():
        return Response(
            {'success': False, 'message': f'Code "{code}" already in use.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    previous_brand = {
        'name': brand.name,
        'code': brand.code,
    }
    brand.name = name
    brand.code = code or None
    brand.save()
    log_audit_event(
        request,
        module='brand',
        action='update',
        description=f'Brand "{previous_brand["name"]}" updated.',
        entity_type='brand',
        entity_id=brand.id,
        entity_label=brand.name,
        details=_build_audit_change_details(
            previous_brand,
            {
                'name': brand.name,
                'code': brand.code,
            },
        ),
    )
    return Response(
        {'success': True, 'message': 'Brand updated successfully.', 'data': format_brand(brand)},
        status=status.HTTP_200_OK
    )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def brand_delete(request, brand_id):
    if not has_perm(request, 'brand:delete'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        brand = Brand.objects.get(id=brand_id)
    except Brand.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Brand not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    assert_same_brand(request, brand)

    deleted_brand_name = brand.name
    try:
        brand.delete()
    except ProtectedError:
        return Response(
            {'success': False, 'message': f'Cannot delete "{deleted_brand_name}" — it is still assigned to users or brokers. Reassign them first.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    log_audit_event(
        request,
        module='brand',
        action='delete',
        description=f'Brand "{deleted_brand_name}" deleted.',
        entity_type='brand',
        entity_id=brand_id,
        entity_label=deleted_brand_name,
    )
    return Response(
        {'success': True, 'message': 'Brand deleted successfully.'},
        status=status.HTTP_200_OK
    )


# ---------------------------------------------------------------------------
# Permission APIs (Admin only — read-only, permissions are seeded)
# ---------------------------------------------------------------------------

def format_permission(permission):
    return {
        'id':     permission.id,
        'module': permission.module,
        'action': permission.action,
        'key':    f'{permission.module}:{permission.action}',
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def permission_list(request):
    if not has_perm(request, 'role:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    permissions = Permission.objects.all().order_by('module', 'action')
    return Response(
        {'success': True, 'data': [format_permission(p) for p in permissions]},
        status=status.HTTP_200_OK
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def permission_get(request, permission_id):
    if not has_perm(request, 'role:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        permission = Permission.objects.get(id=permission_id)
    except Permission.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Permission not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    return Response(
        {'success': True, 'data': format_permission(permission)},
        status=status.HTTP_200_OK
    )


# ---------------------------------------------------------------------------
# Role CRUD (Admin only)
# ---------------------------------------------------------------------------

def format_role(role):
    return {
        'id':               role.id,
        'name':             role.name,
        'description':      role.description,
        'status':           role.status,
        'permission_count': role.role_permissions.count(),
        'permissions': [
            format_permission(rp.permission)
            for rp in role.role_permissions.select_related('permission').all()
        ],
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def role_create(request):
    if not has_perm(request, 'role:create'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    name        = request.data.get('name', '').strip()
    description = request.data.get('description', '').strip()
    role_status = request.data.get('status', 'Active').strip().capitalize()

    if not name:
        return Response(
            {'success': False, 'message': 'Role name is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if role_status not in ('Active', 'Inactive'):
        role_status = 'Active'

    if Role.objects.filter(name=name).exists():
        return Response(
            {'success': False, 'message': f'Role "{name}" already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    role = Role.objects.create(
        name=name, description=description, status=role_status
    )

    # Assign permissions if provided
    permission_ids = request.data.get('permissions', [])
    if isinstance(permission_ids, list) and permission_ids:
        perms = Permission.objects.filter(id__in=permission_ids)
        for perm in perms:
            RolePermission.objects.get_or_create(role=role, permission=perm)

    log_audit_event(
        request,
        module='role',
        action='create',
        description=f'Role "{role.name}" created.',
        entity_type='role',
        entity_id=role.id,
        entity_label=role.name,
        details={'status': role.status, 'permission_ids': permission_ids or []},
    )

    return Response(
        {'success': True, 'message': 'Role created successfully.', 'data': format_role(role)},
        status=status.HTTP_201_CREATED
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def role_list(request):
    if not has_perm(request, 'role:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    roles = Role.objects.prefetch_related('role_permissions__permission').all().order_by('id')
    return Response(
        {'success': True, 'data': [format_role(r) for r in roles]},
        status=status.HTTP_200_OK
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def role_get(request, role_id):
    if not has_perm(request, 'role:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        role = Role.objects.prefetch_related('role_permissions__permission').get(id=role_id)
    except Role.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Role not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    return Response(
        {'success': True, 'data': format_role(role)},
        status=status.HTTP_200_OK
    )


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def role_update(request, role_id):
    if not has_perm(request, 'role:update'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        role = Role.objects.get(id=role_id)
    except Role.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Role not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    name        = request.data.get('name', '').strip()
    description = request.data.get('description')
    role_status = request.data.get('status')

    if not name:
        return Response(
            {'success': False, 'message': 'Role name is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if Role.objects.filter(name=name).exclude(id=role_id).exists():
        return Response(
            {'success': False, 'message': f'Role "{name}" already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    previous_role = {
        'name': role.name,
        'description': role.description,
        'status': role.status,
        'permission_ids': list(
            RolePermission.objects.filter(role=role).values_list('permission_id', flat=True)
        ),
    }
    role.name = name
    if description is not None:
        role.description = description.strip()
    if role_status is not None:
        normalized = role_status.strip().capitalize()
        if normalized in ('Active', 'Inactive'):
            role.status = normalized
    role.save()

    # Sync permissions if provided
    permission_ids = request.data.get('permissions')
    if permission_ids is not None and isinstance(permission_ids, list):
        if permission_ids:
            perms = Permission.objects.filter(id__in=permission_ids)
            if perms.count() != len(permission_ids):
                return Response(
                    {'success': False, 'message': 'One or more permission IDs are invalid.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        RolePermission.objects.filter(role=role).delete()
        for perm in Permission.objects.filter(id__in=permission_ids):
            RolePermission.objects.create(role=role, permission=perm)

    log_audit_event(
        request,
        module='role',
        action='update',
        description=f'Role "{previous_role["name"]}" updated.',
        entity_type='role',
        entity_id=role.id,
        entity_label=role.name,
        details=_build_audit_change_details(
            previous_role,
            {
                'name': role.name,
                'description': role.description,
                'status': role.status,
                'permission_ids': previous_role['permission_ids'] if permission_ids is None else permission_ids,
            },
        ),
    )

    return Response(
        {'success': True, 'message': 'Role updated successfully.', 'data': format_role(role)},
        status=status.HTTP_200_OK
    )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def role_delete(request, role_id):
    if not has_perm(request, 'role:delete'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        role = Role.objects.get(id=role_id)
    except Role.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Role not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if User.objects.filter(roles=role).exists():
        return Response(
            {'success': False, 'message': 'Cannot delete role that is assigned to users.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    deleted_role_name = role.name
    role.delete()
    log_audit_event(
        request,
        module='role',
        action='delete',
        description=f'Role "{deleted_role_name}" deleted.',
        entity_type='role',
        entity_id=role_id,
        entity_label=deleted_role_name,
    )
    return Response(
        {'success': True, 'message': 'Role deleted successfully.'},
        status=status.HTTP_200_OK
    )


# ---------------------------------------------------------------------------
# Role-Permission Assignment (Admin only)
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def role_assign_permissions(request, role_id):
    """Assign permissions to a role. Accepts a list of permission IDs."""
    if not has_perm(request, 'role:update'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        role = Role.objects.get(id=role_id)
    except Role.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Role not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    permission_ids = request.data.get('permission_ids', [])
    if not isinstance(permission_ids, list) or not permission_ids:
        return Response(
            {'success': False, 'message': 'permission_ids must be a non-empty list.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    permissions = Permission.objects.filter(id__in=permission_ids)
    if permissions.count() != len(permission_ids):
        return Response(
            {'success': False, 'message': 'One or more permission IDs are invalid.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    assigned = []
    already_exists = []
    for perm in permissions:
        _, created = RolePermission.objects.get_or_create(role=role, permission=perm)
        if created:
            assigned.append(format_permission(perm))
        else:
            already_exists.append(format_permission(perm))

    log_audit_event(
        request,
        module='role',
        action='assign_permissions',
        description=f'Permissions assigned to role "{role.name}".',
        entity_type='role',
        entity_id=role.id,
        entity_label=role.name,
        details={'permission_ids': permission_ids, 'new_assignments': len(assigned), 'already_existed': len(already_exists)},
    )

    return Response({
        'success': True,
        'message': f'{len(assigned)} permission(s) assigned.',
        'assigned': assigned,
        'already_existed': already_exists,
        'role': format_role(role),
    }, status=status.HTTP_200_OK)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def role_remove_permissions(request, role_id):
    """Remove permissions from a role. Accepts a list of permission IDs."""
    if not has_perm(request, 'role:update'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        role = Role.objects.get(id=role_id)
    except Role.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Role not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    permission_ids = request.data.get('permission_ids', [])
    if not isinstance(permission_ids, list) or not permission_ids:
        return Response(
            {'success': False, 'message': 'permission_ids must be a non-empty list.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    deleted_count, _ = RolePermission.objects.filter(
        role=role, permission_id__in=permission_ids
    ).delete()

    log_audit_event(
        request,
        module='role',
        action='remove_permissions',
        description=f'Permissions removed from role "{role.name}".',
        entity_type='role',
        entity_id=role.id,
        entity_label=role.name,
        details={'permission_ids': permission_ids, 'removed_count': deleted_count},
    )

    return Response({
        'success': True,
        'message': f'{deleted_count} permission(s) removed.',
        'role': format_role(role),
    }, status=status.HTTP_200_OK)


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def role_set_permissions(request, role_id):
    """Replace all permissions of a role with the given list of permission IDs."""
    if not has_perm(request, 'role:update'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        role = Role.objects.get(id=role_id)
    except Role.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Role not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    permission_ids = request.data.get('permission_ids', [])
    if not isinstance(permission_ids, list):
        return Response(
            {'success': False, 'message': 'permission_ids must be a list.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if permission_ids:
        permissions = Permission.objects.filter(id__in=permission_ids)
        if permissions.count() != len(permission_ids):
            return Response(
                {'success': False, 'message': 'One or more permission IDs are invalid.'},
                status=status.HTTP_400_BAD_REQUEST
            )
    else:
        permissions = []

    RolePermission.objects.filter(role=role).delete()
    for perm in permissions:
        RolePermission.objects.create(role=role, permission=perm)

    log_audit_event(
        request,
        module='role',
        action='set_permissions',
        description=f'Role permissions replaced for "{role.name}".',
        entity_type='role',
        entity_id=role.id,
        entity_label=role.name,
        details={'permission_ids': permission_ids},
    )

    return Response({
        'success': True,
        'message': 'Role permissions updated successfully.',
        'role': format_role(role),
    }, status=status.HTTP_200_OK)


# ===========================================================================
# Permission helpers
# ===========================================================================

def has_perm(request, key):
    """Return True if any of the user's roles currently grants the given
    permission key (e.g. 'broker:create').

    Always evaluated against the database. The JWT is treated as identity
    only — never as a permission cache — so that any change an admin makes
    to a role's permission set (or a user's role assignments) takes effect
    on the very next request, without forcing the affected user to log out
    and back in. This is what makes "create any role / assign any
    permission" behave correctly regardless of role name.
    """
    user = getattr(request, 'user', None)
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    try:
        module, action = key.split(':', 1)
    except ValueError:
        return False
    return RolePermission.objects.filter(
        role__in=user.roles.all(),
        permission__module=module,
        permission__action=action,
    ).exists()


def user_brand_names(request):
    """Brand names assigned to the current user (JWT payload first, else DB)."""
    if request.auth:
        names = request.auth.get('brand_names')
        if names is not None:
            return list(names)
        # Fallback for older tokens.
        b = request.auth.get('brand')
        return [b] if b else []
    if not getattr(request, 'user', None):
        return []
    return list(request.user.brand_names)


# ===========================================================================
# Broker CRUD
# ===========================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def brokers_by_rm_user(request, user_id):
    """Return all broker companies assigned to a specific RM/JRM user."""
    if not has_perm(request, 'broker:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )
    try:
        rm_user = User.objects.prefetch_related('roles').get(id=user_id)
    except User.DoesNotExist:
        return Response({'success': False, 'message': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Tenant isolation: non-Admin cannot drill into a foreign-brand RM.
    assert_same_brand(request, rm_user)

    # Non-privileged users can only drill into themselves, and only see brokers they created.
    if not _user_sees_all_brokers(request):
        if rm_user.id != request.user.id:
            return Response(
                {'success': False, 'message': 'Access denied.'},
                status=status.HTTP_403_FORBIDDEN
            )
        brokers = (
            Broker.objects
            .select_related('brand', 'created_by', 'rm_user')
            .prefetch_related('payouts')
            .annotate(client_count=Count('clients'))
            .filter(created_by=request.user)
            .order_by('id')
        )
    else:
        brokers = (
            Broker.objects
            .select_related('brand', 'created_by', 'rm_user')
            .prefetch_related('payouts')
            .annotate(client_count=Count('clients'))
            .filter(rm_user=rm_user)
            .order_by('id')
        )

    month_param = request.query_params.get('month', '').strip()  # format: YYYY-MM
    if month_param:
        try:
            month_date = parse_date(month_param + '-01')
            if month_date is None:
                raise ValueError()

            month_start, _, month_start_dt, next_month_dt = _month_bounds(month_date)

            broker_ids = list(brokers.values_list('id', flat=True))
            active_client_rows = list(
                ClientTransaction.objects
                .filter(
                    client__broker_id__in=broker_ids,
                    created_at__gte=month_start_dt,
                    created_at__lt=next_month_dt,
                )
                .values('client_id', 'client__broker_id')
                .distinct()
            )

            active_broker_ids = {row['client__broker_id'] for row in active_client_rows}
            if not active_broker_ids:
                return Response({
                    'success': True,
                    'rm_user': {
                        'id': rm_user.id,
                        'username': rm_user.username,
                        'roles': rm_user.role_names,
                        'brand': rm_user.brand_name,
                    },
                    'data': [],
                }, status=status.HTTP_200_OK)

            brokers = brokers.filter(id__in=active_broker_ids)
            broker_ids = list(brokers.values_list('id', flat=True))
            client_to_broker = {row['client_id']: row['client__broker_id'] for row in active_client_rows if row['client__broker_id'] in active_broker_ids}
            client_ids = list(client_to_broker.keys())

            monthly_leg_map = {
                row['client_id']: row['legitimacy_status']
                for row in ClientMonthlyLegitimacy.objects.filter(
                    client_id__in=client_ids,
                    month=month_start,
                ).values('client_id', 'legitimacy_status')
            }

            client_monthly_deposits = {}
            broker_monthly_withdrawals = {broker_id: Decimal('0') for broker_id in broker_ids}
            active_clients_by_broker = {broker_id: set() for broker_id in broker_ids}

            txn_rows = (
                ClientTransaction.objects
                .filter(client_id__in=client_ids, created_at__gte=month_start_dt, created_at__lt=next_month_dt)
                .values('client_id', 'transaction_type')
                .annotate(total=Sum('amount'))
            )

            for row in txn_rows:
                client_id = row['client_id']
                broker_id = client_to_broker.get(client_id)
                if broker_id is None:
                    continue
                total = row['total'] or Decimal('0')
                active_clients_by_broker[broker_id].add(client_id)
                if row['transaction_type'] == 'deposit':
                    client_monthly_deposits[client_id] = total
                else:
                    broker_monthly_withdrawals[broker_id] += total

            broker_monthly_earned = {broker_id: Decimal('0') for broker_id in broker_ids}
            for client_id, deposit_total in client_monthly_deposits.items():
                if monthly_leg_map.get(client_id, 'pending') != 'approved':
                    continue
                broker_id = client_to_broker.get(client_id)
                if broker_id is None:
                    continue
                broker_monthly_earned[broker_id] += (deposit_total * Decimal('0.01'))

            payout_rows = (
                BrokerPayout.objects
                .filter(broker_id__in=broker_ids, created_at__gte=month_start_dt, created_at__lt=next_month_dt)
                .values('broker_id')
                .annotate(
                    paid=Sum('amount'),
                    declined=Sum('decline_amount'),
                    last_paid_at=Max('created_at'),
                )
            )
            payout_map = {
                row['broker_id']: {
                    'paid': row['paid'] or Decimal('0'),
                    'declined': row['declined'] or Decimal('0'),
                    'last_paid_at': row['last_paid_at'],
                }
                for row in payout_rows
            }

            data = []
            for broker in brokers:
                broker_id = broker.id
                if not active_clients_by_broker.get(broker_id):
                    continue
                earned = broker_monthly_earned.get(broker_id, Decimal('0'))
                payout_info = payout_map.get(broker_id, {})
                paid = payout_info.get('paid', Decimal('0'))
                declined = payout_info.get('declined', Decimal('0'))
                pending = earned - paid - declined
                if pending < 0:
                    pending = Decimal('0')

                rm = broker.rm_user
                data.append({
                    'id': broker.id,
                    'arc_id': broker.arc_id,
                    'name': broker.name,
                    'brand': {'id': broker.brand.id, 'name': broker.brand.name},
                    'rm_user': {'id': rm.id, 'username': rm.username, 'roles': rm.role_names} if rm else None,
                    'amount_earned': str(round(earned, 2)),
                    'amount_paid': str(round(paid, 2)),
                    'amount_declined': str(round(declined, 2)),
                    'pending_payout': str(round(pending, 2)),
                    'last_paid_at': payout_info.get('last_paid_at').isoformat() if payout_info.get('last_paid_at') else None,
                    'status': broker.status,
                    'client_count': len(active_clients_by_broker.get(broker_id, set())),
                    'created_by': broker.created_by.username if broker.created_by else None,
                    'created_at': broker.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                })

            return Response({
                'success': True,
                'rm_user': {
                    'id': rm_user.id,
                    'username': rm_user.username,
                    'roles': rm_user.role_names,
                    'brand': rm_user.brand_name,
                },
                'data': data,
            }, status=status.HTTP_200_OK)
        except (ValueError, AttributeError):
            return Response(
                {'success': False, 'message': 'Invalid month format. Use YYYY-MM.'},
                status=status.HTTP_400_BAD_REQUEST
            )

    return Response({
        'success': True,
        'rm_user': {
            'id':       rm_user.id,
            'username': rm_user.username,
            'roles':    rm_user.role_names,
            'brand':    rm_user.brand_name,
        },
        'data': [format_broker(b) for b in brokers],
    }, status=status.HTTP_200_OK)


def format_broker(broker):
    rm = broker.rm_user
    last_paid_at = broker.last_paid_at
    return {
        'id':            broker.id,
        'arc_id':        broker.arc_id,
        'name':          broker.name,
        'brand':         {'id': broker.brand.id, 'name': broker.brand.name},
        'rm_user':       {'id': rm.id, 'username': rm.username, 'roles': rm.role_names} if rm else None,
        'amount_earned': str(broker.amount_earned),
        'amount_paid':   str(broker.amount_paid),
        'amount_declined': str(broker.amount_declined),
        'pending_payout': str(broker.pending_payout),
        'last_paid_at':  last_paid_at.isoformat() if last_paid_at else None,
        'status':        broker.status,
        'client_count':  getattr(broker, 'client_count', broker.clients.count()),
        'created_by':    broker.created_by.username if broker.created_by else None,
        'created_at':    broker.created_at.strftime('%Y-%m-%d %H:%M:%S'),
    }


def format_broker_payout(payout):
    return {
        'id': payout.id,
        'amount': str(payout.amount),
        'decline_amount': str(getattr(payout, 'decline_amount', 0) or 0),
        'paid_by': payout.paid_by.username if payout.paid_by_id else None,
        'created_at': payout.created_at.isoformat() if payout.created_at else None,
    }


def _user_sees_all_brokers(request):
    """Permission-driven: a user sees every broker within their brand scope
    when their role grants `broker:view_all`. Otherwise they only see brokers
    they personally created.

    `broker:view_all` is the explicit "see everyone's brokers in my brand"
    permission (seeded for Admin and Checker, grantable to any custom role).
    Without it, even users with `broker:view` only see their own pipeline.
    """
    return has_perm(request, 'broker:view_all')


def _check_broker_access(request, broker):
    """Tenant + role check for a single broker.
    1) Brand isolation (Admin bypasses).
    2) Within the brand, Admin/Checker see all; RM/JRM see only their own."""
    if not has_brand_access(request, broker):
        return False
    if _user_sees_all_brokers(request):
        return True
    return broker.created_by_id == request.user.id


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def broker_create(request):
    if not has_perm(request, 'broker:create'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    arc_id      = request.data.get('arc_id', '').strip()
    name        = request.data.get('name', '').strip()
    brand_name  = request.data.get('brand', '').strip()
    rm_user_id  = request.data.get('rm_user_id')

    if not arc_id or not name or not brand_name:
        return Response(
            {'success': False, 'message': 'ark_id, name, and brand are required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        brand = Brand.objects.get(name=brand_name)
    except Brand.DoesNotExist:
        return Response(
            {'success': False, 'message': f'Brand "{brand_name}" not found.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Tenant isolation: the brand must be within the creator's brand scope.
    if brand.id not in current_brand_ids(request):
        return Response(
            {'success': False, 'message': 'You can only create brokers in a brand you are assigned to.'},
            status=status.HTTP_403_FORBIDDEN
        )

    if Broker.objects.filter(arc_id=arc_id).exists():
        return Response(
            {'success': False, 'message': f'Broker with ark_id "{arc_id}" already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Validate the user being assigned as broker manager: they must have a
    # role that grants `broker:create` (i.e. any RM-equivalent role, built-in
    # or custom).
    rm_user = None
    if rm_user_id:
        try:
            rm_user = User.objects.prefetch_related('roles').get(id=rm_user_id)
            if not RolePermission.objects.filter(
                role__in=rm_user.roles.all(),
                permission__module='broker',
                permission__action='create',
            ).exists():
                return Response(
                    {'success': False, 'message': 'Assigned user must have a role with broker:create permission.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except User.DoesNotExist:
            return Response(
                {'success': False, 'message': 'Assigned user not found.'},
                status=status.HTTP_400_BAD_REQUEST
            )

    broker = Broker.objects.create(
        arc_id=arc_id,
        name=name,
        brand=brand,
        rm_user=rm_user,
        status='Active',
        created_by=request.user,
    )
    log_audit_event(
        request,
        module='broker',
        action='create',
        description=f'Broker "{broker.name}" created.',
        entity_type='broker',
        entity_id=broker.id,
        entity_label=broker.name,
        details={
            'arc_id': broker.arc_id,
            'brand': broker.brand.name,
            'rm_user': broker.rm_user.username if broker.rm_user else None,
        },
    )
    return Response(
        {'success': True, 'message': 'Broker created successfully.', 'data': format_broker(broker)},
        status=status.HTTP_201_CREATED
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def broker_list(request):
    if not has_perm(request, 'broker:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    brokers = (
        Broker.objects
        .select_related('brand', 'created_by')
        .annotate(client_count=Count('clients'))
        .order_by('id')
    )

    # Brand isolation (now applies to everyone, including Admin).
    brokers = scope_to_brand(brokers, request, brand_field='brand_id')

    # Within the brand, RM/JRM see only their own rows.
    if not _user_sees_all_brokers(request):
        brokers = brokers.filter(created_by=request.user)

    return Response(
        {'success': True, 'data': [format_broker(b) for b in brokers]},
        status=status.HTTP_200_OK
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def broker_get(request, broker_id):
    if not has_perm(request, 'broker:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        broker = (
            Broker.objects
            .select_related('brand', 'created_by', 'rm_user')
            .prefetch_related('payouts')
            .annotate(client_count=Count('clients'))
            .get(id=broker_id)
        )
    except Broker.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Broker not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_broker_access(request, broker):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    return Response(
        {'success': True, 'data': format_broker(broker)},
        status=status.HTTP_200_OK
    )


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def broker_update(request, broker_id):
    if not has_perm(request, 'broker:update'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        broker = Broker.objects.select_related('brand', 'created_by').get(id=broker_id)
    except Broker.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Broker not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_broker_access(request, broker):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    new_arc_id     = request.data.get('arc_id')
    new_name       = request.data.get('name')
    new_brand_name = request.data.get('brand')
    new_status     = request.data.get('status')
    new_rm_user_id = request.data.get('rm_user_id')
    previous_broker = {
        'name': broker.name,
        'arc_id': broker.arc_id,
        'brand': broker.brand.name if broker.brand_id else None,
        'status': broker.status,
        'rm_user': broker.rm_user.username if broker.rm_user_id else None,
    }

    if new_arc_id is not None:
        new_arc_id = new_arc_id.strip()
        if Broker.objects.filter(arc_id=new_arc_id).exclude(id=broker_id).exists():
            return Response(
                {'success': False, 'message': f'ark_id "{new_arc_id}" is already in use.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        broker.arc_id = new_arc_id

    if new_name is not None:
        broker.name = new_name.strip()

    if new_brand_name is not None:
        try:
            target_brand = Brand.objects.get(name=new_brand_name.strip())
        except Brand.DoesNotExist:
            return Response(
                {'success': False, 'message': f'Brand "{new_brand_name}" not found.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        # Tenant isolation: target brand must be in the actor's brand scope.
        if target_brand.id not in current_brand_ids(request):
            return Response(
                {'success': False, 'message': 'You cannot move a broker to a brand outside your scope.'},
                status=status.HTTP_403_FORBIDDEN
            )
        broker.brand = target_brand

    if new_rm_user_id is not None:
        if new_rm_user_id == '':
            broker.rm_user = None
        else:
            try:
                rm_user = User.objects.prefetch_related('roles').get(id=new_rm_user_id)
                if not RolePermission.objects.filter(
                    role__in=rm_user.roles.all(),
                    permission__module='broker',
                    permission__action='create',
                ).exists():
                    return Response(
                        {'success': False, 'message': 'Assigned user must have a role with broker:create permission.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                broker.rm_user = rm_user
            except User.DoesNotExist:
                return Response(
                    {'success': False, 'message': 'Assigned user not found.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

    if new_status is not None:
        normalized = new_status.strip().capitalize()
        if normalized not in ('Active', 'Inactive'):
            return Response(
                {'success': False, 'message': 'Status must be "Active" or "Inactive".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        broker.status = normalized

    broker.save()
    log_audit_event(
        request,
        module='broker',
        action='update',
        description=f'Broker "{broker.name}" updated.',
        entity_type='broker',
        entity_id=broker.id,
        entity_label=broker.name,
        details=_build_audit_change_details(
            previous_broker,
            {
                'name': broker.name,
                'arc_id': broker.arc_id,
                'brand': broker.brand.name if broker.brand_id else None,
                'status': broker.status,
                'rm_user': broker.rm_user.username if broker.rm_user_id else None,
            },
        ),
    )
    return Response(
        {'success': True, 'message': 'Broker updated successfully.', 'data': format_broker(broker)},
        status=status.HTTP_200_OK
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def broker_payout_list(request, broker_id):
    if not has_perm(request, 'broker:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        broker = (
            Broker.objects
            .select_related('brand', 'created_by', 'rm_user')
            .prefetch_related('payouts__paid_by')
            .annotate(client_count=Count('clients'))
            .get(id=broker_id)
        )
    except Broker.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Broker not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_broker_access(request, broker):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    payouts = broker.payouts.select_related('paid_by').all()
    return Response(
        {
            'success': True,
            'broker': format_broker(broker),
            'data': [format_broker_payout(payout) for payout in payouts],
        },
        status=status.HTTP_200_OK
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def broker_payout_create(request, broker_id):
    if not has_perm(request, 'bonus:pay'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        broker = Broker.objects.select_related('brand', 'created_by', 'rm_user').prefetch_related('payouts').get(id=broker_id)
    except Broker.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Broker not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_broker_access(request, broker):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    raw_amount = request.data.get('amount')
    raw_decline = request.data.get('decline_amount', 0)
    try:
        amount = Decimal(str(raw_amount if raw_amount not in (None, '') else 0))
        decline_amount = Decimal(str(raw_decline if raw_decline not in (None, '') else 0))
    except (InvalidOperation, TypeError, ValueError):
        return Response(
            {'success': False, 'message': 'Amount and decline amount must be valid numbers.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if amount < 0 or decline_amount < 0:
        return Response(
            {'success': False, 'message': 'Amount and decline amount cannot be negative.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if amount + decline_amount <= 0:
        return Response(
            {'success': False, 'message': 'Enter a payout amount or a decline amount greater than zero.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    pending_payout = Decimal(str(broker.pending_payout))
    if amount + decline_amount > pending_payout:
        return Response(
            {'success': False, 'message': 'Amount plus decline exceeds pending payout.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    payout = BrokerPayout.objects.create(
        broker=broker,
        amount=amount,
        decline_amount=decline_amount,
        paid_by=request.user,
    )

    broker = Broker.objects.select_related('brand', 'created_by', 'rm_user').prefetch_related('payouts').get(id=broker_id)

    log_audit_event(
        request,
        module='broker',
        action='payout',
        description=f'Broker payout recorded for "{broker.name}".',
        entity_type='broker',
        entity_id=broker.id,
        entity_label=broker.name,
        details={
            'amount': amount,
            'decline_amount': decline_amount,
            'pending_payout': broker.pending_payout,
            'paid_by': request.user.username,
            'paid_at': payout.created_at.isoformat(),
        },
    )

    return Response(
        {'success': True, 'message': 'Broker payout recorded successfully.', 'data': format_broker(broker)},
        status=status.HTTP_201_CREATED
    )


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def broker_payout_update(request, broker_id, payout_id):
    if not has_perm(request, 'bonus:manage'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        payout = BrokerPayout.objects.select_related('broker__brand', 'broker__created_by', 'broker__rm_user', 'paid_by').get(
            id=payout_id,
            broker_id=broker_id,
        )
    except BrokerPayout.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Broker payout not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_broker_access(request, payout.broker):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    raw_amount = request.data.get('amount')
    raw_decline = request.data.get('decline_amount')
    try:
        amount = Decimal(str(raw_amount if raw_amount not in (None, '') else 0))
    except (InvalidOperation, TypeError, ValueError):
        return Response(
            {'success': False, 'message': 'Amount must be a valid number.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    if raw_decline is None:
        decline_amount = Decimal(str(payout.decline_amount or 0))
    else:
        try:
            decline_amount = Decimal(str(raw_decline if raw_decline != '' else 0))
        except (InvalidOperation, TypeError, ValueError):
            return Response(
                {'success': False, 'message': 'Decline amount must be a valid number.'},
                status=status.HTTP_400_BAD_REQUEST
            )

    if amount < 0 or decline_amount < 0:
        return Response(
            {'success': False, 'message': 'Amount and decline amount cannot be negative.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if amount + decline_amount <= 0:
        return Response(
            {'success': False, 'message': 'Enter a payout amount or a decline amount greater than zero.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    broker = payout.broker
    pending_before = Decimal(str(broker.pending_payout))
    allowed_max = pending_before + payout.amount + (payout.decline_amount or 0)
    if amount + decline_amount > allowed_max:
        return Response(
            {'success': False, 'message': 'Amount plus decline exceeds pending payout.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    previous_payout = {
        'amount': str(payout.amount),
        'decline_amount': str(payout.decline_amount or 0),
        'paid_by': payout.paid_by.username if payout.paid_by_id else None,
        'created_at': payout.created_at.isoformat() if payout.created_at else None,
    }

    payout.amount = amount
    payout.decline_amount = decline_amount
    payout.save(update_fields=['amount', 'decline_amount'])

    broker = Broker.objects.select_related('brand', 'created_by', 'rm_user').prefetch_related('payouts').get(id=broker_id)

    log_audit_event(
        request,
        module='broker',
        action='payout_update',
        description=f'Broker payout updated for "{broker.name}".',
        entity_type='broker',
        entity_id=broker.id,
        entity_label=broker.name,
        details=_build_audit_change_details(
            previous_payout,
            {
                'amount': str(payout.amount),
                'decline_amount': str(payout.decline_amount or 0),
                'paid_by': payout.paid_by.username if payout.paid_by_id else None,
                'created_at': payout.created_at.isoformat() if payout.created_at else None,
                'pending_payout': broker.pending_payout,
            },
        ),
    )

    return Response(
        {
            'success': True,
            'message': 'Broker payout updated successfully.',
            'data': format_broker_payout(payout),
            'broker': format_broker(broker),
        },
        status=status.HTTP_200_OK
    )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def broker_payout_delete(request, broker_id, payout_id):
    if not has_perm(request, 'bonus:manage'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        payout = BrokerPayout.objects.select_related('broker__brand', 'broker__created_by', 'broker__rm_user', 'paid_by').get(
            id=payout_id,
            broker_id=broker_id,
        )
    except BrokerPayout.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Broker payout not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_broker_access(request, payout.broker):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    broker = payout.broker
    payout_details = {
        'amount': str(payout.amount),
        'paid_by': payout.paid_by.username if payout.paid_by_id else None,
        'paid_at': payout.created_at.isoformat() if payout.created_at else None,
    }
    payout.delete()

    broker = Broker.objects.select_related('brand', 'created_by', 'rm_user').prefetch_related('payouts').get(id=broker_id)

    log_audit_event(
        request,
        module='broker',
        action='payout_delete',
        description=f'Broker payout deleted for "{broker.name}".',
        entity_type='broker',
        entity_id=broker.id,
        entity_label=broker.name,
        details={
            **payout_details,
            'pending_payout': broker.pending_payout,
        },
    )

    return Response(
        {
            'success': True,
            'message': 'Broker payout deleted successfully.',
            'broker': format_broker(broker),
        },
        status=status.HTTP_200_OK
    )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def broker_delete(request, broker_id):
    if not has_perm(request, 'broker:delete'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        broker = Broker.objects.select_related('brand').get(id=broker_id)
    except Broker.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Broker not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_broker_access(request, broker):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    # Prevent deletion if broker has clients
    if broker.clients.exists():
        return Response(
            {'success': False, 'message': 'Cannot delete broker with assigned clients.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    deleted_broker_name = broker.name
    deleted_broker_arc_id = broker.arc_id
    broker.delete()
    log_audit_event(
        request,
        module='broker',
        action='delete',
        description=f'Broker "{deleted_broker_name}" deleted.',
        entity_type='broker',
        entity_id=broker_id,
        entity_label=deleted_broker_name,
        details={'arc_id': deleted_broker_arc_id},
    )
    return Response(
        {'success': True, 'message': 'Broker deleted successfully.'},
        status=status.HTTP_200_OK
    )


# ===========================================================================
# Client CRUD
# ===========================================================================

def format_client(client):
    deposited_amount = Decimal(str(client.deposited_amount or 0))
    withdrawal_amount = Decimal(str(client.withdrawal_amount or 0))
    equity_amount = Decimal(str(client.equity_amount or 0))
    net_total = deposited_amount - withdrawal_amount
    net_dwe = net_total - equity_amount
    return {
        'id':                client.id,
        'name':              client.name,
        'arc_id':            client.arc_id,
        'broker':            {
            'id':     client.broker.id,
            'arc_id': client.broker.arc_id,
            'name':   client.broker.name,
            'brand':  client.broker.brand.name if client.broker.brand_id else None,
        },
        'brand':             client.broker.brand.name if client.broker.brand_id else None,
        'deposited_amount':  str(deposited_amount),
        'withdrawal_amount': str(withdrawal_amount),
        'equity_amount':     str(equity_amount),
        'net_total':         str(net_total),
        'net_dwe':           str(net_dwe),
        'earned_amount':     str(client.earned_amount),
        'legitimacy_status': client.legitimacy_status,
        'is_legitimate':     client.is_legitimate,
        'is_paid':           False,
        'paid_amount':       '0',
        'status':            client.status,
        'created_by':        client.created_by.username if client.created_by else None,
        'created_at':        client.created_at.strftime('%Y-%m-%d %H:%M:%S'),
    }


def format_client_transaction(transaction):
    return {
        'id':               transaction.id,
        'transaction_type': transaction.transaction_type,
        'amount':           str(transaction.amount),
        'entered_by':       transaction.entered_by.username if transaction.entered_by else None,
        'created_at':       transaction.created_at.strftime('%Y-%m-%d %H:%M:%S'),
    }


def _parse_bool(value, field_name):
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ('true', '1', 'yes', 'on'):
            return True
        if normalized in ('false', '0', 'no', 'off'):
            return False

    if isinstance(value, (int, float)):
        return bool(value)

    raise ValueError(f'{field_name} must be true or false.')


def _normalize_legitimacy_status(value):
    if value is None:
        return None

    if isinstance(value, bool):
        return 'approved' if value else 'pending'

    normalized = str(value).strip().lower()
    if normalized in ('pending', 'approved', 'declined'):
        return normalized
    if normalized in ('true', '1', 'yes', 'on'):
        return 'approved'
    if normalized in ('false', '0', 'no', 'off'):
        return 'pending'

    raise ValueError('legitimacy_status must be Pending, Approved, or Declined.')


def _check_client_access(request, client):
    """Return True if the current user is allowed to access this client (via broker access)."""
    return _check_broker_access(request, client.broker)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_create(request, broker_id):
    if not has_perm(request, 'client:create'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        broker = Broker.objects.select_related('brand').get(id=broker_id)
    except Broker.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Broker not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_broker_access(request, broker):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    name              = request.data.get('name', '').strip()
    arc_id            = request.data.get('arc_id', '').strip()
    deposited_amount  = request.data.get('deposited_amount', 0)
    withdrawal_amount = request.data.get('withdrawal_amount', 0)
    equity_amount     = request.data.get('equity_amount', 0)
    legitimacy_status = request.data.get('legitimacy_status')
    is_legitimate     = request.data.get('is_legitimate', False)

    if not name:
        return Response(
            {'success': False, 'message': 'name is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not arc_id:
        return Response(
            {'success': False, 'message': 'ark_id is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if Client.objects.filter(arc_id=arc_id).exists():
        return Response(
            {'success': False, 'message': f'Client with ark_id "{arc_id}" already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        deposited_amount  = Decimal(str(deposited_amount))
        withdrawal_amount = Decimal(str(withdrawal_amount))
        equity_amount     = Decimal(str(equity_amount))
        legitimacy_status = _normalize_legitimacy_status(legitimacy_status)
        if legitimacy_status is None:
            legitimacy_status = 'approved' if _parse_bool(is_legitimate, 'is_legitimate') else 'pending'
    except (InvalidOperation, ValueError, TypeError):
        return Response(
            {'success': False, 'message': 'deposited_amount, withdrawal_amount and equity_amount must be numbers, and legitimacy_status must be Pending, Approved, or Declined.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    client = Client.objects.create(
        name=name,
        arc_id=arc_id,
        broker=broker,
        deposited_amount=deposited_amount,
        withdrawal_amount=withdrawal_amount,
        equity_amount=equity_amount,
        legitimacy_status=legitimacy_status,
        status='Active',
        created_by=request.user,
    )

    if deposited_amount > 0:
        ClientTransaction.objects.create(
            client=client,
            transaction_type='deposit',
            amount=deposited_amount,
            entered_by=request.user,
        )

    if withdrawal_amount > 0:
        ClientTransaction.objects.create(
            client=client,
            transaction_type='withdrawal',
            amount=withdrawal_amount,
            entered_by=request.user,
        )

    log_audit_event(
        request,
        module='client',
        action='create',
        description=f'Client "{client.name}" created.',
        entity_type='client',
        entity_id=client.id,
        entity_label=client.name,
        details={
            'arc_id': client.arc_id,
            'broker': broker.name,
            'deposited_amount': deposited_amount,
            'withdrawal_amount': withdrawal_amount,
            'legitimacy_status': client.legitimacy_status,
            'is_legitimate': client.is_legitimate,
        },
    )

    return Response(
        {'success': True, 'message': 'Client created successfully.', 'data': format_client(client)},
        status=status.HTTP_201_CREATED
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def client_list(request, broker_id):
    if not has_perm(request, 'client:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        broker = Broker.objects.select_related('brand').get(id=broker_id)
    except Broker.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Broker not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_broker_access(request, broker):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    clients = (
        Client.objects
        .select_related('broker__brand', 'broker', 'created_by')
        .filter(broker=broker)
        .order_by('id')
    )

    month_param = request.query_params.get('month', '').strip()  # format: YYYY-MM
    if month_param:
        try:
            month_date = parse_date(month_param + '-01')
            if month_date is None:
                raise ValueError()

            from django.db.models import Sum
            from collections import defaultdict

            month_start, _, month_start_dt, next_month_dt = _month_bounds(month_date)

            txn_qs = ClientTransaction.objects.filter(
                client__broker=broker,
                created_at__gte=month_start_dt,
                created_at__lt=next_month_dt,
            )

            monthly_deposits = defaultdict(lambda: Decimal('0'))
            monthly_withdrawals = defaultdict(lambda: Decimal('0'))
            for txn in txn_qs.values('client_id', 'transaction_type').annotate(total=Sum('amount')):
                if txn['transaction_type'] == 'deposit':
                    monthly_deposits[txn['client_id']] = txn['total'] or Decimal('0')
                else:
                    monthly_withdrawals[txn['client_id']] = txn['total'] or Decimal('0')

            monthly_leg_qs = ClientMonthlyLegitimacy.objects.filter(
                client__broker=broker,
                month=month_start,
            )
            monthly_leg_map = {ml.client_id: ml.legitimacy_status for ml in monthly_leg_qs}

            monthly_equity_qs = ClientMonthlyEquity.objects.filter(
                client__broker=broker,
                month=month_start,
            )
            monthly_equity_map = {me.client_id: Decimal(str(me.equity_amount or 0)) for me in monthly_equity_qs}

            monthly_paid_qs = ClientMonthlyPaid.objects.filter(
                client__broker=broker,
                month=month_start,
            )
            monthly_paid_map = {mp.client_id: mp for mp in monthly_paid_qs}

            result = []
            for c in clients:
                dep = monthly_deposits.get(c.id, Decimal('0'))
                wth = monthly_withdrawals.get(c.id, Decimal('0'))
                equity = monthly_equity_map.get(c.id, Decimal('0'))
                net_total = dep - wth
                net_dwe = net_total - equity
                monthly_legitimacy = monthly_leg_map.get(c.id, 'pending')
                earned = round(float(dep) * 0.01, 2) if monthly_legitimacy == 'approved' else 0
                paid_record = monthly_paid_map.get(c.id)
                result.append({
                    'id':                c.id,
                    'name':              c.name,
                    'arc_id':            c.arc_id,
                    'broker':            {
                        'id': c.broker.id,
                        'arc_id': c.broker.arc_id,
                        'name': c.broker.name,
                        'brand': c.broker.brand.name if c.broker.brand_id else None,
                    },
                    'brand':             c.broker.brand.name if c.broker.brand_id else None,
                    'deposited_amount':  str(dep),
                    'withdrawal_amount': str(wth),
                    'equity_amount':     str(equity),
                    'net_total':         str(net_total),
                    'net_dwe':           str(net_dwe),
                    'earned_amount':     str(earned),
                    'legitimacy_status': monthly_legitimacy,
                    'is_legitimate':     monthly_legitimacy == 'approved',
                    'is_paid':           paid_record.is_paid if paid_record else False,
                    'paid_amount':       str(paid_record.paid_amount) if paid_record else '0',
                    'status':            c.status,
                    'created_by':        c.created_by.username if c.created_by else None,
                    'created_at':        c.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                })

            return Response(
                {'success': True, 'data': result},
                status=status.HTTP_200_OK
            )
        except (ValueError, AttributeError):
            pass

    return Response(
        {'success': True, 'data': [format_client(c) for c in clients]},
        status=status.HTTP_200_OK
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def client_list_all(request):
    """List all clients across all brokers (brand-scoped, with optional filters)."""
    if not has_perm(request, 'client:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    clients = (
        Client.objects
        .select_related('broker__brand', 'broker', 'created_by', 'created_by__brand')
        .order_by('-created_at')
    )

    # Brand isolation
    clients = scope_to_brand(clients, request, brand_field='broker__brand_id')

    # Within the brand, RM/JRM only see clients of brokers they created
    if not _user_sees_all_brokers(request):
        clients = clients.filter(broker__created_by=request.user)

    # Optional filters
    broker_id = request.query_params.get('broker_id')
    if broker_id:
        clients = clients.filter(broker_id=broker_id)

    legitimacy_status = request.query_params.get('legitimacy_status')
    if legitimacy_status and legitimacy_status in ('pending', 'approved', 'declined'):
        clients = clients.filter(legitimacy_status=legitimacy_status)

    status_filter = request.query_params.get('status')
    if status_filter and status_filter in ('Active', 'Inactive'):
        clients = clients.filter(status=status_filter)

    search = request.query_params.get('search', '').strip()
    if search:
        clients = clients.filter(
            Q(name__icontains=search) |
            Q(arc_id__icontains=search) |
            Q(broker__name__icontains=search) |
            Q(broker__arc_id__icontains=search)
        )

    # Monthly transaction aggregation
    month_param = request.query_params.get('month', '').strip()  # format: YYYY-MM
    if month_param:
        try:
            month_date = parse_date(month_param + '-01')
            if month_date is None:
                raise ValueError()
            from django.db.models import Sum
            from django.db.models.functions import Coalesce

            # Get monthly transaction totals per client
            month_start, _, month_start_dt, next_month_dt = _month_bounds(month_date)

            txn_qs = ClientTransaction.objects.filter(
                created_at__gte=month_start_dt,
                created_at__lt=next_month_dt,
            )

            from collections import defaultdict
            monthly_deposits = defaultdict(lambda: Decimal('0'))
            monthly_withdrawals = defaultdict(lambda: Decimal('0'))
            for txn in txn_qs.values('client_id', 'transaction_type').annotate(total=Sum('amount')):
                if txn['transaction_type'] == 'deposit':
                    monthly_deposits[txn['client_id']] = txn['total'] or Decimal('0')
                else:
                    monthly_withdrawals[txn['client_id']] = txn['total'] or Decimal('0')

            # Get monthly legitimacy statuses
            monthly_leg_qs = ClientMonthlyLegitimacy.objects.filter(month=month_start)
            monthly_leg_map = {ml.client_id: ml.legitimacy_status for ml in monthly_leg_qs}

            monthly_equity_qs = ClientMonthlyEquity.objects.filter(month=month_start)
            monthly_equity_map = {me.client_id: Decimal(str(me.equity_amount or 0)) for me in monthly_equity_qs}

            monthly_paid_qs = ClientMonthlyPaid.objects.filter(month=month_start)
            monthly_paid_map = {mp.client_id: mp for mp in monthly_paid_qs}

            result = []
            for c in clients:
                dep = monthly_deposits.get(c.id, Decimal('0'))
                wth = monthly_withdrawals.get(c.id, Decimal('0'))
                equity = monthly_equity_map.get(c.id, Decimal('0'))
                net_total = dep - wth
                net_dwe = net_total - equity
                monthly_legitimacy = monthly_leg_map.get(c.id, 'pending')
                earned = round(float(dep) * 0.01, 2) if monthly_legitimacy == 'approved' else 0
                paid_record = monthly_paid_map.get(c.id)
                result.append({
                    'id':                c.id,
                    'name':              c.name,
                    'arc_id':            c.arc_id,
                    'broker':            {'id': c.broker.id, 'arc_id': c.broker.arc_id, 'name': c.broker.name, 'brand': c.broker.brand.name if c.broker.brand_id else None},
                    'brand':             c.broker.brand.name if c.broker.brand_id else None,
                    'deposited_amount':  str(dep),
                    'withdrawal_amount': str(wth),
                    'equity_amount':     str(equity),
                    'net_total':         str(net_total),
                    'net_dwe':           str(net_dwe),
                    'earned_amount':     str(earned),
                    'legitimacy_status': monthly_legitimacy,
                    'is_legitimate':     monthly_legitimacy == 'approved',
                    'is_paid':           paid_record.is_paid if paid_record else False,
                    'paid_amount':       str(paid_record.paid_amount) if paid_record else '0',
                    'status':            c.status,
                    'created_by':        c.created_by.username if c.created_by else None,
                    'created_at':        c.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                })
            return Response({'success': True, 'data': result}, status=status.HTTP_200_OK)
        except (ValueError, AttributeError):
            pass  # Invalid month format, fall through to normal response

    return Response(
        {'success': True, 'data': [format_client(c) for c in clients]},
        status=status.HTTP_200_OK
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def client_get(request, client_id):
    if not has_perm(request, 'client:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        client = Client.objects.select_related('broker__brand', 'created_by').get(id=client_id)
    except Client.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Client not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_client_access(request, client):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    return Response(
        {'success': True, 'data': format_client(client)},
        status=status.HTTP_200_OK
    )


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def client_update(request, client_id):
    # Field-aware permission model (maker / checker workflow):
    #   - Editing name / arc_id / status            → requires 'client:update'
    #   - Approving / declining / setting pending   → requires 'client:trading_ok'
    # A request that touches both fieldsets needs BOTH permissions. A user with
    # only one of the two perms can still call this endpoint for the slice they
    # are allowed to change.
    can_update     = has_perm(request, 'client:update')
    can_trading_ok = has_perm(request, 'client:trading_ok')
    if not (can_update or can_trading_ok):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        client = Client.objects.select_related('broker__brand', 'created_by').get(id=client_id)
    except Client.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Client not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_client_access(request, client):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    new_name              = request.data.get('name')
    new_arc_id            = request.data.get('arc_id')
    new_equity_amount     = request.data.get('equity_amount')
    month_param           = (request.data.get('month') or '').strip()
    new_legitimacy_status = request.data.get('legitimacy_status')
    new_is_legitimate     = request.data.get('is_legitimate')
    new_status            = request.data.get('status')

    touches_core_fields = any(
        v is not None for v in (new_name, new_arc_id, new_status, new_equity_amount)
    )
    touches_legitimacy  = (new_legitimacy_status is not None) or (new_is_legitimate is not None)

    if touches_core_fields and not can_update:
        return Response(
            {'success': False, 'message': 'You do not have permission to edit client details.'},
            status=status.HTTP_403_FORBIDDEN
        )
    if touches_legitimacy and not can_trading_ok:
        return Response(
            {'success': False, 'message': 'You do not have permission to update the Legitimate Client status.'},
            status=status.HTTP_403_FORBIDDEN
        )
    previous_client = {
        'name': client.name,
        'arc_id': client.arc_id,
        'status': client.status,
        'legitimacy_status': client.legitimacy_status,
        'is_legitimate': client.is_legitimate,
        'equity_amount': str(client.equity_amount),
    }

    if new_name is not None:
        new_name = new_name.strip()
        if not new_name:
            return Response(
                {'success': False, 'message': 'name is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        client.name = new_name

    if new_arc_id is not None:
        new_arc_id = new_arc_id.strip()
        if not new_arc_id:
            return Response(
                {'success': False, 'message': 'ark_id is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if Client.objects.filter(arc_id=new_arc_id).exclude(id=client_id).exists():
            return Response(
                {'success': False, 'message': f'ark_id "{new_arc_id}" is already in use.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        client.arc_id = new_arc_id

    if request.data.get('deposited_amount') is not None or request.data.get('withdrawal_amount') is not None:
        return Response(
            {'success': False, 'message': 'Use client transaction actions to update deposited or withdrawal amounts.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if new_equity_amount is not None:
        try:
            parsed_equity_amount = Decimal(str(new_equity_amount))
        except (InvalidOperation, ValueError, TypeError):
            return Response(
                {'success': False, 'message': 'equity_amount must be a valid number.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if month_param:
            month_date = parse_date(month_param + '-01')
            if month_date is None:
                return Response(
                    {'success': False, 'message': 'Invalid month format. Use YYYY-MM.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            ClientMonthlyEquity.objects.update_or_create(
                client=client,
                month=month_date,
                defaults={
                    'equity_amount': parsed_equity_amount,
                    'updated_by': request.user,
                },
            )
        else:
            client.equity_amount = parsed_equity_amount

    target_legitimacy_status = _normalize_legitimacy_status(new_legitimacy_status)
    if target_legitimacy_status is None and new_is_legitimate is not None:
        try:
            target_legitimacy_status = 'approved' if _parse_bool(new_is_legitimate, 'is_legitimate') else 'pending'
        except ValueError as exc:
            return Response(
                {'success': False, 'message': str(exc)},
                status=status.HTTP_400_BAD_REQUEST
            )

    if target_legitimacy_status is not None:
        parsed_legitimate = target_legitimacy_status == 'approved'
        if target_legitimacy_status != client.legitimacy_status:
            if client.status != 'Active':
                return Response(
                    {'success': False, 'message': 'Legitimate Client status can only be updated for active clients.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            client.legitimacy_status = target_legitimacy_status
            client.is_legitimate = parsed_legitimate

    if new_status is not None:
        normalized = new_status.strip().capitalize()
        if normalized not in ('Active', 'Inactive'):
            return Response(
                {'success': False, 'message': 'Status must be "Active" or "Inactive".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        client.status = normalized

    client.save()
    log_audit_event(
        request,
        module='client',
        action='update',
        description=f'Client "{client.name}" updated.',
        entity_type='client',
        entity_id=client.id,
        entity_label=client.name,
        details=_build_audit_change_details(
            previous_client,
            {
                'name': client.name,
                'arc_id': client.arc_id,
                'status': client.status,
                'legitimacy_status': client.legitimacy_status,
                'is_legitimate': client.is_legitimate,
            },
        ),
    )
    return Response(
        {'success': True, 'message': 'Client updated successfully.', 'data': format_client(client)},
        status=status.HTTP_200_OK
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def client_transaction_list(request, client_id):
    if not has_perm(request, 'transactions:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        client = Client.objects.select_related('broker__brand').get(id=client_id)
    except Client.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Client not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_client_access(request, client):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    transactions = (
        ClientTransaction.objects
        .select_related('entered_by')
        .filter(client=client)
        .order_by('-created_at', '-id')
    )
    return Response(
        {'success': True, 'data': [format_client_transaction(t) for t in transactions]},
        status=status.HTTP_200_OK
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def client_transaction_create(request, client_id):
    if not has_perm(request, 'client:update'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        client = Client.objects.select_related('broker__brand').get(id=client_id)
    except Client.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Client not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_client_access(request, client):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    transaction_type = (request.data.get('transaction_type') or '').strip().lower()
    amount = request.data.get('amount')

    if transaction_type not in ('deposit', 'withdrawal'):
        return Response(
            {'success': False, 'message': 'transaction_type must be deposit or withdrawal.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if client.status != 'Active':
        return Response(
            {'success': False, 'message': 'Deposits and withdrawals are only allowed for active clients.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if client.legitimacy_status == 'declined':
        return Response(
            {'success': False, 'message': 'Deposits and withdrawals are not allowed for declined clients.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        amount = Decimal(str(amount))
    except (InvalidOperation, ValueError, TypeError):
        return Response(
            {'success': False, 'message': 'amount must be a number.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if amount == 0:
        return Response(
            {'success': False, 'message': 'amount cannot be zero.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Negative amount = deduction from current total
    if amount < 0:
        current_total = Decimal(str(client.deposited_amount or 0)) if transaction_type == 'deposit' else Decimal(str(client.withdrawal_amount or 0))
        if abs(amount) > current_total:
            return Response(
                {'success': False, 'message': f'Cannot deduct more than current {transaction_type} total of {current_total}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

    with db_transaction.atomic():
        if transaction_type == 'deposit':
            client.deposited_amount = Decimal(str(client.deposited_amount or 0)) + amount
        else:
            client.withdrawal_amount = Decimal(str(client.withdrawal_amount or 0)) + amount

        client.save(update_fields=['deposited_amount', 'withdrawal_amount'])

        transaction = ClientTransaction.objects.create(
            client=client,
            transaction_type=transaction_type,
            amount=amount,
            entered_by=request.user,
        )

        # Allow overriding the transaction month
        month_override = (request.data.get('month') or '').strip()
        if month_override:
            try:
                override_date = parse_date(month_override + '-15')
                if override_date:
                    from django.utils.timezone import make_aware
                    import datetime
                    override_dt = make_aware(datetime.datetime.combine(override_date, datetime.time(12, 0, 0)))
                    ClientTransaction.objects.filter(id=transaction.id).update(created_at=override_dt)
                    transaction.refresh_from_db()
            except (ValueError, AttributeError):
                pass

    log_audit_event(
        request,
        module='client',
        action='transaction',
        description=f'{transaction_type.capitalize()} recorded for client "{client.name}".',
        entity_type='client_transaction',
        entity_id=transaction.id,
        entity_label=client.name,
        details={
            'client_id': client.id,
            'client_arc_id': client.arc_id,
            'transaction_type': transaction_type,
            'amount': amount,
        },
    )

    return Response(
        {
            'success': True,
            'message': 'Client transaction recorded successfully.',
            'data': {
                'client': format_client(client),
                'transaction': format_client_transaction(transaction),
            }
        },
        status=status.HTTP_201_CREATED
    )


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def client_transaction_update(request, client_id, transaction_id):
    if not has_perm(request, 'client:update'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        transaction = ClientTransaction.objects.select_related('client__broker__brand', 'entered_by').get(
            id=transaction_id,
            client_id=client_id,
        )
    except ClientTransaction.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Client transaction not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    client = transaction.client
    if not _check_client_access(request, client):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    transaction_type = (request.data.get('transaction_type') or '').strip().lower()
    amount = request.data.get('amount')

    if transaction_type not in ('deposit', 'withdrawal'):
        return Response(
            {'success': False, 'message': 'transaction_type must be deposit or withdrawal.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        amount = Decimal(str(amount))
    except (InvalidOperation, ValueError, TypeError):
        return Response(
            {'success': False, 'message': 'amount must be a number.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if amount <= 0:
        return Response(
            {'success': False, 'message': 'amount must be greater than zero.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    previous_transaction = {
        'transaction_type': transaction.transaction_type,
        'amount': str(transaction.amount),
        'entered_by': transaction.entered_by.username if transaction.entered_by else None,
        'created_at': transaction.created_at.strftime('%Y-%m-%d %H:%M:%S') if transaction.created_at else None,
    }

    current_deposited = Decimal(str(client.deposited_amount or 0))
    current_withdrawn = Decimal(str(client.withdrawal_amount or 0))

    if transaction.transaction_type == 'deposit':
        current_deposited -= Decimal(str(transaction.amount))
    else:
        current_withdrawn -= Decimal(str(transaction.amount))

    if transaction_type == 'deposit':
        current_deposited += amount
    else:
        current_withdrawn += amount

    if current_deposited < 0 or current_withdrawn < 0:
        return Response(
            {'success': False, 'message': 'Transaction update would make client totals invalid.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    with db_transaction.atomic():
        client.deposited_amount = current_deposited
        client.withdrawal_amount = current_withdrawn
        client.save(update_fields=['deposited_amount', 'withdrawal_amount'])

        transaction.transaction_type = transaction_type
        transaction.amount = amount
        transaction.save(update_fields=['transaction_type', 'amount'])

    log_audit_event(
        request,
        module='client',
        action='transaction_update',
        description=f'Client transaction updated for client "{client.name}".',
        entity_type='client_transaction',
        entity_id=transaction.id,
        entity_label=client.name,
        details=_build_audit_change_details(
            previous_transaction,
            {
                'transaction_type': transaction.transaction_type,
                'amount': str(transaction.amount),
                'entered_by': transaction.entered_by.username if transaction.entered_by else None,
                'created_at': transaction.created_at.strftime('%Y-%m-%d %H:%M:%S') if transaction.created_at else None,
                'client_deposited_amount': str(client.deposited_amount),
                'client_withdrawal_amount': str(client.withdrawal_amount),
            },
        ),
    )

    return Response(
        {
            'success': True,
            'message': 'Client transaction updated successfully.',
            'data': {
                'client': format_client(client),
                'transaction': format_client_transaction(transaction),
            }
        },
        status=status.HTTP_200_OK
    )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def client_transaction_delete(request, client_id, transaction_id):
    if not has_perm(request, 'client:update'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        transaction = ClientTransaction.objects.select_related('client__broker__brand', 'entered_by').get(
            id=transaction_id,
            client_id=client_id,
        )
    except ClientTransaction.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Client transaction not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    client = transaction.client
    if not _check_client_access(request, client):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    new_deposited = Decimal(str(client.deposited_amount or 0))
    new_withdrawn = Decimal(str(client.withdrawal_amount or 0))

    if transaction.transaction_type == 'deposit':
        new_deposited -= Decimal(str(transaction.amount))
    else:
        new_withdrawn -= Decimal(str(transaction.amount))

    if new_deposited < 0 or new_withdrawn < 0:
        return Response(
            {'success': False, 'message': 'Transaction delete would make client totals invalid.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    deleted_transaction = {
        'transaction_type': transaction.transaction_type,
        'amount': str(transaction.amount),
        'entered_by': transaction.entered_by.username if transaction.entered_by else None,
        'created_at': transaction.created_at.strftime('%Y-%m-%d %H:%M:%S') if transaction.created_at else None,
    }

    with db_transaction.atomic():
        client.deposited_amount = new_deposited
        client.withdrawal_amount = new_withdrawn
        client.save(update_fields=['deposited_amount', 'withdrawal_amount'])
        transaction.delete()

    log_audit_event(
        request,
        module='client',
        action='transaction_delete',
        description=f'Client transaction deleted for client "{client.name}".',
        entity_type='client_transaction',
        entity_id=transaction_id,
        entity_label=client.name,
        details={
            **deleted_transaction,
            'client_deposited_amount': str(client.deposited_amount),
            'client_withdrawal_amount': str(client.withdrawal_amount),
        },
    )

    return Response(
        {
            'success': True,
            'message': 'Client transaction deleted successfully.',
            'data': {
                'client': format_client(client),
            }
        },
        status=status.HTTP_200_OK
    )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def client_delete(request, client_id):
    if not has_perm(request, 'client:delete'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        client = Client.objects.select_related('broker__brand').get(id=client_id)
    except Client.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Client not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_client_access(request, client):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    deleted_client_name = client.name
    deleted_client_arc_id = client.arc_id
    client.delete()
    log_audit_event(
        request,
        module='client',
        action='delete',
        description=f'Client "{deleted_client_name}" deleted.',
        entity_type='client',
        entity_id=client_id,
        entity_label=deleted_client_name,
        details={'arc_id': deleted_client_arc_id},
    )
    return Response(
        {'success': True, 'message': 'Client deleted successfully.'},
        status=status.HTTP_200_OK
    )


# ===========================================================================
# Client Monthly Legitimacy
# ===========================================================================

@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def client_monthly_legitimacy_update(request, client_id):
    """Update the legitimacy status for a client in a specific month."""
    if not has_perm(request, 'client:trading_ok'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        client = Client.objects.select_related('broker__brand', 'created_by').get(id=client_id)
    except Client.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Client not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_client_access(request, client):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    month_str = request.data.get('month', '').strip()
    new_legitimacy = request.data.get('legitimacy_status', '').strip().lower()

    if not month_str:
        return Response(
            {'success': False, 'message': 'month is required (YYYY-MM format).'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if new_legitimacy not in ('pending', 'approved', 'declined'):
        return Response(
            {'success': False, 'message': 'legitimacy_status must be pending, approved, or declined.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        month_date = parse_date(month_str + '-01')
        if month_date is None:
            raise ValueError()
    except (ValueError, AttributeError):
        return Response(
            {'success': False, 'message': 'Invalid month format. Use YYYY-MM.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    obj, created = ClientMonthlyLegitimacy.objects.update_or_create(
        client=client,
        month=month_date,
        defaults={
            'legitimacy_status': new_legitimacy,
            'updated_by': request.user,
        },
    )

    log_audit_event(
        request,
        module='client',
        action='monthly_legitimacy_update',
        description=f'Monthly legitimacy updated for "{client.name}" ({month_str}).',
        entity_type='client',
        entity_id=client.id,
        entity_label=client.name,
        details={
            'month': month_str,
            'legitimacy_status': new_legitimacy,
        },
    )

    return Response(
        {'success': True, 'message': 'Monthly legitimacy updated.', 'data': {'legitimacy_status': new_legitimacy}},
        status=status.HTTP_200_OK
    )


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def client_monthly_paid_update(request, client_id):
    """Update the paid status / paid amount for a client in a specific month.

    Rules:
      - A client can only be marked as paid when its legitimacy for that month
        is 'approved'.
      - When marking as paid without an explicit amount, the paid amount
        defaults to the earned amount for that month (1% of monthly deposits).
      - The paid amount can be overridden by the caller.
    """
    if not has_perm(request, 'client:update'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        client = Client.objects.select_related('broker__brand', 'created_by').get(id=client_id)
    except Client.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Client not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if not _check_client_access(request, client):
        return Response(
            {'success': False, 'message': 'Access denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    month_str = (request.data.get('month') or '').strip()
    if not month_str:
        return Response(
            {'success': False, 'message': 'month is required (YYYY-MM format).'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        month_date = parse_date(month_str + '-01')
        if month_date is None:
            raise ValueError()
    except (ValueError, AttributeError):
        return Response(
            {'success': False, 'message': 'Invalid month format. Use YYYY-MM.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Determine the legitimacy status for this client/month.
    monthly_leg = ClientMonthlyLegitimacy.objects.filter(client=client, month=month_date).first()
    legitimacy_status = monthly_leg.legitimacy_status if monthly_leg else 'pending'

    existing = ClientMonthlyPaid.objects.filter(client=client, month=month_date).first()

    # Resolve target is_paid.
    is_paid_raw = request.data.get('is_paid')
    if is_paid_raw is not None:
        try:
            target_is_paid = _parse_bool(is_paid_raw, 'is_paid')
        except ValueError as exc:
            return Response(
                {'success': False, 'message': str(exc)},
                status=status.HTTP_400_BAD_REQUEST
            )
    else:
        target_is_paid = existing.is_paid if existing else False

    # A client can only be marked paid when approved for that month.
    if target_is_paid and legitimacy_status != 'approved':
        return Response(
            {'success': False, 'message': 'Client must be Approved for this month before it can be marked as paid.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Compute the earned amount for this month (1% of monthly deposits when approved).
    _, _, month_start_dt, next_month_dt = _month_bounds(month_date)
    monthly_deposits = ClientTransaction.objects.filter(
        client=client,
        transaction_type='deposit',
        created_at__gte=month_start_dt,
        created_at__lt=next_month_dt,
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
    earned_amount = (
        (monthly_deposits * Decimal('0.01')).quantize(Decimal('0.01'))
        if legitimacy_status == 'approved' else Decimal('0')
    )

    # Resolve target paid amount.
    paid_amount_raw = request.data.get('paid_amount')
    if not target_is_paid:
        target_amount = Decimal('0')
    elif paid_amount_raw is not None and str(paid_amount_raw).strip() != '':
        try:
            target_amount = Decimal(str(paid_amount_raw))
        except (InvalidOperation, ValueError, TypeError):
            return Response(
                {'success': False, 'message': 'paid_amount must be a valid number.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if target_amount < 0:
            return Response(
                {'success': False, 'message': 'paid_amount cannot be negative.'},
                status=status.HTTP_400_BAD_REQUEST
            )
    elif existing and existing.paid_amount and Decimal(str(existing.paid_amount)) > 0:
        # Keep the previously recorded amount when re-affirming paid without a new value.
        target_amount = Decimal(str(existing.paid_amount))
    else:
        # Default to the earned amount for the month.
        target_amount = earned_amount

    obj, _created = ClientMonthlyPaid.objects.update_or_create(
        client=client,
        month=month_date,
        defaults={
            'is_paid': target_is_paid,
            'paid_amount': target_amount,
            'updated_by': request.user,
        },
    )

    log_audit_event(
        request,
        module='client',
        action='monthly_paid_update',
        description=f'Monthly paid status updated for "{client.name}" ({month_str}).',
        entity_type='client',
        entity_id=client.id,
        entity_label=client.name,
        details={
            'month': month_str,
            'is_paid': target_is_paid,
            'paid_amount': str(target_amount),
        },
    )

    return Response(
        {
            'success': True,
            'message': 'Paid status updated.',
            'data': {'is_paid': obj.is_paid, 'paid_amount': str(obj.paid_amount)},
        },
        status=status.HTTP_200_OK
    )
