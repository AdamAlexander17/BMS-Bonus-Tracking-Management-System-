from django.urls import path
from app import views

urlpatterns = [
    # Auth
    path('login/',                       views.login,        name='login'),
    path('token/refresh/',               views.refresh_token, name='token_refresh'),
    path('logout/',                      views.logout,       name='logout'),

    # User CRUD
    path('users/create/',                views.user_create,  name='user_create'),
    path('users/',                       views.user_list,    name='user_list'),
    path('users/<int:user_id>/',         views.user_get,     name='user_get'),
    path('users/<int:user_id>/update/',  views.user_update,  name='user_update'),
    path('users/<int:user_id>/delete/',  views.user_delete,  name='user_delete'),

    # Brand CRUD
    path('brands/create/',                views.brand_create, name='brand_create'),
    path('brands/',                       views.brand_list,   name='brand_list'),
    path('brands/<int:brand_id>/',        views.brand_get,    name='brand_get'),
    path('brands/<int:brand_id>/update/', views.brand_update, name='brand_update'),
    path('brands/<int:brand_id>/delete/', views.brand_delete, name='brand_delete'),

    # Permission (read-only)
    path('permissions/',                  views.permission_list, name='permission_list'),
    path('permissions/<int:permission_id>/', views.permission_get, name='permission_get'),

    # Role CRUD
    path('roles/create/',                 views.role_create,  name='role_create'),
    path('roles/',                        views.role_list,    name='role_list'),
    path('roles/<int:role_id>/',          views.role_get,     name='role_get'),
    path('roles/<int:role_id>/update/',   views.role_update,  name='role_update'),
    path('roles/<int:role_id>/delete/',   views.role_delete,  name='role_delete'),

    # Role-Permission assignment
    path('roles/<int:role_id>/permissions/assign/', views.role_assign_permissions, name='role_assign_permissions'),
    path('roles/<int:role_id>/permissions/remove/', views.role_remove_permissions, name='role_remove_permissions'),
    path('roles/<int:role_id>/permissions/set/',    views.role_set_permissions,    name='role_set_permissions'),
]
