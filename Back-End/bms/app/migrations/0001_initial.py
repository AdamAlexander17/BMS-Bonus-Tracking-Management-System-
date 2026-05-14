import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Brand',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=50, unique=True)),
            ],
            options={'db_table': 'brands'},
        ),
        migrations.CreateModel(
            name='Permission',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('module', models.CharField(max_length=50, choices=[('broker','Broker'),('client','Client'),('report','Report'),('user','User')])),
                ('action', models.CharField(max_length=50, choices=[('create','Create'),('update','Update'),('delete','Delete'),('view','View'),('approve','Approve'),('comment','Comment')])),
            ],
            options={'db_table': 'permissions'},
        ),
        migrations.AddConstraint(
            model_name='permission',
            constraint=models.UniqueConstraint(fields=['module','action'], name='unique_module_action'),
        ),
        migrations.CreateModel(
            name='Role',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=50, unique=True)),
            ],
            options={'db_table': 'roles'},
        ),
        migrations.CreateModel(
            name='RolePermission',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('role', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='role_permissions', to='app.role')),
                ('permission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='role_permissions', to='app.permission')),
            ],
            options={'db_table': 'role_permissions'},
        ),
        migrations.AddConstraint(
            model_name='rolepermission',
            constraint=models.UniqueConstraint(fields=['role','permission'], name='unique_role_permission'),
        ),
        migrations.AddField(
            model_name='role',
            name='permissions',
            field=models.ManyToManyField(related_name='roles', through='app.RolePermission', to='app.permission'),
        ),
        migrations.CreateModel(
            name='User',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('username', models.CharField(max_length=150, unique=True)),
                ('password', models.CharField(max_length=255)),
                ('status', models.CharField(choices=[('Active','Active'),('Inactive','Inactive')], default='Active', max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('role', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='users', to='app.role')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_users', to='app.user')),
            ],
            options={'db_table': 'users'},
        ),
        migrations.CreateModel(
            name='UserBrand',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='user_brands', to='app.user')),
                ('brand', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='user_brands', to='app.brand')),
            ],
            options={'db_table': 'user_brands'},
        ),
        migrations.AddConstraint(
            model_name='userbrand',
            constraint=models.UniqueConstraint(fields=['user','brand'], name='unique_user_brand'),
        ),
        migrations.AddField(
            model_name='user',
            name='brands',
            field=models.ManyToManyField(related_name='users', through='app.UserBrand', to='app.brand'),
        ),
        migrations.CreateModel(
            name='UserToken',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('refresh_token', models.CharField(max_length=512, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tokens', to='app.user')),
            ],
            options={'db_table': 'user_tokens'},
        ),
    ]


