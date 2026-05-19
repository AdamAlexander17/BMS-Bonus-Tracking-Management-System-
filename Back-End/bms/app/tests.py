"""
Comprehensive API test suite for the BMS backend.

Covers every endpoint defined in app/urls.py, in realistic workflow order, plus
all edge cases (validation, duplicates, missing fields, 404s, permission
denials, cross-brand access control, and protected deletes).

Run with:  python manage.py test app
"""

from rest_framework import status
from rest_framework.test import APITestCase, APIClient
from django.urls import reverse

from app.models import (
    User, Role, Brand, UserBrand, Permission, RolePermission,
    Broker, Client, UserToken,
)
from app.utils import hash_password


# All module/action permission keys we exercise in tests.
ALL_PERM_KEYS = [
    ('broker', 'create'), ('broker', 'view'), ('broker', 'update'), ('broker', 'delete'),
    ('client', 'create'), ('client', 'view'), ('client', 'update'), ('client', 'delete'),
    ('user',   'create'), ('user',   'view'), ('user',   'update'), ('user',   'delete'),
    ('report', 'view'),
]


def _seed_permissions():
    """Create the Permission rows used across the suite."""
    perms = {}
    for module, action in ALL_PERM_KEYS:
        p, _ = Permission.objects.get_or_create(module=module, action=action)
        perms[f'{module}:{action}'] = p
    return perms


def _auth_payload(user):
    """Build a JWT-like payload accepted by has_perm() / user_brand_names()."""
    return {
        'user_id':     user.id,
        'username':    user.username,
        'role':        user.role.name,
        'brands':      list(user.brands.values_list('name', flat=True)),
        'permissions': [
            f'{rp.permission.module}:{rp.permission.action}'
            for rp in user.role.role_permissions.select_related('permission').all()
        ],
        'type': 'access',
    }


class BaseAPITestCase(APITestCase):
    """Shared fixtures: an Admin role + user with full permissions on TestBrand."""

    @classmethod
    def setUpTestData(cls):
        cls.perms = _seed_permissions()

        # Admin role + all permissions
        cls.admin_role = Role.objects.create(name='Admin')
        for p in cls.perms.values():
            RolePermission.objects.create(role=cls.admin_role, permission=p)

        # Brands
        cls.brand_a = Brand.objects.create(name='TestBrand')
        cls.brand_b = Brand.objects.create(name='OtherBrand')

        # Admin user (linked to brand_a only by default; admin role bypasses brand
        # checks where applicable, but UserBrand link is required for user-create
        # to validate brand names through the admin's *own* brand list when used).
        cls.admin = User.objects.create(
            username='admin',
            password=hash_password('admin123'),
            role=cls.admin_role,
            status='Active',
        )
        UserBrand.objects.create(user=cls.admin, brand=cls.brand_a)
        UserBrand.objects.create(user=cls.admin, brand=cls.brand_b)

    def setUp(self):
        self.client_api = APIClient()
        self.client_api.force_authenticate(user=self.admin, token=_auth_payload(self.admin))

    # ── helper auth swap ───────────────────────────────────────────────────
    def auth_as(self, user):
        self.client_api.force_authenticate(user=user, token=_auth_payload(user))

    def unauth(self):
        self.client_api.force_authenticate(user=None, token=None)


