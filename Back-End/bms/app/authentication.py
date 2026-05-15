import jwt
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from app.models import User
from app.utils import decode_token


class JWTAuthentication(BaseAuthentication):
    """
    Custom JWT authentication for DRF.
    Reads: Authorization: Bearer <access_token>
    """

    def authenticate(self, request):
        auth_header = request.headers.get('Authorization', '')

        if not auth_header.startswith('Bearer '):
            return None  # No credentials — let DRF handle permission checks

        token = auth_header.split(' ')[1]

        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed('Token has expired.')
        except jwt.InvalidTokenError:
            raise AuthenticationFailed('Invalid token.')

        if payload.get('type') != 'access':
            raise AuthenticationFailed('Invalid token type. Use access token.')

        try:
            user = User.objects.get(id=payload['user_id'])
        except User.DoesNotExist:
            raise AuthenticationFailed('User not found.')

        if user.status != 'Active':
            raise AuthenticationFailed('User account is inactive.')

        return (user, payload)

    def authenticate_header(self, request):
        """Return WWW-Authenticate header so DRF issues 401 (not 403) for unauthenticated requests,
        allowing the axios interceptor to trigger the token-refresh flow."""
        return 'Bearer realm="api"'
