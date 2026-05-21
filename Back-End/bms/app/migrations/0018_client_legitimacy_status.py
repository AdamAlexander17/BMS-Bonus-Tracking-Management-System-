from django.db import migrations, models


def seed_legitimacy_status(apps, schema_editor):
    Client = apps.get_model('app', 'Client')
    Client.objects.filter(is_legitimate=True).update(legitimacy_status='approved')
    Client.objects.filter(is_legitimate=False).update(legitimacy_status='pending')


def sync_is_legitimate(apps, schema_editor):
    Client = apps.get_model('app', 'Client')
    Client.objects.filter(legitimacy_status='approved').update(is_legitimate=True)
    Client.objects.exclude(legitimacy_status='approved').update(is_legitimate=False)


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0017_brand_created_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='client',
            name='legitimacy_status',
            field=models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('declined', 'Declined')], default='pending', max_length=20),
        ),
        migrations.RunPython(seed_legitimacy_status, migrations.RunPython.noop),
        migrations.RunPython(sync_is_legitimate, migrations.RunPython.noop),
    ]