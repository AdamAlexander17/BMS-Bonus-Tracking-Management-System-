import jwt

from django.utils import timezone
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from django.db.models import Count

from app.models import User, UserToken, Role, Brand, UserBrand, Permission, RolePermission, Broker, Client
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
                'role': user.role.name,
                'brands': list(user.brands.values_list('name', flat=True)),
            }
        }
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def refresh_token(request):
    token = request.data.get('refresh_token', '').strip()

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
    return {
        'id':         user.id,
        'username':   user.username,
        'role':       user.role.name,
        'brands':     list(user.brands.values_list('name', flat=True)),
        'status':     user.status,
        'created_by': user.created_by.username if user.created_by else None,
        'created_at': user.created_at.strftime('%Y-%m-%d %H:%M:%S'),
    }


# ─── User CRUD ────────────────────────────────────────────────────────────────

def create_user(request):
    if not has_perm(request, 'user:create'):
        return Response(
            {'success': False, 'message': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN
        )

    username    = request.data.get('username', '').strip()
    password    = request.data.get('password', '').strip()
    role_name   = request.data.get('role', '').strip()
    brand_names = request.data.get('brands', []) 

    if not username or not password or not role_name or not brand_names:
        return Response(
            {'success': False, 'message': 'username, password, role and brands are required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {'success': False, 'message': 'Username already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        role = Role.objects.get(name=role_name)
    except Role.DoesNotExist:
        return Response(
            {'success': False, 'message': f'Role "{role_name}" does not exist.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    brands = Brand.objects.filter(name__in=brand_names)
    if brands.count() != len(brand_names):
        return Response(
            {'success': False, 'message': 'One or more brand names are invalid.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    from app.utils import hash_password
    new_user = User.objects.create(
        username=username,
        password=hash_password(password),
        role=role,
        status='Active',
        created_by=request.user,
    )
    for brand in brands:
        UserBrand.objects.create(user=new_user, brand=brand)

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

    all_users = User.objects.select_related('role', 'created_by').prefetch_related('brands').all()
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
        user = User.objects.select_related('role', 'created_by').prefetch_related('brands').get(id=user_id)
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
    role_name    = request.data.get('role')
    brand_names  = request.data.get('brands')
    new_status   = request.data.get('status')
    new_password = request.data.get('password')

    if new_username:
        if User.objects.filter(username=new_username).exclude(id=user_id).exists():
            return Response(
                {'success': False, 'message': 'Username already taken.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user.username = new_username

    if role_name:
        try:
            user.role = Role.objects.get(name=role_name)
        except Role.DoesNotExist:
            return Response(
                {'success': False, 'message': f'Role "{role_name}" does not exist.'},
                status=status.HTTP_400_BAD_REQUEST
            )

    if brand_names is not None:
        brands = Brand.objects.filter(name__in=brand_names)
        if brands.count() != len(brand_names):
            return Response(
                {'success': False, 'message': 'One or more brand names are invalid.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        UserBrand.objects.filter(user=user).delete()
        for brand in brands:
            UserBrand.objects.create(user=user, brand=brand)

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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can create brands.'},
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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can view brands.'},
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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can view brands.'},
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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can update brands.'},
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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can delete brands.'},
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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can view permissions.'},
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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can view permissions.'},
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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can create roles.'},
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

    role = Role.objects.create(name=name, description=description, status=role_status)

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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can view roles.'},
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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can view roles.'},
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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can update roles.'},
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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can delete roles.'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        role = Role.objects.get(id=role_id)
    except Role.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Role not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if User.objects.filter(role=role).exists():
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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can assign permissions.'},
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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can remove permissions.'},
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
    if request.user.role.name != 'Admin':
        return Response(
            {'success': False, 'message': 'Only Admin can set permissions.'},
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
    """Return True if the user's role grants the given permission key (e.g. 'broker:create').
    Checks the JWT payload first; falls back to a DB lookup if no JWT payload is present."""
    if request.auth:
        return key in request.auth.get('permissions', [])
    # Fallback: look up permissions for the authenticated user's role from DB
    if not getattr(request, 'user', None) or not getattr(request.user, 'role', None):
        return False
    try:
        module, action = key.split(':', 1)
    except ValueError:
        return False
    return RolePermission.objects.filter(
        role=request.user.role, permission__module=module, permission__action=action
    ).exists()


def user_brand_names(request):
    """Brand names assigned to the current user (JWT payload first, else DB)."""
    if request.auth:
        return request.auth.get('brands', [])
    if not getattr(request, 'user', None):
        return []
    return list(request.user.brands.values_list('name', flat=True))


# ===========================================================================
# Broker CRUD
# ===========================================================================

def format_broker(broker):
    return {
        'id':            broker.id,
        'arc_id':        broker.arc_id,
        'name':          broker.name,
        'brand':         {'id': broker.brand.id, 'name': broker.brand.name},
        'amount_earned': str(broker.amount_earned),
        'status':        broker.status,
        'client_count':  getattr(broker, 'client_count', broker.clients.count()),
        'created_by':    broker.created_by.username if broker.created_by else None,
        'created_at':    broker.created_at.strftime('%Y-%m-%d %H:%M:%S'),
    }


def _check_broker_access(request, broker):
    """Return True if the current user is allowed to access this broker."""
    role_name = request.user.role.name
    if role_name == 'Admin':
        return True
    if broker.brand.name not in user_brand_names(request):
        return False
    return True


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

    role_name = request.user.role.name
    if role_name != 'Admin' and brand_name not in user_brand_names(request):
        return Response(
            {'success': False, 'message': 'You do not have access to this brand.'},
            status=status.HTTP_403_FORBIDDEN
        )

    if Broker.objects.filter(arc_id=arc_id).exists():
        return Response(
            {'success': False, 'message': f'Broker with arc_id "{arc_id}" already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    broker = Broker.objects.create(
        arc_id=arc_id,
        name=name,
        brand=brand,
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
        .filter(client_count__gt=0)
        .order_by('id')
    )

    role_name = request.user.role.name
    if role_name != 'Admin':
        brokers = brokers.filter(brand__name__in=user_brand_names(request))

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
    net_total = client.deposited_amount - client.withdrawal_amount
    return {
        'id':                client.id,
        'arc_id':            client.arc_id,
        'broker':            {
            'id':     client.broker.id,
            'arc_id': client.broker.arc_id,
            'name':   client.broker.name,
        },
        'deposited_amount':  str(client.deposited_amount),
        'withdrawal_amount': str(client.withdrawal_amount),
        'net_total':         str(net_total),
        'earned_amount':     str(client.earned_amount),
        'status':            client.status,
        'created_by':        client.created_by.username if client.created_by else None,
        'created_at':        client.created_at.strftime('%Y-%m-%d %H:%M:%S'),
    }


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

    arc_id            = request.data.get('arc_id', '').strip()
    deposited_amount  = request.data.get('deposited_amount', 0)
    withdrawal_amount = request.data.get('withdrawal_amount', 0)

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
        deposited_amount  = float(deposited_amount)
        withdrawal_amount = float(withdrawal_amount)
    except (ValueError, TypeError):
        return Response(
            {'success': False, 'message': 'deposited_amount and withdrawal_amount must be numbers.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    client = Client.objects.create(
        arc_id=arc_id,
        broker=broker,
        deposited_amount=deposited_amount,
        withdrawal_amount=withdrawal_amount,
        status='Active',
        created_by=request.user,
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

    new_arc_id            = request.data.get('arc_id')
    new_deposited_amount  = request.data.get('deposited_amount')
    new_withdrawal_amount = request.data.get('withdrawal_amount')
    new_status            = request.data.get('status')

    if new_arc_id is not None:
        new_arc_id = new_arc_id.strip()
        if Client.objects.filter(arc_id=new_arc_id).exclude(id=client_id).exists():
            return Response(
                {'success': False, 'message': f'arc_id "{new_arc_id}" is already in use.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        client.arc_id = new_arc_id

    if new_deposited_amount is not None:
        try:
            client.deposited_amount = float(new_deposited_amount)
        except (ValueError, TypeError):
            return Response(
                {'success': False, 'message': 'deposited_amount must be a number.'},
                status=status.HTTP_400_BAD_REQUEST
            )

    if new_withdrawal_amount is not None:
        try:
            client.withdrawal_amount = float(new_withdrawal_amount)
        except (ValueError, TypeError):
            return Response(
                {'success': False, 'message': 'withdrawal_amount must be a number.'},
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

