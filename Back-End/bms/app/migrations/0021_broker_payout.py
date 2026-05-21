from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0020_set_default_must_change_password_false'),
    ]

    operations = [
        migrations.CreateModel(
            name='BrokerPayout',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=15)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('broker', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payouts', to='app.broker')),
                ('paid_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='broker_payouts', to='app.user')),
            ],
            options={
                'db_table': 'broker_payouts',
                'ordering': ['-created_at', '-id'],
            },
        ),
    ]