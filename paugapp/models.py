from django.db import models
from django.contrib.auth import get_user_model
from django.conf import settings


class PaugProfile(models.Model):
    owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    def __str__(self):
        return self.owner.username


class Category(models.Model):
    name = models.CharField(max_length=200)
    owner = models.ForeignKey(PaugProfile, on_delete=models.CASCADE)
    html_color = models.CharField(max_length=7)

    def __str__(self):
        return self.name


class Block(models.Model):
    name = models.CharField(max_length=350)
    owner = models.ForeignKey(PaugProfile, on_delete=models.CASCADE)
    notes = models.TextField(blank=True)
    timelocked = models.BooleanField(default=False)
    autocomplete = models.BooleanField(default=False)
    start = models.DateTimeField(blank=True, null=True, default=None)
    end = models.DateTimeField(blank=True, null=True, default=None)
    due = models.DateTimeField(blank=True, null=True, default=None)
    completed = models.BooleanField(default=False)
    category = models.ForeignKey(Category, models.SET_NULL, blank=True, null=True, default=None)
    duration = models.PositiveIntegerField(blank=True, null=True, default=None)
    span = models.ForeignKey('Span', models.SET_NULL, blank=True, null=True, default=None)

    def __str__(self):
        return self.name


class Span(models.Model):
    name = models.CharField(max_length=350)
    owner = models.ForeignKey(PaugProfile, on_delete=models.CASCADE)
    start = models.DateTimeField(blank=True, null=True, default=None)
    end = models.DateTimeField(blank=True, null=True, default=None)
    total = models.PositiveIntegerField()
    category = models.ForeignKey(Category, models.SET_NULL, blank=True, null=True, default=None)

    def __str__(self):
        return self.name

