from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0031_clientmonthlyexternaltotal'),
    ]

    operations = [
        migrations.CreateModel(
            name='ExternalTransaction',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('brand_key', models.CharField(max_length=32)),
                ('external_id', models.CharField(max_length=64)),
                ('transaction_type', models.CharField(choices=[('deposit', 'Deposit'), ('withdrawal', 'Withdrawal')], max_length=16)),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ('transaction_date', models.DateTimeField(blank=True, null=True)),
                ('entered_by', models.CharField(blank=True, default='', max_length=100)),
                ('raw_data', models.JSONField(blank=True, default=dict)),
                ('synced_at', models.DateTimeField(auto_now=True)),
                ('client', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='external_transactions', to='app.client')),
            ],
            options={
                'db_table': 'external_transactions',
                'ordering': ['-transaction_date', '-id'],
                'unique_together': {('brand_key', 'external_id', 'transaction_type')},
            },
        ),
        migrations.AddIndex(
            model_name='externaltransaction',
            index=models.Index(fields=['client', 'transaction_date'], name='external_tr_client__ff7a6f_idx'),
        ),
        migrations.AddIndex(
            model_name='externaltransaction',
            index=models.Index(fields=['transaction_type', 'transaction_date'], name='external_tr_transac_4f86c4_idx'),
        ),
    ]
