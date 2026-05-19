from django.db import migrations, models
from collections import Counter, defaultdict


def move_brand_to_user(apps, schema_editor):
    """
    Move the brand association from Role to User.

    Steps:
      1. For each user, set user.brand from the most common brand among their
         existing role assignments (UserRole.role.brand).
      2. Collapse duplicate Role rows (same name across brands) into a single
         keeper, re-pointing UserRole and RolePermission references, then delete
         the duplicates so we can apply unique=True on Role.name.
    """
    Role           = apps.get_model('app', 'Role')
    UserRole       = apps.get_model('app', 'UserRole')
    RolePermission = apps.get_model('app', 'RolePermission')
    User           = apps.get_model('app', 'User')

    # 1) Populate User.brand from existing UserRole.role.brand
    for user in User.objects.all():
        brand_ids = list(
            UserRole.objects
            .filter(user=user, role__brand__isnull=False)
            .values_list('role__brand_id', flat=True)
        )
        if brand_ids:
            most_common = Counter(brand_ids).most_common(1)[0][0]
            user.brand_id = most_common
            user.save(update_fields=['brand'])

    # 2) Collapse Role duplicates by name
    by_name = defaultdict(list)
    for role in Role.objects.all().order_by('id'):
        by_name[role.name].append(role)

    for name, role_list in by_name.items():
        if len(role_list) <= 1:
            continue
        keeper = role_list[0]
        for dup in role_list[1:]:
            # Re-point user_role rows to keeper, dedup on (user, role)
            for ur in UserRole.objects.filter(role=dup):
                if UserRole.objects.filter(user_id=ur.user_id, role=keeper).exists():
                    ur.delete()
                else:
                    ur.role = keeper
                    ur.save(update_fields=['role'])
            # Re-point role_permission rows to keeper, dedup on (role, permission)
            for rp in RolePermission.objects.filter(role=dup):
                if RolePermission.objects.filter(role=keeper, permission_id=rp.permission_id).exists():
                    rp.delete()
                else:
                    rp.role = keeper
                    rp.save(update_fields=['role'])
            dup.delete()


def reverse_noop(apps, schema_editor):
    # Reverting this migration would require recreating per-brand role copies,
    # which we choose not to support automatically.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0009_role_name_brand_unique'),
    ]

    operations = [
        # Step 1 — add User.brand (nullable for now)
        migrations.AddField(
            model_name='user',
            name='brand',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.PROTECT,
                related_name='users',
                to='app.brand',
            ),
        ),

        # Step 2 — copy brand from Role -> User, then collapse duplicate roles
        migrations.RunPython(move_brand_to_user, reverse_noop),

        # Step 3 — drop the (name, brand) unique constraint
        migrations.AlterUniqueTogether(
            name='role',
            unique_together=set(),
        ),

        # Step 4 — drop Role.brand FK
        migrations.RemoveField(
            model_name='role',
            name='brand',
        ),

        # Step 5 — Role.name becomes globally unique
        migrations.AlterField(
            model_name='role',
            name='name',
            field=models.CharField(max_length=50, unique=True),
        ),
    ]
