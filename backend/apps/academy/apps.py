"""
DSAT LMS v2 — Academy App Config
Domain: Academy
Description: Classes, enrollment, attendance. Phase 0: only the Class model exists.
"""

from django.apps import AppConfig


class AcademyConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.academy"
    label = "academy"
    verbose_name = "Academy"
