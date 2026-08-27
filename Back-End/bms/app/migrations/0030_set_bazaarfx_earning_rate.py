import re
from decimal import Decimal

from django.db import migrations


def _normalize(name):
    return re.sub(r'[^a-z0-9]', '', (name or '').lower())


def set_bazaarfx_rate(apps, schema_editor):
    Brand = apps.get_model('app', 'Brand')
    # Match "BazaarFx", "Bazaar-FX", "Bazaar FX", etc. -> 2% earning rate.
    for brand in Brand.objects.all():
        if _normalize(brand.name) == 'bazaarfx':
            brand.earning_rate = Decimal('2.00')
            brand.save(update_fields=['earning_rate'])


def reset_bazaarfx_rate(apps, schema_editor):
    Brand = apps.get_model('app', 'Brand')
    for brand in Brand.objects.all():
        if _normalize(brand.name) == 'bazaarfx':
            brand.earning_rate = Decimal('1.00')
            brand.save(update_fields=['earning_rate'])


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0029_brand_earning_rate'),
    ]

    operations = [
        migrations.RunPython(set_bazaarfx_rate, reset_bazaarfx_rate),
    ]
