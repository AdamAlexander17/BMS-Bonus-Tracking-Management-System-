from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [
        ('app', '0002_broker_client'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='broker',
            name='rm',
        ),
        migrations.AddField(
            model_name='client',
            name='earned_amount',
            field=models.DecimalField(default=0, max_digits=15, decimal_places=2),
        ),
    ]
