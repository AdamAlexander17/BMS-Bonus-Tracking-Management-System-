import jwt

from django.utils import timezone
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from app.models import User, UserToken
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