# ════════════════════════════════════════════════════════════════════════════
# 1. AUTH
# ════════════════════════════════════════════════════════════════════════════
class AuthTests(BaseAPITestCase):

    def test_login_success(self):
        client = APIClient()
        res = client.post(reverse('login'),
                          {'username': 'admin', 'password': 'admin123'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['success'])
        self.assertIn('access_token', res.data['data'])
        self.assertIn('refresh_token', res.data['data'])
        self.assertEqual(res.data['data']['user']['username'], 'admin')

    def test_login_missing_fields(self):
        client = APIClient()
        res = client.post(reverse('login'), {'username': 'admin'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_wrong_password(self):
        client = APIClient()
        res = client.post(reverse('login'),
                          {'username': 'admin', 'password': 'wrong'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_unknown_user(self):
        client = APIClient()
        res = client.post(reverse('login'),
                          {'username': 'ghost', 'password': 'x'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_inactive_user(self):
        inactive = User.objects.create(
            username='inactive', password=hash_password('p'),
            role=self.admin_role, status='Inactive',
        )
        client = APIClient()
        res = client.post(reverse('login'),
                          {'username': 'inactive', 'password': 'p'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_refresh_token_success(self):
        client = APIClient()
        login = client.post(reverse('login'),
                            {'username': 'admin', 'password': 'admin123'}, format='json')
        refresh = login.data['data']['refresh_token']
        res = client.post(reverse('token_refresh'),
                          {'refresh_token': refresh}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', res.data['data'])

    def test_refresh_token_missing(self):
        client = APIClient()
        res = client.post(reverse('token_refresh'), {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_refresh_token_invalid(self):
        client = APIClient()
        res = client.post(reverse('token_refresh'),
                          {'refresh_token': 'not-a-jwt'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_success(self):
        client = APIClient()
        login = client.post(reverse('login'),
                            {'username': 'admin', 'password': 'admin123'}, format='json')
        access = login.data['data']['access_token']
        refresh = login.data['data']['refresh_token']
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        res = client.post(reverse('logout'),
                          {'refresh_token': refresh}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(UserToken.objects.filter(refresh_token=refresh).exists())

    def test_logout_missing_token(self):
        res = self.client_api.post(reverse('logout'), {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_unknown_token(self):
        res = self.client_api.post(reverse('logout'),
                                   {'refresh_token': 'nope'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


# ════════════════════════════════════════════════════════════════════════════
# 2. BRAND CRUD  (Admin-only)
# ════════════════════════════════════════════════════════════════════════════
class BrandTests(BaseAPITestCase):

    def test_brand_full_lifecycle(self):
        # create
        res = self.client_api.post(reverse('brand_create'),
                                   {'name': 'NewBrand'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        brand_id = res.data['data']['id']

        # list
        res = self.client_api.get(reverse('brand_list'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res.data['data']), 3)

        # get
        res = self.client_api.get(reverse('brand_get', args=[brand_id]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['name'], 'NewBrand')

        # update
        res = self.client_api.put(reverse('brand_update', args=[brand_id]),
                                  {'name': 'RenamedBrand'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['name'], 'RenamedBrand')

        # delete
        res = self.client_api.delete(reverse('brand_delete', args=[brand_id]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(Brand.objects.filter(id=brand_id).exists())

    def test_brand_create_missing_name(self):
        res = self.client_api.post(reverse('brand_create'), {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_brand_create_duplicate(self):
        res = self.client_api.post(reverse('brand_create'),
                                   {'name': 'TestBrand'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_brand_get_404(self):
        res = self.client_api.get(reverse('brand_get', args=[9999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_brand_update_404(self):
        res = self.client_api.put(reverse('brand_update', args=[9999]),
                                  {'name': 'X'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_brand_update_duplicate_name(self):
        res = self.client_api.put(reverse('brand_update', args=[self.brand_a.id]),
                                  {'name': 'OtherBrand'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_brand_delete_404(self):
        res = self.client_api.delete(reverse('brand_delete', args=[9999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_brand_non_admin_forbidden(self):
        non_admin_role = Role.objects.create(name='Viewer')
        u = User.objects.create(username='viewer', password=hash_password('p'),
                                role=non_admin_role, status='Active')
        self.auth_as(u)
        for method, url in [
            ('post',   reverse('brand_create')),
            ('get',    reverse('brand_list')),
            ('get',    reverse('brand_get', args=[self.brand_a.id])),
            ('put',    reverse('brand_update', args=[self.brand_a.id])),
            ('delete', reverse('brand_delete', args=[self.brand_a.id])),
        ]:
            res = getattr(self.client_api, method)(url, {}, format='json')
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, url)


# ════════════════════════════════════════════════════════════════════════════
# 3. PERMISSION READ-ONLY APIs
# ════════════════════════════════════════════════════════════════════════════
class PermissionTests(BaseAPITestCase):

    def test_list_permissions(self):
        res = self.client_api.get(reverse('permission_list'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['data']), len(ALL_PERM_KEYS))

    def test_get_permission(self):
        pid = next(iter(self.perms.values())).id
        res = self.client_api.get(reverse('permission_get', args=[pid]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_get_permission_404(self):
        res = self.client_api.get(reverse('permission_get', args=[9999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_permissions_non_admin_forbidden(self):
        role = Role.objects.create(name='Plain')
        u = User.objects.create(username='plain', password=hash_password('p'),
                                role=role, status='Active')
        self.auth_as(u)
        res = self.client_api.get(reverse('permission_list'))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# ════════════════════════════════════════════════════════════════════════════
# 4. ROLE CRUD + ROLE-PERMISSION ASSIGNMENT
# ════════════════════════════════════════════════════════════════════════════
class RoleTests(BaseAPITestCase):

    def test_role_full_lifecycle(self):
        # create
        res = self.client_api.post(reverse('role_create'),
                                   {'name': 'Manager'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        role_id = res.data['data']['id']

        # list
        res = self.client_api.get(reverse('role_list'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # get
        res = self.client_api.get(reverse('role_get', args=[role_id]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['permissions'], [])

        # assign permissions
        perm_ids = [self.perms['broker:view'].id, self.perms['client:view'].id]
        res = self.client_api.post(
            reverse('role_assign_permissions', args=[role_id]),
            {'permission_ids': perm_ids}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['assigned']), 2)

        # assign again — should be already_existed, none newly assigned
        res = self.client_api.post(
            reverse('role_assign_permissions', args=[role_id]),
            {'permission_ids': perm_ids}, format='json',
        )
        self.assertEqual(len(res.data['assigned']), 0)
        self.assertEqual(len(res.data['already_existed']), 2)

        # set (replace) permissions
        new_perms = [self.perms['broker:create'].id]
        res = self.client_api.put(
            reverse('role_set_permissions', args=[role_id]),
            {'permission_ids': new_perms}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['role']['permissions']), 1)

        # remove permissions
        res = self.client_api.delete(
            reverse('role_remove_permissions', args=[role_id]),
            {'permission_ids': new_perms}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['role']['permissions']), 0)

        # update name
        res = self.client_api.put(reverse('role_update', args=[role_id]),
                                  {'name': 'SeniorManager'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['name'], 'SeniorManager')

        # delete
        res = self.client_api.delete(reverse('role_delete', args=[role_id]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_role_create_missing_name(self):
        res = self.client_api.post(reverse('role_create'), {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_role_create_duplicate(self):
        res = self.client_api.post(reverse('role_create'),
                                   {'name': 'Admin'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_role_get_404(self):
        res = self.client_api.get(reverse('role_get', args=[9999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_role_update_404(self):
        res = self.client_api.put(reverse('role_update', args=[9999]),
                                  {'name': 'X'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_role_update_duplicate_name(self):
        Role.objects.create(name='Temp')
        temp = Role.objects.get(name='Temp')
        res = self.client_api.put(reverse('role_update', args=[temp.id]),
                                  {'name': 'Admin'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_role_delete_with_users_blocked(self):
        # admin_role has self.admin assigned
        res = self.client_api.delete(reverse('role_delete', args=[self.admin_role.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_role_delete_404(self):
        res = self.client_api.delete(reverse('role_delete', args=[9999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_assign_invalid_permission_ids(self):
        role = Role.objects.create(name='Tmp')
        res = self.client_api.post(
            reverse('role_assign_permissions', args=[role.id]),
            {'permission_ids': [99999]}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_assign_empty_list(self):
        role = Role.objects.create(name='Tmp')
        res = self.client_api.post(
            reverse('role_assign_permissions', args=[role.id]),
            {'permission_ids': []}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_assign_role_404(self):
        res = self.client_api.post(
            reverse('role_assign_permissions', args=[9999]),
            {'permission_ids': [next(iter(self.perms.values())).id]},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_set_permissions_to_empty(self):
        role = Role.objects.create(name='Tmp')
        RolePermission.objects.create(role=role, permission=self.perms['broker:view'])
        res = self.client_api.put(
            reverse('role_set_permissions', args=[role.id]),
            {'permission_ids': []}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(RolePermission.objects.filter(role=role).count(), 0)

    def test_role_endpoints_non_admin_forbidden(self):
        role = Role.objects.create(name='Plain')
        u = User.objects.create(username='plain', password=hash_password('p'),
                                role=role, status='Active')
        self.auth_as(u)
        res = self.client_api.get(reverse('role_list'))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# ════════════════════════════════════════════════════════════════════════════
# 5. USER CRUD
# ════════════════════════════════════════════════════════════════════════════
class UserTests(BaseAPITestCase):

    def test_user_full_lifecycle(self):
        # create
        payload = {
            'username': 'jdoe',
            'password': 'pw12345',
            'role':     'Admin',
            'brands':   ['TestBrand'],
        }
        res = self.client_api.post(reverse('user_create'), payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        uid = res.data['data']['id']

        # list
        res = self.client_api.get(reverse('user_list'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res.data['data']), 2)

        # get
        res = self.client_api.get(reverse('user_get', args=[uid]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['username'], 'jdoe')

        # update
        res = self.client_api.put(
            reverse('user_update', args=[uid]),
            {'username': 'jdoe2', 'status': 'Inactive',
             'brands': ['TestBrand', 'OtherBrand'], 'password': 'new-pw'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['username'], 'jdoe2')
        self.assertEqual(res.data['data']['status'], 'Inactive')

        # delete
        res = self.client_api.delete(reverse('user_delete', args=[uid]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(User.objects.filter(id=uid).exists())

    def test_user_create_missing_fields(self):
        res = self.client_api.post(reverse('user_create'),
                                   {'username': 'x'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_create_duplicate_username(self):
        res = self.client_api.post(
            reverse('user_create'),
            {'username': 'admin', 'password': 'p', 'role': 'Admin',
             'brands': ['TestBrand']},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_create_invalid_role(self):
        res = self.client_api.post(
            reverse('user_create'),
            {'username': 'u1', 'password': 'p', 'role': 'NoSuchRole',
             'brands': ['TestBrand']},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_create_invalid_brand(self):
        res = self.client_api.post(
            reverse('user_create'),
            {'username': 'u2', 'password': 'p', 'role': 'Admin',
             'brands': ['NoSuchBrand']},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_get_404(self):
        res = self.client_api.get(reverse('user_get', args=[9999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_update_404(self):
        res = self.client_api.put(reverse('user_update', args=[9999]),
                                  {'username': 'x'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_update_duplicate_username(self):
        other = User.objects.create(username='other', password=hash_password('p'),
                                    role=self.admin_role, status='Active')
        res = self.client_api.put(reverse('user_update', args=[other.id]),
                                  {'username': 'admin'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_update_invalid_status(self):
        u = User.objects.create(username='tmp', password=hash_password('p'),
                                role=self.admin_role, status='Active')
        res = self.client_api.put(reverse('user_update', args=[u.id]),
                                  {'status': 'banned'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_update_invalid_role(self):
        u = User.objects.create(username='tmp', password=hash_password('p'),
                                role=self.admin_role, status='Active')
        res = self.client_api.put(reverse('user_update', args=[u.id]),
                                  {'role': 'Nope'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_update_invalid_brand(self):
        u = User.objects.create(username='tmp', password=hash_password('p'),
                                role=self.admin_role, status='Active')
        res = self.client_api.put(reverse('user_update', args=[u.id]),
                                  {'brands': ['Ghost']}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_delete_self_blocked(self):
        res = self.client_api.delete(reverse('user_delete', args=[self.admin.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_delete_404(self):
        res = self.client_api.delete(reverse('user_delete', args=[9999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_endpoints_require_permission(self):
        role = Role.objects.create(name='NoPerms')
        u = User.objects.create(username='np', password=hash_password('p'),
                                role=role, status='Active')
        self.auth_as(u)
        for method, url in [
            ('post',   reverse('user_create')),
            ('get',    reverse('user_list')),
            ('get',    reverse('user_get',    args=[self.admin.id])),
            ('put',    reverse('user_update', args=[self.admin.id])),
            ('delete', reverse('user_delete', args=[self.admin.id])),
        ]:
            res = getattr(self.client_api, method)(url, {}, format='json')
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, url)


# ════════════════════════════════════════════════════════════════════════════
# 6. BROKER CRUD
# ════════════════════════════════════════════════════════════════════════════
class BrokerTests(BaseAPITestCase):

    def test_broker_full_lifecycle(self):
        # create
        res = self.client_api.post(
            reverse('broker_create'),
            {'arc_id': 'BRK001', 'name': 'Broker One', 'brand': 'TestBrand'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        bid = res.data['data']['id']

        # get
        res = self.client_api.get(reverse('broker_get', args=[bid]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # update
        res = self.client_api.put(
            reverse('broker_update', args=[bid]),
            {'name': 'Renamed', 'status': 'Inactive', 'arc_id': 'BRK002'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['arc_id'], 'BRK002')

        # list — broker has no clients yet, so it's filtered out (client_count > 0)
        res = self.client_api.get(reverse('broker_list'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn(bid, [b['id'] for b in res.data['data']])

        # delete (no clients → allowed)
        res = self.client_api.delete(reverse('broker_delete', args=[bid]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_broker_create_missing_fields(self):
        res = self.client_api.post(reverse('broker_create'),
                                   {'arc_id': 'X'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_broker_create_invalid_brand(self):
        res = self.client_api.post(
            reverse('broker_create'),
            {'arc_id': 'BRK010', 'name': 'B', 'brand': 'Nope'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_broker_create_duplicate_arc_id(self):
        Broker.objects.create(arc_id='DUP001', name='B', brand=self.brand_a,
                              created_by=self.admin)
        res = self.client_api.post(
            reverse('broker_create'),
            {'arc_id': 'DUP001', 'name': 'X', 'brand': 'TestBrand'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_broker_get_404(self):
        res = self.client_api.get(reverse('broker_get', args=[9999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_broker_update_404(self):
        res = self.client_api.put(reverse('broker_update', args=[9999]),
                                  {'name': 'x'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_broker_update_duplicate_arc_id(self):
        b1 = Broker.objects.create(arc_id='B1', name='b1', brand=self.brand_a,
                                   created_by=self.admin)
        b2 = Broker.objects.create(arc_id='B2', name='b2', brand=self.brand_a,
                                   created_by=self.admin)
        res = self.client_api.put(reverse('broker_update', args=[b2.id]),
                                  {'arc_id': 'B1'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_broker_update_invalid_brand(self):
        b = Broker.objects.create(arc_id='B3', name='b3', brand=self.brand_a,
                                  created_by=self.admin)
        res = self.client_api.put(reverse('broker_update', args=[b.id]),
                                  {'brand': 'Ghost'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_broker_update_invalid_status(self):
        b = Broker.objects.create(arc_id='B4', name='b4', brand=self.brand_a,
                                  created_by=self.admin)
        res = self.client_api.put(reverse('broker_update', args=[b.id]),
                                  {'status': 'weird'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_broker_delete_with_clients_blocked(self):
        b = Broker.objects.create(arc_id='B5', name='b5', brand=self.brand_a,
                                  created_by=self.admin)
        Client.objects.create(arc_id='C-blk', broker=b,
                              deposited_amount=100, withdrawal_amount=0,
                              created_by=self.admin)
        res = self.client_api.delete(reverse('broker_delete', args=[b.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('clients', res.data['message'].lower())
        self.assertTrue(Broker.objects.filter(id=b.id).exists())

    def test_broker_delete_404(self):
        res = self.client_api.delete(reverse('broker_delete', args=[9999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_broker_endpoints_require_permission(self):
        role = Role.objects.create(name='NoBroker')
        u = User.objects.create(username='nb', password=hash_password('p'),
                                role=role, status='Active')
        UserBrand.objects.create(user=u, brand=self.brand_a)
        self.auth_as(u)
        res = self.client_api.get(reverse('broker_list'))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_broker_brand_access_control(self):
        """Non-admin user with TestBrand only cannot access OtherBrand broker."""
        # build a non-admin role with full broker permissions but only TestBrand
        role = Role.objects.create(name='Manager')
        for key in ('broker:view', 'broker:update', 'broker:delete', 'broker:create'):
            RolePermission.objects.create(role=role, permission=self.perms[key])
        u = User.objects.create(username='mgr', password=hash_password('p'),
                                role=role, status='Active')
        UserBrand.objects.create(user=u, brand=self.brand_a)

        # broker created on OtherBrand
        other_broker = Broker.objects.create(
            arc_id='OTH001', name='other', brand=self.brand_b, created_by=self.admin,
        )

        self.auth_as(u)
        res = self.client_api.get(reverse('broker_get', args=[other_broker.id]))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # create on a brand user does NOT have → forbidden
        res = self.client_api.post(
            reverse('broker_create'),
            {'arc_id': 'X1', 'name': 'x', 'brand': 'OtherBrand'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# ════════════════════════════════════════════════════════════════════════════
# 7. CLIENT CRUD
# ════════════════════════════════════════════════════════════════════════════
class ClientTests(BaseAPITestCase):

    def setUp(self):
        super().setUp()
        self.broker = Broker.objects.create(
            arc_id='CB001', name='cb', brand=self.brand_a, created_by=self.admin,
        )

    def test_client_full_lifecycle(self):
        # create
        res = self.client_api.post(
            reverse('client_create', args=[self.broker.id]),
            {'name': 'Client One', 'arc_id': 'CL001', 'deposited_amount': 1000, 'withdrawal_amount': 100},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        cid = res.data['data']['id']
        self.assertEqual(res.data['data']['earned_amount'], '0')
        self.assertFalse(res.data['data']['is_legitimate'])

        # list under broker
        res = self.client_api.get(reverse('client_list', args=[self.broker.id]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['data']), 1)

        # get
        res = self.client_api.get(reverse('client_get', args=[cid]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # update
        res = self.client_api.put(
            reverse('client_update', args=[cid]),
            {'name': 'Client Two', 'arc_id': 'CL002', 'deposited_amount': 2000,
             'withdrawal_amount': 50, 'is_legitimate': True, 'status': 'Inactive'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['arc_id'], 'CL002')
        self.assertEqual(res.data['data']['earned_amount'], '20.0')
        self.assertTrue(res.data['data']['is_legitimate'])

        # delete
        res = self.client_api.delete(reverse('client_delete', args=[cid]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_client_create_missing_arc_id(self):
        res = self.client_api.post(
            reverse('client_create', args=[self.broker.id]),
            {'name': 'Client One', 'deposited_amount': 100}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_client_create_missing_name(self):
        res = self.client_api.post(
            reverse('client_create', args=[self.broker.id]),
            {'arc_id': 'CL001', 'deposited_amount': 100}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_client_create_invalid_amount(self):
        res = self.client_api.post(
            reverse('client_create', args=[self.broker.id]),
            {'arc_id': 'CL-X', 'deposited_amount': 'abc'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_client_create_duplicate_arc_id(self):
        Client.objects.create(arc_id='DUP', broker=self.broker,
                              deposited_amount=0, withdrawal_amount=0,
                              created_by=self.admin)
        res = self.client_api.post(
            reverse('client_create', args=[self.broker.id]),
            {'arc_id': 'DUP', 'deposited_amount': 0}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_client_create_broker_404(self):
        res = self.client_api.post(
            reverse('client_create', args=[9999]),
            {'arc_id': 'X', 'deposited_amount': 0}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_client_list_broker_404(self):
        res = self.client_api.get(reverse('client_list', args=[9999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_client_get_404(self):
        res = self.client_api.get(reverse('client_get', args=[9999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_client_update_404(self):
        res = self.client_api.put(reverse('client_update', args=[9999]),
                                  {'arc_id': 'X'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_client_update_duplicate_arc_id(self):
        c1 = Client.objects.create(arc_id='CA', broker=self.broker,
                                   deposited_amount=0, withdrawal_amount=0,
                                   created_by=self.admin)
        c2 = Client.objects.create(arc_id='CB', broker=self.broker,
                                   deposited_amount=0, withdrawal_amount=0,
                                   created_by=self.admin)
        res = self.client_api.put(reverse('client_update', args=[c2.id]),
                                  {'arc_id': 'CA'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_client_update_invalid_amount(self):
        c = Client.objects.create(arc_id='CC', broker=self.broker,
                                  deposited_amount=0, withdrawal_amount=0,
                                  created_by=self.admin)
        res = self.client_api.put(reverse('client_update', args=[c.id]),
                                  {'deposited_amount': 'abc'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_client_update_invalid_status(self):
        c = Client.objects.create(arc_id='CD', broker=self.broker,
                                  deposited_amount=0, withdrawal_amount=0,
                                  created_by=self.admin)
        res = self.client_api.put(reverse('client_update', args=[c.id]),
                                  {'status': 'banned'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_client_delete_404(self):
        res = self.client_api.delete(reverse('client_delete', args=[9999]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_client_endpoints_require_permission(self):
        role = Role.objects.create(name='NoClient')
        u = User.objects.create(username='nc', password=hash_password('p'),
                                role=role, status='Active')
        UserBrand.objects.create(user=u, brand=self.brand_a)
        self.auth_as(u)
        res = self.client_api.get(reverse('client_list', args=[self.broker.id]))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_client_brand_access_control(self):
        role = Role.objects.create(name='ClientMgr')
        for key in ('client:view', 'client:update', 'client:delete', 'client:create'):
            RolePermission.objects.create(role=role, permission=self.perms[key])
        u = User.objects.create(username='cmgr', password=hash_password('p'),
                                role=role, status='Active')
        UserBrand.objects.create(user=u, brand=self.brand_a)

        # broker on the brand user cannot access
        other_broker = Broker.objects.create(
            arc_id='OB001', name='ob', brand=self.brand_b, created_by=self.admin,
        )
        other_client = Client.objects.create(
            arc_id='OC001', broker=other_broker, deposited_amount=0,
            withdrawal_amount=0, created_by=self.admin,
        )

        self.auth_as(u)
        res = self.client_api.get(reverse('client_get', args=[other_client.id]))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        res = self.client_api.get(reverse('client_list', args=[other_broker.id]))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# ════════════════════════════════════════════════════════════════════════════
# 8. FULL WORKFLOW INTEGRATION
#    Mirrors the realistic user journey end-to-end.
# ════════════════════════════════════════════════════════════════════════════
class FullWorkflowTests(BaseAPITestCase):

    def test_full_workflow(self):
        # 1. Admin creates a new user
        res = self.client_api.post(
            reverse('user_create'),
            {'username': 'workflow_user', 'password': 'pw',
             'role': 'Admin', 'brands': ['TestBrand']},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # 2. Create a broker under TestBrand
        res = self.client_api.post(
            reverse('broker_create'),
            {'arc_id': 'WF001', 'name': 'Workflow Broker', 'brand': 'TestBrand'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        broker_id = res.data['data']['id']

        # 3. Create two clients under the broker
        for arc in ('WC001', 'WC002'):
            res = self.client_api.post(
                reverse('client_create', args=[broker_id]),
                {'arc_id': arc, 'deposited_amount': 1000, 'withdrawal_amount': 200},
                format='json',
            )
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # 4. Broker now appears in the list (client_count > 0)
        res = self.client_api.get(reverse('broker_list'))
        self.assertIn(broker_id, [b['id'] for b in res.data['data']])

        # 5. Listing clients of the broker returns 2
        res = self.client_api.get(reverse('client_list', args=[broker_id]))
        self.assertEqual(len(res.data['data']), 2)

        # 6. Trying to delete the broker is blocked while clients exist
        res = self.client_api.delete(reverse('broker_delete', args=[broker_id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # 7. Delete each client
        for c in Client.objects.filter(broker_id=broker_id):
            res = self.client_api.delete(reverse('client_delete', args=[c.id]))
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 8. Now broker deletion succeeds
        res = self.client_api.delete(reverse('broker_delete', args=[broker_id]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(Broker.objects.filter(id=broker_id).exists())
