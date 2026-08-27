from decimal import Decimal

from django.db import migrations, models


def set_bazaarfx_rate(apps, schema_editor):
    Brand = apps.get_model('app', 'Brand')
    # BazaarFx brokers earn 2% of deposits; all other brands stay at the 1% default.
    Brand.objects.filter(name='BazaarFx').update(earning_rate=Decimal('2.00'))


def reset_bazaarfx_rate(apps, schema_editor):
    Brand = apps.get_model('app', 'Brand')
    Brand.objects.filter(name='BazaarFx').update(earning_rate=Decimal('1.00'))


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0028_clientmonthlypaid'),
    ]

    operations = [
        migrations.AddField(
            model_name='brand',
            name='earning_rate',
            field=models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('1.00')),
        ),
        migrations.RunPython(set_bazaarfx_rate, reset_bazaarfx_rate),
    ]
