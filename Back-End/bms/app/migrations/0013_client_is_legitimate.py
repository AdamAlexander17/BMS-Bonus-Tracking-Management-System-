from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0012_restore_client_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='client',
            name='is_legitimate',
            field=models.BooleanField(default=False),
        ),
    ]
