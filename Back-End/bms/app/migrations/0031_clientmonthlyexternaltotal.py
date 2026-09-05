from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0030_set_bazaarfx_earning_rate'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClientMonthlyExternalTotal',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month', models.DateField()),
                ('deposited_amount', models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ('withdrawal_amount', models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ('synced_at', models.DateTimeField(auto_now=True)),
                ('client', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='monthly_external_totals', to='app.client')),
            ],
            options={
                'db_table': 'client_monthly_external_totals',
                'ordering': ['-month'],
                'unique_together': {('client', 'month')},
            },
        ),
    ]