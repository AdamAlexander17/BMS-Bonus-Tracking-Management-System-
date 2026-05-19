"""
Refactor:
  - Role gets a single brand (FK).
  - User → many roles (m2m through UserRole).
  - User.role (FK) and UserBrand (m2m table) are removed.

Data preservation:
  - For each existing user, create a UserRole entry from their old role FK.
  - For each existing role, set role.brand to the most-common brand among the
    UserBrand entries of users holding that role (fallback: first available Brand).
"""
from collections import Counter

import django.db.models.deletion
from django.db import migrations, models


def copy_data(apps, schema_editor):
    User       = apps.get_model('app', 'User')
    Role       = apps.get_model('app', 'Role')
    Brand      = apps.get_model('app', 'Brand')
    UserRole   = apps.get_model('app', 'UserRole')
    UserBrand  = apps.get_model('app', 'UserBrand')

    # 1) Copy User.role → UserRole(user, role)
    for u in User.objects.all():
        if u.role_id:
            UserRole.objects.get_or_create(user_id=u.id, role_id=u.role_id)

    # 2) For each role, pick the most-common brand among its users (via UserBrand).
    fallback_brand = Brand.objects.order_by('id').first()
    for role in Role.objects.all():
        user_ids = list(UserRole.objects.filter(role_id=role.id).values_list('user_id', flat=True))
        brand_id = None
        if user_ids:
            brand_ids = list(
                UserBrand.objects
                .filter(user_id__in=user_ids)
                .values_list('brand_id', flat=True)
            )
            if brand_ids:
                brand_id = Counter(brand_ids).most_common(1)[0][0]
        if brand_id is None and fallback_brand:
            brand_id = fallback_brand.id
        if brand_id is not None:
            role.brand_id = brand_id
            role.save(update_fields=['brand_id'])


def reverse_noop(apps, schema_editor):
    # Irreversible: the original FK/m2m are dropped after this runs.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0007_add_rm_user_to_broker'),
    ]

    operations = [
        # ── Schema additions ────────────────────────────────────────────────
        migrations.AddField(
            model_name='role',
            name='brand',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='roles',
                to='app.brand',
            ),
        ),
        migrations.CreateModel(
            name='UserRole',
            fields=[
                ('id',   models.BigAutoField(primary_key=True, serialize=False)),
                ('role', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='user_roles',
                    to='app.role',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='user_roles',
                    to='app.user',
                )),
            ],
            options={
                'db_table': 'user_roles',
                'unique_together': {('user', 'role')},
            },
        ),
        migrations.AddField(
            model_name='user',
            name='roles',
            field=models.ManyToManyField(
                related_name='users',
                through='app.UserRole',
                to='app.role',
            ),
        ),

        # ── Data migration ──────────────────────────────────────────────────
        migrations.RunPython(copy_data, reverse_noop),

        # ── Schema removals ─────────────────────────────────────────────────
        migrations.RemoveField(
            model_name='user',
            name='role',
        ),
        migrations.RemoveField(
            model_name='user',
            name='brands',
        ),
        migrations.RemoveField(
            model_name='userbrand',
            name='brand',
        ),
        migrations.RemoveField(
            model_name='userbrand',
            name='user',
        ),
        migrations.DeleteModel(
            name='UserBrand',
        ),
    ]
