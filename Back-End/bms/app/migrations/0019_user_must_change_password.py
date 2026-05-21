from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0018_client_legitimacy_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='must_change_password',
            field=models.BooleanField(default=True),
        ),
    ]