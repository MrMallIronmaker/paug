from django.contrib import admin

from .models import Category, Block, Span, PaugProfile

# Register your models here.
admin.site.register([Category, Block, Span, PaugProfile])
