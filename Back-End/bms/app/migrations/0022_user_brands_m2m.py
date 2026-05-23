from django.db import migrations, models


def copy_single_brand_to_m2m(apps, schema_editor):
    """Backfill: every user with a legacy single brand gets that brand added to brands M2M."""
    User = apps.get_model('app', 'User')
    for user in User.objects.exclude(brand__isnull=True):
        user.brands.add(user.brand_id)


def reverse_noop(apps, schema_editor):
    # Schema rollback removes the table; data backfill is non-reversible at data layer.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0021_broker_payout'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='brands',
            field=models.ManyToManyField(
                blank=True,
                db_table='user_brands',
                related_name='member_users',
                to='app.brand',
            ),
        ),
        migrations.RunPython(copy_single_brand_to_m2m, reverse_noop),
    ]
