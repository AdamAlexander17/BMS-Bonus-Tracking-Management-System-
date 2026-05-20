"""
Run with: python seed.py
Seeds: brands, permissions, roles, role_permissions, and first Admin user.
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bms.settings')
django.setup()

from app.models import Brand, Permission, Role, RolePermission, User, UserRole
from app.utils import hash_password

# ─── Brands ──────────────────────────────────────────────────────────────────
brands_data = ['TK', 'TB', 'BFx']
for name in brands_data:
    Brand.objects.get_or_create(name=name)
print(f'✔ Brands seeded: {brands_data}')

# ─── Permissions ─────────────────────────────────────────────────────────────
permissions_data = [
    ('broker', 'create'), ('broker', 'update'), ('broker', 'delete'), ('broker', 'view'),
    ('client', 'create'), ('client', 'update'), ('client', 'delete'), ('client', 'view'), ('client', 'trading_ok'),
    ('report', 'view'),   ('report', 'export'),
    ('auditlog', 'view'),
    ('user',   'create'), ('user',   'update'),  ('user',   'delete'),  ('user', 'view'),
    ('brand',  'create'), ('brand',  'update'),  ('brand',  'delete'),  ('brand', 'view'),
    ('role',   'create'), ('role',   'update'),  ('role',   'delete'),  ('role', 'view'),
]
for module, action in permissions_data:
    Permission.objects.get_or_create(module=module, action=action)
print(f'✔ Permissions seeded: {len(permissions_data)} entries')

# ─── Roles & their permissions ───────────────────────────────────────────────
role_permissions_map = {
    'Admin': [
        ('broker','create'),('broker','update'),('broker','delete'),('broker','view'),
        ('client','create'),('client','update'),('client','delete'),('client','view'),('client','trading_ok'),
        ('report','view'),  ('report','export'),
        ('auditlog','view'),
        ('user','create'),  ('user','update'),  ('user','delete'),  ('user','view'),
        ('brand','create'), ('brand','update'), ('brand','delete'), ('brand','view'),
        ('role','create'),  ('role','update'),  ('role','delete'),  ('role','view'),
    ],
    'RM': [
        ('broker','create'),('broker','update'),('broker','delete'),('broker','view'),
        ('client','create'),('client','update'),('client','delete'),('client','view'),
    ],
    'JRM': [
        ('broker','create'),('broker','update'),('broker','delete'),('broker','view'),
        ('client','create'),('client','update'),('client','delete'),('client','view'),
    ],
    'FM': [
        ('broker','view'),('client','view'),('report','view'),('report','export'),
    ],
    'Checker': [
        ('broker','view'),('client','view'),('report','view'),('report','export'),
    ],
}

for role_name, perms in role_permissions_map.items():
    # Roles are global — brand association lives on the User, not the Role.
    role, _ = Role.objects.get_or_create(name=role_name)
    for module, action in perms:
        perm = Permission.objects.get(module=module, action=action)
        RolePermission.objects.get_or_create(role=role, permission=perm)

print(f'✔ Roles seeded: {list(role_permissions_map.keys())}')

# ─── First Admin User ─────────────────────────────────────────────────────────
admin_username = 'admin'
admin_password = 'Admin@123'

if not User.objects.filter(username=admin_username).exists():
    admin_role  = Role.objects.get(name='Admin')
    admin_brand = Brand.objects.get(name='TK')
    admin_user  = User.objects.create(
        username=admin_username,
        password=hash_password(admin_password),
        brand=admin_brand,
        status='Active',
        created_by=None,
    )
    UserRole.objects.create(user=admin_user, role=admin_role)
    print(f'✔ Admin user created → username: {admin_username} | password: {admin_password}')
else:
    print(f'⚠ Admin user already exists, skipped.')

print('\n✅ Seed complete.')
