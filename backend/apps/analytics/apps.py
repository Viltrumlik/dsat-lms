"""
DSAT LMS v2 — Analytics App Config
Domain: Analytics
Description: Stats, rankings, progress (Celery-updated). Phase 0: empty stub.
"""

from django.apps import AppConfig


class AnalyticsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.analytics"
    label = "analytics"
    verbose_name = "Analytics"
