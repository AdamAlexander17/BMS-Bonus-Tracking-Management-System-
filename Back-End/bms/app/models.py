from decimal import Decimal

from django.db import models


class Brand(models.Model):
    id         = models.BigAutoField(primary_key=True)
    name       = models.CharField(max_length=50, unique=True)
    code       = models.CharField(max_length=10, blank=True, null=True, default=None)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)

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
    brands     = models.ManyToManyField(
        Brand,
        related_name='member_users',
        blank=True,
        db_table='user_brands',
    )
    roles      = models.ManyToManyField(
        Role,
        through='UserRole',
        related_name='users'
    )
    status     = models.CharField(max_length=10, choices=STATUS_CHOICES, default='Active')
    must_change_password = models.BooleanField(default=False)
    last_login = models.DateTimeField(null=True, blank=True)
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

    @property
    def brand_ids(self):
        """Set of brand IDs this user is assigned to (multi-brand access scope)."""
        return list(self.brands.values_list('id', flat=True))

    @property
    def brand_names(self):
        return list(self.brands.values_list('name', flat=True))


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

    def _payout_items(self):
        prefetched = getattr(self, '_prefetched_objects_cache', {})
        if 'payouts' in prefetched:
            return prefetched['payouts']
        return self.payouts.all()

    @property
    def amount_paid(self):
        total = sum((payout.amount for payout in self._payout_items()), Decimal('0'))
        return round(float(total), 2)

    @property
    def amount_declined(self):
        total = sum((Decimal(str(getattr(payout, 'decline_amount', 0) or 0)) for payout in self._payout_items()), Decimal('0'))
        return round(float(total), 2)

    @property
    def pending_payout(self):
        return round(max(self.amount_earned - self.amount_paid - self.amount_declined, 0), 2)

    @property
    def last_paid_at(self):
        payouts = self._payout_items()
        if isinstance(payouts, list):
            return payouts[0].created_at if payouts else None
        latest = payouts.first()
        return latest.created_at if latest else None


class BrokerPayout(models.Model):
    id         = models.BigAutoField(primary_key=True)
    broker      = models.ForeignKey(Broker, on_delete=models.CASCADE, related_name='payouts')
    amount      = models.DecimalField(max_digits=15, decimal_places=2)
    decline_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    paid_by     = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='broker_payouts'
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'broker_payouts'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.broker.arc_id} payout {self.amount}'


class Client(models.Model):
    STATUS_CHOICES = [
        ('Active',   'Active'),
        ('Inactive', 'Inactive'),
    ]
    LEGITIMACY_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('declined', 'Declined'),
    ]

    id                = models.BigAutoField(primary_key=True)
    name              = models.CharField(max_length=100)
    arc_id            = models.CharField(max_length=100, unique=True)
    broker            = models.ForeignKey(Broker, on_delete=models.CASCADE, related_name='clients')
    deposited_amount  = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    withdrawal_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    equity_amount     = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    legitimacy_status = models.CharField(max_length=20, choices=LEGITIMACY_STATUS_CHOICES, default='pending')
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

    def save(self, *args, **kwargs):
        self.is_legitimate = self.legitimacy_status == 'approved'
        super().save(*args, **kwargs)

    @property
    def earned_amount(self):
        if self.legitimacy_status != 'approved':
            return 0

        # 1% of deposited_amount for legitimate trading clients only
        return round(float(self.deposited_amount) * 0.01, 2)

    @property
    def net_dwe(self):
        return (
            Decimal(str(self.deposited_amount or 0))
            - Decimal(str(self.withdrawal_amount or 0))
            - Decimal(str(self.equity_amount or 0))
        )


class ClientTransaction(models.Model):
    TYPE_CHOICES = [
        ('deposit', 'Deposit'),
        ('withdrawal', 'Withdrawal'),
    ]

    id               = models.BigAutoField(primary_key=True)
    client           = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='transactions')
    transaction_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    amount           = models.DecimalField(max_digits=15, decimal_places=2)
    entered_by       = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='client_transactions'
    )
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'client_transactions'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.client.arc_id} {self.transaction_type} {self.amount}'


class ClientMonthlyLegitimacy(models.Model):
    LEGITIMACY_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('declined', 'Declined'),
    ]

    id               = models.BigAutoField(primary_key=True)
    client           = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='monthly_legitimacy')
    month            = models.DateField()  # Always stored as first day of month (YYYY-MM-01)
    legitimacy_status = models.CharField(max_length=20, choices=LEGITIMACY_STATUS_CHOICES, default='pending')
    updated_by       = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='legitimacy_updates'
    )
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'client_monthly_legitimacy'
        unique_together = [['client', 'month']]
        ordering = ['-month']

    def __str__(self):
        return f'{self.client.arc_id} {self.month.strftime("%Y-%m")} {self.legitimacy_status}'


class ClientMonthlyEquity(models.Model):
    id            = models.BigAutoField(primary_key=True)
    client        = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='monthly_equity')
    month         = models.DateField()  # Always stored as first day of month (YYYY-MM-01)
    equity_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    updated_by    = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='equity_updates'
    )
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'client_monthly_equity'
        unique_together = [['client', 'month']]
        ordering = ['-month']

    def __str__(self):
        return f'{self.client.arc_id} {self.month.strftime("%Y-%m")} equity={self.equity_amount}'


class ClientMonthlyPaid(models.Model):
    id           = models.BigAutoField(primary_key=True)
    client       = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='monthly_paid')
    month        = models.DateField()  # Always stored as first day of month (YYYY-MM-01)
    is_paid      = models.BooleanField(default=False)
    paid_amount  = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    updated_by   = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='paid_updates'
    )
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'client_monthly_paid'
        unique_together = [['client', 'month']]
        ordering = ['-month']

    def __str__(self):
        return f'{self.client.arc_id} {self.month.strftime("%Y-%m")} paid={self.is_paid} amount={self.paid_amount}'


class AuditLog(models.Model):
    id           = models.BigAutoField(primary_key=True)
    actor        = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs'
    )
    username     = models.CharField(max_length=150, blank=True, default='')
    module       = models.CharField(max_length=50)
    action       = models.CharField(max_length=50)
    entity_type  = models.CharField(max_length=50, blank=True, default='')
    entity_id    = models.CharField(max_length=50, blank=True, default='')
    entity_label = models.CharField(max_length=255, blank=True, default='')
    description  = models.CharField(max_length=255)
    details      = models.JSONField(default=dict, blank=True)
    ip_address   = models.CharField(max_length=64, blank=True, default='')
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.module}:{self.action} by {self.username or "Unknown"}'


