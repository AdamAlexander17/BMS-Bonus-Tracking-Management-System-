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
# Brands are managed via the UI; seed does not create or modify brand records.
print('• Brands: skipped (managed via UI)')

# ─── Permissions ─────────────────────────────────────────────────────────────
permissions_data = [
    ('broker', 'create'), ('broker', 'update'), ('broker', 'delete'), ('broker', 'view'), ('broker', 'view_all'),
    ('client', 'create'), ('client', 'update'), ('client', 'delete'), ('client', 'view'), ('client', 'trading_ok'),
    ('report', 'view'),   ('report', 'export'),
    ('auditlog', 'view'), ('auditlog', 'export'),
    ('user',   'create'), ('user',   'update'),  ('user',   'delete'),  ('user', 'view'),
    ('brand',  'create'), ('brand',  'update'),  ('brand',  'delete'),  ('brand', 'view'),
    ('role',   'create'), ('role',   'update'),  ('role',   'delete'),  ('role', 'view'),
    ('bonus',  'manage'), ('bonus',  'pay'),
    ('transactions', 'view'),
]
for module, action in permissions_data:
    Permission.objects.get_or_create(module=module, action=action)
print(f'✔ Permissions seeded: {len(permissions_data)} entries')

# ─── Roles & their permissions ───────────────────────────────────────────────
role_permissions_map = {
    'Admin': [
        ('broker','create'),('broker','update'),('broker','delete'),('broker','view'),('broker','view_all'),
        ('client','create'),('client','update'),('client','delete'),('client','view'),('client','trading_ok'),
        ('report','view'),  ('report','export'),
        ('auditlog','view'),('auditlog','export'),
        ('user','create'),  ('user','update'),  ('user','delete'),  ('user','view'),
        ('brand','create'), ('brand','update'), ('brand','delete'), ('brand','view'),
        ('role','create'),  ('role','update'),  ('role','delete'),  ('role','view'),
        ('bonus','manage'), ('bonus','pay'),
        ('transactions','view'),
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
        ('broker','view'),('broker','view_all'),
        ('client','view'),('client','trading_ok'),
        ('report','view'),('report','export'),
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

admin_user, created = User.objects.get_or_create(
    username=admin_username,
    defaults={
        'password': hash_password(admin_password),
        'status': 'Active',
        'created_by': None,
    },
)

admin_role = Role.objects.get(name='Admin')
UserRole.objects.get_or_create(user=admin_user, role=admin_role)

# Assign EVERY existing brand to the admin so audit logs / tenant-scoped
# queries from other users can match against the admin's brand set.
all_brands = list(Brand.objects.all())
if all_brands:
    admin_user.brands.set(all_brands)

if created:
    print(f'✔ Admin user created → username: {admin_username} | password: {admin_password}')
else:
    print(f'✔ Admin user already exists → brands re-synced ({len(all_brands)} brand(s))')

print('\n✅ Seed complete.')
