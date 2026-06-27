"""
DSAT LMS v2 — Homework App Config
Domain: Homework
Description: Homework assignments. Phase 0: empty stub (no models yet).
"""

from django.apps import AppConfig


class HomeworkConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.homework"
    label = "homework"
    verbose_name = "Homework"
