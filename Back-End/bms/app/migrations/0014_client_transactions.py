from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0013_client_is_legitimate'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClientTransaction',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('transaction_type', models.CharField(choices=[('deposit', 'Deposit'), ('withdrawal', 'Withdrawal')], max_length=20)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=15)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('client', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transactions', to='app.client')),
                ('entered_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='client_transactions', to='app.user')),
            ],
            options={
                'db_table': 'client_transactions',
                'ordering': ['-created_at', '-id'],
            },
        ),
    ]
