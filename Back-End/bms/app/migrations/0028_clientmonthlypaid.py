from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0027_client_monthly_equity'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClientMonthlyPaid',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('month', models.DateField()),
                ('is_paid', models.BooleanField(default=False)),
                ('paid_amount', models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('client', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='monthly_paid', to='app.client')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='paid_updates', to='app.user')),
            ],
            options={
                'db_table': 'client_monthly_paid',
                'ordering': ['-month'],
                'unique_together': {('client', 'month')},
            },
        ),
    ]
