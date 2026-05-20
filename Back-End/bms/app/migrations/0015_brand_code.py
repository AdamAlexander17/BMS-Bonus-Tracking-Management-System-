from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0014_client_transactions'),
    ]

    operations = [
        migrations.AddField(
            model_name='brand',
            name='code',
            field=models.CharField(max_length=10, blank=True, null=True, default=None),
        ),
    ]
