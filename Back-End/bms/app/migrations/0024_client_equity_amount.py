from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0023_user_last_login'),
    ]

    operations = [
        migrations.AddField(
            model_name='client',
            name='equity_amount',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=15),
        ),
    ]
