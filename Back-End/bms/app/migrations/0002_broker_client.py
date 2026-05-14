import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Broker',
            fields=[
                ('id',            models.BigAutoField(primary_key=True, serialize=False)),
                ('arc_id',        models.CharField(max_length=100, unique=True)),
                ('name',          models.CharField(max_length=150)),
                ('amount_earned', models.DecimalField(max_digits=15, decimal_places=2, default=0)),
                ('status',        models.CharField(
                    choices=[('Active', 'Active'), ('Inactive', 'Inactive')],
                    default='Active',
                    max_length=10,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('brand', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='brokers',
                    to='app.brand',
                )),
                ('created_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='created_brokers',
                    to='app.user',
                )),
                ('rm', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='brokers',
                    to='app.user',
                )),
            ],
            options={'db_table': 'brokers'},
        ),
        migrations.CreateModel(
            name='Client',
            fields=[
                ('id',                models.BigAutoField(primary_key=True, serialize=False)),
                ('arc_id',            models.CharField(max_length=100, unique=True)),
                ('deposited_amount',  models.DecimalField(max_digits=15, decimal_places=2, default=0)),
                ('withdrawal_amount', models.DecimalField(max_digits=15, decimal_places=2, default=0)),
                ('status',            models.CharField(
                    choices=[('Active', 'Active'), ('Inactive', 'Inactive')],
                    default='Active',
                    max_length=10,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('broker', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='clients',
                    to='app.broker',
                )),
                ('created_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='created_clients',
                    to='app.user',
                )),
            ],
            options={'db_table': 'clients'},
        ),
    ]
