from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0024_client_equity_amount'),
    ]

    operations = [
        migrations.AddField(
            model_name='brokerpayout',
            name='decline_amount',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=15),
        ),
    ]
