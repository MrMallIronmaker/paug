from django.urls import path

from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('block/', views.block, name='block'),
    path('bulk_upload/', views.bulk_upload),
]
