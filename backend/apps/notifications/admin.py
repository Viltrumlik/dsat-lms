"""
DSAT LMS v2 — Notifications Admin
Domain: Notifications
"""

from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "type", "user", "is_read", "created_at")
    list_filter = ("type", "is_read")
    search_fields = ("title", "user__email")
    autocomplete_fields = ("user",)
    readonly_fields = ("id", "created_at", "updated_at", "read_at")
