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
    STATUS_CHOICES = [
        ('Active',   'Active'),
        ('Inactive', 'Inactive'),
    ]

    id          = models.BigAutoField(primary_key=True)
    name        = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=255, blank=True, default='')
    status      = models.CharField(max_length=10, choices=STATUS_CHOICES, default='Active')
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
    brand      = models.ForeignKey(
        Brand,
        on_delete=models.PROTECT,
        related_name='users',
        null=True,
        blank=True,
    )
    roles      = models.ManyToManyField(
        Role,
        through='UserRole',
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
        return self.username

    @property
    def is_authenticated(self):
        return True

    @property
    def role_names(self):
        return list(self.roles.values_list('name', flat=True))

    @property
    def brand_name(self):
        return self.brand.name if self.brand_id else None


class UserRole(models.Model):
    id   = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='user_roles')
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='user_roles')

    class Meta:
        db_table = 'user_roles'
        unique_together = ('user', 'role')

    def __str__(self):
        return f'{self.user.username} → {self.role.name}'


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


class Broker(models.Model):
    STATUS_CHOICES = [
        ('Active',   'Active'),
        ('Inactive', 'Inactive'),
    ]

    id            = models.BigAutoField(primary_key=True)
    arc_id        = models.CharField(max_length=6, unique=True)
    name          = models.CharField(max_length=150)
    brand         = models.ForeignKey(Brand, on_delete=models.PROTECT, related_name='brokers')
    rm_user       = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='managed_brokers'
    )
    # amount_earned is now computed from clients' earned_amount
    status        = models.CharField(max_length=10, choices=STATUS_CHOICES, default='Active')
    created_by    = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_brokers'
    )
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'brokers'

    def __str__(self):
        return f'{self.name} ({self.arc_id})'

    @property
    def amount_earned(self):
        # Sum of all clients' earned_amount
        return sum([float(c.earned_amount) for c in self.clients.all()])


class Client(models.Model):
    STATUS_CHOICES = [
        ('Active',   'Active'),
        ('Inactive', 'Inactive'),
    ]

    id                = models.BigAutoField(primary_key=True)
    name              = models.CharField(max_length=100)
    arc_id            = models.CharField(max_length=100, unique=True)
    broker            = models.ForeignKey(Broker, on_delete=models.CASCADE, related_name='clients')
    deposited_amount  = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    withdrawal_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    is_legitimate     = models.BooleanField(default=False)
    status            = models.CharField(max_length=10, choices=STATUS_CHOICES, default='Active')
    created_by        = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_clients'
    )
    created_at        = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'clients'

    def __str__(self):
        return f'{self.name} ({self.arc_id}) → {self.broker.name}'

    @property
    def earned_amount(self):
        if not self.is_legitimate:
            return 0

        # 1% of deposited_amount for legitimate trading clients only
        return round(float(self.deposited_amount) * 0.01, 2)


