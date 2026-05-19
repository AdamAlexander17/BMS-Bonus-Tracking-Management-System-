import jwt
from django.db import transaction as db_transaction
from decimal import Decimal, InvalidOperation

from django.utils import timezone
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from django.db.models import Count

from app.models import User, UserToken, Role, Brand, UserRole, Permission, RolePermission, Broker, Client, ClientTransaction
from app.utils import verify_password, generate_access_token, generate_refresh_token, decode_token


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

    # Save refresh token to DB
    expires_at = timezone.now() + timezone.timedelta(
        days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
    )
    UserToken.objects.create(
        user=user,
        refresh_token=refresh_token,
        expires_at=expires_at
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
                'brand': user.brand_name,
            }
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
    return {
        'id':           user.id,
        'username':     user.username,
        'roles':        [r['name'] for r in role_objs],
        'role_ids':     [r['id']   for r in role_objs],
        'role_objects': role_objs,
        'brand':        user.brand_name,
        'brand_id':     user.brand_id,
        'status':       user.status,
        'created_by':   user.created_by.username if user.created_by else None,
        'created_at':   user.created_at.strftime('%Y-%m-%d %H:%M:%S'),
    }


# ─── User CRUD ────────────────────────────────────────────────────────────────

def create_user(request):
    if not has_perm(request, 'user:create'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    username   = request.data.get('username', '').strip()
    password   = request.data.get('password', '').strip()
    brand_name = (request.data.get('brand') or '').strip()
    # Accept role IDs (most precise) OR role names (now globally unique)
    role_ids   = request.data.get('role_ids')
    role_names = request.data.get('roles')
    if role_ids is None and role_names is None:
        single = (request.data.get('role') or '').strip()
        role_names = [single] if single else []

    if not username or not password or not (role_ids or role_names):
        return Response(
            {'success': False, 'message': 'username, password and at least one role are required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {'success': False, 'message': 'Username already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Resolve brand (optional)
    brand_obj = None
    if brand_name:
        try:
            brand_obj = Brand.objects.get(name=brand_name)
        except Brand.DoesNotExist:
            return Response(
                {'success': False, 'message': f'Brand "{brand_name}" not found.'},
                status=status.HTTP_400_BAD_REQUEST
            )

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

    from app.utils import hash_password
    new_user = User.objects.create(
        username=username,
        password=hash_password(password),
        brand=brand_obj,
        status='Active',
        created_by=request.user,
    )
    for role in roles:
        UserRole.objects.create(user=new_user, role=role)

    return Response({
        'success': True,
        'message': 'User created successfully.',
        'data': format_user(new_user)
    }, status=status.HTTP_201_CREATED)


def get_users(request):
    if not has_perm(request, 'user:view'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    all_users = User.objects.select_related('created_by', 'brand').prefetch_related('roles').all()
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

    new_username = request.data.get('username')
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

    if brand_name is not None:
        brand_name = brand_name.strip()
        if brand_name == '':
            user.brand = None
        else:
            try:
                user.brand = Brand.objects.get(name=brand_name)
            except Brand.DoesNotExist:
                return Response(
                    {'success': False, 'message': f'Brand "{brand_name}" not found.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

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
        from app.utils import hash_password
        user.password = hash_password(new_password)

    user.save()

    return Response({
        'success': True,
        'message': 'User updated successfully.',
        'data': format_user(user)
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

    user.delete()
    return Response({
        'success': True,
        'message': 'User deleted successfully.'
    }, status=status.HTTP_200_OK)


# ─── Combined route handlers ──────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def user_create(request):
    return create_user(request)


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
    """Return all users whose role is RM or JRM, with their brands and managed-broker count."""
    users = (
        User.objects
        .select_related('created_by', 'brand')
        .prefetch_related('roles', 'managed_brokers')
        .filter(roles__name__in=['RM', 'JRM'])
        .distinct()
        .order_by('username')
    )

    # Non-privileged users can only see themselves in this list.
    if not _user_sees_all_brokers(request):
        users = users.filter(id=request.user.id)
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
            for u in users
        ]
    }, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Brand CRUD (Admin only)
# ---------------------------------------------------------------------------

def format_brand(brand):
    return {
        'id':   brand.id,
        'name': brand.name,
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
    if not name:
        return Response(
            {'success': False, 'message': 'Brand name is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if Brand.objects.filter(name=name).exists():
        return Response(
            {'success': False, 'message': f'Brand "{name}" already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    brand = Brand.objects.create(name=name)
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

    name = request.data.get('name', '').strip()
    if not name:
        return Response(
            {'success': False, 'message': 'Brand name is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if Brand.objects.filter(name=name).exclude(id=brand_id).exists():
        return Response(
            {'success': False, 'message': f'Brand "{name}" already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    brand.name = name
    brand.save()
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

    brand.delete()
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
    if not has_perm(request, 'permission:view'):
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
    if not has_perm(request, 'permission:view'):
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

    role.delete()
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

    return Response({
        'success': True,
        'message': 'Role permissions updated successfully.',
        'role': format_role(role),
    }, status=status.HTTP_200_OK)


# ===========================================================================
# Permission helpers
# ===========================================================================

def has_perm(request, key):
    """Return True if any of the user's roles grants the given permission key (e.g. 'broker:create').
    Checks the JWT payload first; falls back to a DB lookup if no JWT payload is present."""
    if request.auth:
        return key in request.auth.get('permissions', [])
    # Fallback: union of permissions across all of the user's roles
    if not getattr(request, 'user', None):
        return False
    try:
        module, action = key.split(':', 1)
    except ValueError:
        return False
    return RolePermission.objects.filter(
        role__in=request.user.roles.all(),
        permission__module=module,
        permission__action=action,
    ).exists()


def user_brand_names(request):
    """Brand names assigned to the current user (JWT payload first, else DB)."""
    if request.auth:
        b = request.auth.get('brand')
        return [b] if b else []
    if not getattr(request, 'user', None):
        return []
    return [request.user.brand_name] if request.user.brand_name else []


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

    # Non-privileged users can only drill into themselves, and only see brokers they created.
    if not _user_sees_all_brokers(request):
        if rm_user.id != request.user.id:
            return Response(
                {'success': False, 'message': 'Access denied.'},
                status=status.HTTP_403_FORBIDDEN
            )
        brokers = (
            Broker.objects
            .select_related('brand', 'created_by')
            .annotate(client_count=Count('clients'))
            .filter(created_by=request.user)
            .order_by('id')
        )
    else:
        brokers = (
            Broker.objects
            .select_related('brand', 'created_by')
            .annotate(client_count=Count('clients'))
            .filter(rm_user=rm_user)
            .order_by('id')
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
    return {
        'id':            broker.id,
        'arc_id':        broker.arc_id,
        'name':          broker.name,
        'brand':         {'id': broker.brand.id, 'name': broker.brand.name},
        'rm_user':       {'id': rm.id, 'username': rm.username, 'roles': rm.role_names} if rm else None,
        'amount_earned': str(broker.amount_earned),
        'status':        broker.status,
        'client_count':  getattr(broker, 'client_count', broker.clients.count()),
        'created_by':    broker.created_by.username if broker.created_by else None,
        'created_at':    broker.created_at.strftime('%Y-%m-%d %H:%M:%S'),
    }


def _user_sees_all_brokers(request):
    """Admin, FM and Checker can see brokers/clients across all users."""
    role_names = set(getattr(request.user, 'role_names', []) or [])
    return bool(role_names & {'Admin', 'FM', 'Checker'})


def _check_broker_access(request, broker):
    """Return True if the current user is allowed to access this broker."""
    if _user_sees_all_brokers(request):
        return True
    # Otherwise the user can only access brokers they created.
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
            {'success': False, 'message': 'arc_id, name, and brand are required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        brand = Brand.objects.get(name=brand_name)
    except Brand.DoesNotExist:
        return Response(
            {'success': False, 'message': f'Brand "{brand_name}" not found.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not has_perm(request, 'brand:view') and brand_name not in user_brand_names(request):
        return Response(
            {'success': False, 'message': 'You do not have access to this brand.'},
            status=status.HTTP_403_FORBIDDEN
        )

    if Broker.objects.filter(arc_id=arc_id).exists():
        return Response(
            {'success': False, 'message': f'Broker with arc_id "{arc_id}" already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Validate RM/JRM user if provided
    rm_user = None
    if rm_user_id:
        try:
            rm_user = User.objects.prefetch_related('roles').get(id=rm_user_id)
            if not rm_user.roles.filter(name__in=['RM', 'JRM']).exists():
                return Response(
                    {'success': False, 'message': 'Assigned user must have role RM or JRM.'},
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
            .select_related('brand', 'created_by')
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

    if new_arc_id is not None:
        new_arc_id = new_arc_id.strip()
        if Broker.objects.filter(arc_id=new_arc_id).exclude(id=broker_id).exists():
            return Response(
                {'success': False, 'message': f'arc_id "{new_arc_id}" is already in use.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        broker.arc_id = new_arc_id

    if new_name is not None:
        broker.name = new_name.strip()

    if new_brand_name is not None:
        try:
            broker.brand = Brand.objects.get(name=new_brand_name.strip())
        except Brand.DoesNotExist:
            return Response(
                {'success': False, 'message': f'Brand "{new_brand_name}" not found.'},
                status=status.HTTP_400_BAD_REQUEST
            )

    if new_rm_user_id is not None:
        if new_rm_user_id == '':
            broker.rm_user = None
        else:
            try:
                rm_user = User.objects.prefetch_related('roles').get(id=new_rm_user_id)
                if not rm_user.roles.filter(name__in=['RM', 'JRM']).exists():
                    return Response(
                        {'success': False, 'message': 'Assigned user must have role RM or JRM.'},
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
    return Response(
        {'success': True, 'message': 'Broker updated successfully.', 'data': format_broker(broker)},
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

    broker.delete()
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
    net_total = deposited_amount - withdrawal_amount
    return {
        'id':                client.id,
        'name':              client.name,
        'arc_id':            client.arc_id,
        'broker':            {
            'id':     client.broker.id,
            'arc_id': client.broker.arc_id,
            'name':   client.broker.name,
        },
        'deposited_amount':  str(deposited_amount),
        'withdrawal_amount': str(withdrawal_amount),
        'net_total':         str(net_total),
        'earned_amount':     str(client.earned_amount),
        'is_legitimate':     client.is_legitimate,
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
    is_legitimate     = request.data.get('is_legitimate', False)

    if not name:
        return Response(
            {'success': False, 'message': 'name is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not arc_id:
        return Response(
            {'success': False, 'message': 'arc_id is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if Client.objects.filter(arc_id=arc_id).exists():
        return Response(
            {'success': False, 'message': f'Client with arc_id "{arc_id}" already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        deposited_amount  = Decimal(str(deposited_amount))
        withdrawal_amount = Decimal(str(withdrawal_amount))
        is_legitimate     = _parse_bool(is_legitimate, 'is_legitimate')
    except (InvalidOperation, ValueError, TypeError):
        return Response(
            {'success': False, 'message': 'deposited_amount and withdrawal_amount must be numbers, and is_legitimate must be true or false.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    client = Client.objects.create(
        name=name,
        arc_id=arc_id,
        broker=broker,
        deposited_amount=deposited_amount,
        withdrawal_amount=withdrawal_amount,
        is_legitimate=is_legitimate,
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
        .select_related('broker', 'created_by')
        .filter(broker=broker)
        .order_by('id')
    )
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

    new_name              = request.data.get('name')
    new_arc_id            = request.data.get('arc_id')
    new_is_legitimate     = request.data.get('is_legitimate')
    new_status            = request.data.get('status')

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
                {'success': False, 'message': 'arc_id is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if Client.objects.filter(arc_id=new_arc_id).exclude(id=client_id).exists():
            return Response(
                {'success': False, 'message': f'arc_id "{new_arc_id}" is already in use.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        client.arc_id = new_arc_id

    if request.data.get('deposited_amount') is not None or request.data.get('withdrawal_amount') is not None:
        return Response(
            {'success': False, 'message': 'Use client transaction actions to update deposited or withdrawal amounts.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if new_is_legitimate is not None:
        try:
            client.is_legitimate = _parse_bool(new_is_legitimate, 'is_legitimate')
        except ValueError as exc:
            return Response(
                {'success': False, 'message': str(exc)},
                status=status.HTTP_400_BAD_REQUEST
            )

    if new_status is not None:
        normalized = new_status.strip().capitalize()
        if normalized not in ('Active', 'Inactive'):
            return Response(
                {'success': False, 'message': 'Status must be "Active" or "Inactive".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        client.status = normalized

    client.save()
    return Response(
        {'success': True, 'message': 'Client updated successfully.', 'data': format_client(client)},
        status=status.HTTP_200_OK
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def client_transaction_list(request, client_id):
    if not has_perm(request, 'client:view'):
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

    client.delete()
    return Response(
        {'success': True, 'message': 'Client deleted successfully.'},
        status=status.HTTP_200_OK
    )

