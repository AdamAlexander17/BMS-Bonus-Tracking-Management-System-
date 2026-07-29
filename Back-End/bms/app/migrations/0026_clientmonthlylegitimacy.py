from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0025_brokerpayout_decline_amount'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClientMonthlyLegitimacy',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('month', models.DateField()),
                ('legitimacy_status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('declined', 'Declined')], default='pending', max_length=20)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('client', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='monthly_legitimacy', to='app.client')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='legitimacy_updates', to='app.user')),
            ],
            options={
                'db_table': 'client_monthly_legitimacy',
                'ordering': ['-month'],
                'unique_together': {('client', 'month')},
            },
        ),
    ]
