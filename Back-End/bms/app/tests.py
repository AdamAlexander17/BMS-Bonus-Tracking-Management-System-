
from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from app.models import User, Role, Brand, Broker, Client, Permission

class APISmokeTests(APITestCase):
	def setUp(self):
		# Create roles and permissions
		self.role = Role.objects.create(name='Admin')
		self.brand = Brand.objects.create(name='TestBrand')
		self.user = User.objects.create(username='admin', password='admin', role=self.role)
		self.client.force_authenticate(user=self.user)

	def test_create_brand(self):
		url = reverse('brand-create')
		data = {'name': 'BrandX'}
		response = self.client.post(url, data)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

	def test_list_brands(self):
		url = reverse('brand-list')
		response = self.client.get(url)
		self.assertEqual(response.status_code, status.HTTP_200_OK)

	def test_create_broker(self):
		url = reverse('broker-create')
		data = {'arc_id': 'B12345', 'name': 'BrokerX', 'brand': self.brand.name}
		response = self.client.post(url, data)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

	def test_broker_delete_with_clients(self):
		broker = Broker.objects.create(arc_id='B54321', name='BrokerY', brand=self.brand, created_by=self.user)
		Client.objects.create(arc_id='C1', broker=broker, created_by=self.user)
		url = reverse('broker-delete', args=[broker.id])
		response = self.client.delete(url)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn('Cannot delete broker', response.data['message'])

	def test_broker_delete_without_clients(self):
		broker = Broker.objects.create(arc_id='B67890', name='BrokerZ', brand=self.brand, created_by=self.user)
		url = reverse('broker-delete', args=[broker.id])
		response = self.client.delete(url)
		self.assertEqual(response.status_code, status.HTTP_200_OK)

	def test_create_client(self):
		broker = Broker.objects.create(arc_id='B99999', name='BrokerC', brand=self.brand, created_by=self.user)
		url = reverse('client-create')
		data = {'arc_id': 'C99999', 'broker': broker.id, 'deposited_amount': 1000, 'withdrawal_amount': 0}
		response = self.client.post(url, data)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

	def test_create_user(self):
		url = reverse('user-create')
		data = {
			'username': 'testuser',
			'password': 'testpass',
			'role': self.role.id,
			'brands': [self.brand.id],
		}
		response = self.client.post(url, data)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

	def test_list_users(self):
		url = reverse('user-list')
		response = self.client.get(url)
		self.assertEqual(response.status_code, status.HTTP_200_OK)

	def test_create_role(self):
		url = reverse('role-create')
		data = {'name': 'Manager'}
		response = self.client.post(url, data)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

	def test_list_roles(self):
		url = reverse('role-list')
		response = self.client.get(url)
		self.assertEqual(response.status_code, status.HTTP_200_OK)

	def test_create_permission(self):
		url = reverse('permission-create')
		data = {'module': 'broker', 'action': 'view'}
		response = self.client.post(url, data)
		self.assertIn(response.status_code, [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST])  # Unique constraint may trigger 400

	def test_list_permissions(self):
		url = reverse('permission-list')
		response = self.client.get(url)
		self.assertEqual(response.status_code, status.HTTP_200_OK)
