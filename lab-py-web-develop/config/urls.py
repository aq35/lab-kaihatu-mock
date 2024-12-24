# urls.py
from django.contrib import admin
from django.urls import path
from apps.core import views

urlpatterns = [
    path("setup/", views.setup_db),
    path("admin/", admin.site.urls),
    path("users/", views.user_list),
    path("users/create", views.create_user),
    path("users/create-ramdom", views.create_random_user),
]
