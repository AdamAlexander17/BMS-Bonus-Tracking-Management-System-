from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='role',
            name='description',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='role',
            name='status',
            field=models.CharField(
                choices=[('Active', 'Active'), ('Inactive', 'Inactive')],
                default='Active',
                max_length=10,
            ),
        ),
    ]
