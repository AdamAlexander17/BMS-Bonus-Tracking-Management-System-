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
    ('client', 'create'), ('client', 'update'), ('client', 'delete'), ('client', 'view'),
    ('report', 'view'),   ('report', 'comment'), ('report', 'approve'),
    ('user',   'create'), ('user',   'update'),  ('user',   'delete'),  ('user', 'view'),
]
for module, action in permissions_data:
    Permission.objects.get_or_create(module=module, action=action)
print(f'✔ Permissions seeded: {len(permissions_data)} entries')

# ─── Roles & their permissions ───────────────────────────────────────────────
role_permissions_map = {
    'Admin': [
        ('broker','create'),('broker','update'),('broker','delete'),('broker','view'),
        ('client','create'),('client','update'),('client','delete'),('client','view'),
        ('report','view'),  ('report','comment'),('report','approve'),
        ('user','create'),  ('user','update'),  ('user','delete'),  ('user','view'),
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
        ('broker','view'),('client','view'),('report','view'),('report','comment'),
    ],
    'Checker': [
        ('broker','view'),('client','view'),('report','view'),('report','approve'),
    ],
}

for role_name, perms in role_permissions_map.items():
    # Each role is scoped to a single brand. Seed creates a copy of every role
    # for every brand, so each brand has its own RM/JRM/FM/Checker/Admin.
    for brand in Brand.objects.all():
        role, _ = Role.objects.get_or_create(name=role_name, brand=brand)
        for module, action in perms:
            perm = Permission.objects.get(module=module, action=action)
            RolePermission.objects.get_or_create(role=role, permission=perm)

print(f'✔ Roles seeded: {list(role_permissions_map.keys())}')

# ─── First Admin User ─────────────────────────────────────────────────────────
admin_username = 'admin'
admin_password = 'Admin@123'

if not User.objects.filter(username=admin_username).exists():
    admin_role = Role.objects.filter(name='Admin').order_by('id').first()
    admin_user = User.objects.create(
        username=admin_username,
        password=hash_password(admin_password),
        status='Active',
        created_by=None,
    )
    UserRole.objects.create(user=admin_user, role=admin_role)
    print(f'✔ Admin user created → username: {admin_username} | password: {admin_password}')
else:
    print(f'⚠ Admin user already exists, skipped.')

print('\n✅ Seed complete.')
