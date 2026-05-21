from django.db import migrations, models


def clear_existing_force_flags(apps, schema_editor):
    User = apps.get_model('app', 'User')
    User.objects.all().update(must_change_password=False)


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0019_user_must_change_password'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='must_change_password',
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(clear_existing_force_flags, migrations.RunPython.noop),
    ]