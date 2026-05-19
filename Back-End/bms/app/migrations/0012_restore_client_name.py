from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0011_drop_client_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='client',
            name='name',
            field=models.CharField(default='', max_length=100),
            preserve_default=False,
        ),
    ]
