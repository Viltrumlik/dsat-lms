"""
DSAT LMS v2 — Notifications App Config
Domain: Notifications
Description: In-app notifications. Phase 0: empty stub (no models yet).
"""

from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"
    label = "notifications"
    verbose_name = "Notifications"
