"""
Brand-Based Access Control (BBAC) helpers — multi-brand edition.

Single source of truth for tenant isolation across the API.

Rules:
  1. Every user (Admin, Checker, RM, JRM, ...) is restricted to the set of
     brands assigned to them via the `User.brands` M2M.
  2. There is no global bypass: a user with zero assigned brands sees nothing.
  3. RM/JRM are further narrowed to rows they created (that "creator filter"
     lives in views.py via _user_sees_all_brokers).

Every list endpoint should funnel its queryset through `scope_to_brand`.
Every detail / write endpoint should call `assert_same_brand` on the object
it loads from the DB before acting on it.
"""

from rest_framework.exceptions import PermissionDenied


# ---------------------------------------------------------------------------
# Role checks (kept for non-tenancy authorization decisions)
# ---------------------------------------------------------------------------

def _role_names(request):
    """Roles from JWT payload if present, else from the user model."""
    if getattr(request, 'auth', None):
        return set(request.auth.get('roles') or [])
    return set(getattr(request.user, 'role_names', []) or [])


def is_admin(request):
    """True if the user has the Admin role.

    NOTE: Admin no longer bypasses brand isolation — they are scoped to their
    assigned brands just like everyone else. This helper is still useful for
    Admin-only privileged operations (e.g. role / permission management).
    """
    return 'Admin' in _role_names(request)


# ---------------------------------------------------------------------------
# Brand resolution
# ---------------------------------------------------------------------------

def current_brand_ids(request):
    """Set of brand IDs the current request is allowed to access.

    Always read from the database (the user's M2M `brands`). The JWT is
    treated as identity only, never as a brand-scope cache, so that any
    change an admin makes to a user's brand assignments takes effect on
    the very next request without forcing the user to re-login.

    Returns an empty set if no brands are assigned.
    """
    user = getattr(request, 'user', None)
    if user is None or not getattr(user, 'is_authenticated', False):
        return set()
    return set(user.brands.values_list('id', flat=True))


def _resolve_brand_id(obj):
    """Walk the known relations to find the (single) brand a row belongs to."""
    if obj is None:
        return None
    # The Brand model *is* the brand — its own id is the brand id.
    if obj.__class__.__name__ == 'Brand':
        return obj.id
    if hasattr(obj, 'brand_id') and obj.brand_id is not None:
        return obj.brand_id
    if hasattr(obj, 'broker') and obj.broker is not None:
        return obj.broker.brand_id
    if hasattr(obj, 'client') and obj.client is not None:
        return obj.client.broker.brand_id
    return None


def _resolve_brand_ids(obj):
    """Return the set of brand IDs an object belongs to.
    Handles User (multi-brand via M2M) and single-brand rows uniformly."""
    if obj is None:
        return set()
    if obj.__class__.__name__ == 'User' and hasattr(obj, 'brands'):
        return set(obj.brands.values_list('id', flat=True))
    single = _resolve_brand_id(obj)
    return {single} if single is not None else set()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def scope_to_brand(qs, request, brand_field='brand_id'):
    """Filter a queryset to the current user's brand set.

    `brand_field` accepts Django lookup syntax for indirect relations, e.g.
    'broker__brand_id' or 'client__broker__brand_id'. For multi-brand related
    rows (e.g. filtering Users by their brands M2M), pass 'brands'.

    If the user has no brands assigned, returns an empty queryset.
    """
    ids = current_brand_ids(request)
    if not ids:
        return qs.none()
    return qs.filter(**{f'{brand_field}__in': ids}).distinct()


def has_brand_access(request, obj):
    """Does the user's brand set overlap with the object's brand(s)?"""
    user_ids = current_brand_ids(request)
    if not user_ids:
        return False
    obj_ids = _resolve_brand_ids(obj)
    if not obj_ids:
        return False
    return bool(user_ids & obj_ids)


def assert_same_brand(request, *objects):
    """Raise PermissionDenied if any object is outside the user's brand set."""
    for obj in objects:
        if not has_brand_access(request, obj):
            raise PermissionDenied('Cross-brand access denied.')


def assert_brand_in_scope(request, brand_id):
    """Raise PermissionDenied if `brand_id` is not in the user's brand set.
    Use when validating brand IDs supplied in request bodies."""
    if brand_id is None:
        raise PermissionDenied('A brand must be specified.')
    if int(brand_id) not in current_brand_ids(request):
        raise PermissionDenied('That brand is outside your scope.')


def assert_brands_in_scope(request, brand_ids):
    """Raise PermissionDenied if any of `brand_ids` is outside the user's scope."""
    user_ids = current_brand_ids(request)
    extra = {int(b) for b in brand_ids} - user_ids
    if extra:
        raise PermissionDenied('One or more brands are outside your scope.')
