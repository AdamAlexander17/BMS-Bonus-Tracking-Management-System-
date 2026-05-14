from django.db import models


class Brand(models.Model):
    id   = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=50, unique=True)

    class Meta:
        db_table = 'brands'

    def __str__(self):
        return self.name


class Permission(models.Model):
    MODULE_CHOICES = [
        ('broker', 'Broker'),
        ('client', 'Client'),
        ('report', 'Report'),
        ('user',   'User'),
    ]
    ACTION_CHOICES = [
        ('create',  'Create'),
        ('update',  'Update'),
        ('delete',  'Delete'),
        ('view',    'View'),
        ('approve', 'Approve'),
        ('comment', 'Comment'),
    ]

    id     = models.BigAutoField(primary_key=True)
    module = models.CharField(max_length=50, choices=MODULE_CHOICES)
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)

    class Meta:
        db_table = 'permissions'
        unique_together = ('module', 'action')

    def __str__(self):
        return f'{self.module}:{self.action}'


class Role(models.Model):
    id          = models.BigAutoField(primary_key=True)
    name        = models.CharField(max_length=50, unique=True)
    permissions = models.ManyToManyField(
        Permission,
        through='RolePermission',
        related_name='roles'
    )

    class Meta:
        db_table = 'roles'

    def __str__(self):
        return self.name


class RolePermission(models.Model):
    id         = models.BigAutoField(primary_key=True)
    role       = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='role_permissions')
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE, related_name='role_permissions')

    class Meta:
        db_table = 'role_permissions'
        unique_together = ('role', 'permission')

    def __str__(self):
        return f'{self.role.name} → {self.permission}'


class User(models.Model):
    STATUS_CHOICES = [
        ('Active',   'Active'),
        ('Inactive', 'Inactive'),
    ]

    id         = models.BigAutoField(primary_key=True)
    username   = models.CharField(max_length=150, unique=True)
    password   = models.CharField(max_length=255)
    role       = models.ForeignKey(Role, on_delete=models.PROTECT, related_name='users')
    brands     = models.ManyToManyField(
        Brand,
        through='UserBrand',
        related_name='users'
    )
    status     = models.CharField(max_length=10, choices=STATUS_CHOICES, default='Active')
    created_by = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='created_users'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'users'

    def __str__(self):
        return f'{self.username} ({self.role.name})'

    @property
    def is_authenticated(self):
        return True


class UserBrand(models.Model):
    id    = models.BigAutoField(primary_key=True)
    user  = models.ForeignKey(User,  on_delete=models.CASCADE, related_name='user_brands')
    brand = models.ForeignKey(Brand, on_delete=models.CASCADE, related_name='user_brands')

    class Meta:
        db_table = 'user_brands'
        unique_together = ('user', 'brand')

    def __str__(self):
        return f'{self.user.username} → {self.brand.name}'


class UserToken(models.Model):
    id            = models.BigAutoField(primary_key=True)
    user          = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tokens')
    refresh_token = models.CharField(max_length=512, unique=True)
    created_at    = models.DateTimeField(auto_now_add=True)
    expires_at    = models.DateTimeField()

    class Meta:
        db_table = 'user_tokens'

    def __str__(self):
        return f'Token for {self.user.username}'


