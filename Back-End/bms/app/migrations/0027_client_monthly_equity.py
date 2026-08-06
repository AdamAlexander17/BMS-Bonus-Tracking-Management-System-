from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0026_clientmonthlylegitimacy'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClientMonthlyEquity',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('month', models.DateField()),
                ('equity_amount', models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('client', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='monthly_equity', to='app.client')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='equity_updates', to='app.user')),
            ],
            options={
                'db_table': 'client_monthly_equity',
                'ordering': ['-month'],
                'unique_together': {('client', 'month')},
            },
        ),
    ]
