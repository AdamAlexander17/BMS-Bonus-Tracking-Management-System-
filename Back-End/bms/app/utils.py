import hashlib
import secrets

import jwt
from django.utils import timezone
from django.conf import settings


# ─── Password Hashing ────────────────────────────────────────────────────────
# Using Python stdlib hashlib with PBKDF2-SHA256 — no Django auth dependency

def hash_password(raw_password: str) -> str:
    """Hash a plain-text password. Returns a string: pbkdf2_sha256$iterations$salt$hexdigest"""
    salt = secrets.token_hex(16)
    iterations = 260000
    key = hashlib.pbkdf2_hmac(
        'sha256',
        raw_password.encode('utf-8'),
        salt.encode('utf-8'),
        iterations
    )
    return f'pbkdf2_sha256${iterations}${salt}${key.hex()}'


def verify_password(raw_password: str, stored_hash: str) -> bool:
    """Compare a plain-text password against the stored hash."""
    try:
        algorithm, iterations, salt, stored_key = stored_hash.split('$')
        iterations = int(iterations)
        key = hashlib.pbkdf2_hmac(
            'sha256',
            raw_password.encode('utf-8'),
            salt.encode('utf-8'),
            iterations
        )
        return key.hex() == stored_key
    except Exception:
        return False


# ─── JWT ─────────────────────────────────────────────────────────────────────
# Using PyJWT directly — no simplejwt dependency

def generate_access_token(user) -> str:
    """Generate a short-lived access token carrying user identity, roles, brands and permissions."""
    # Union of permissions across all of the user's roles
    perms = (
        user.roles
        .values_list('role_permissions__permission__module',
                     'role_permissions__permission__action')
        .distinct()
    )
    permissions = sorted({f'{m}:{a}' for m, a in perms if m and a})

    role_names  = list(user.roles.values_list('name', flat=True))
    brand_names = user.brand_names  # derived from the user's roles

    payload = {
        'user_id':     user.id,
        'username':    user.username,
        'roles':       role_names,
        'brands':      brand_names,
        'permissions': permissions,
        'type':        'access',
        'iat':         timezone.now(),
        'exp':         timezone.now() + timezone.timedelta(
                           hours=settings.JWT_ACCESS_TOKEN_EXPIRE_HOURS
                       ),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def generate_refresh_token(user_id: int) -> str:
    """Generate a long-lived refresh token used to obtain a new access token."""
    payload = {
        'user_id': user_id,
        'type': 'refresh',
        'iat': timezone.now(),
        'exp': timezone.now() + timezone.timedelta(
            days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
        ),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT. Raises jwt.ExpiredSignatureError or jwt.InvalidTokenError."""
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
