from django.urls import path
from app import views

urlpatterns = [
    path('login/', views.login, name='login'),
    path('token/refresh/', views.refresh_token, name='token_refresh'),
    path('logout/', views.logout, name='logout'),
]
