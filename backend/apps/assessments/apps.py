"""
DSAT LMS v2 — Assessments App Config
Domain: Assessments
Description: Exam templates, sessions, responses, results, assignments.
"""

from django.apps import AppConfig


class AssessmentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.assessments"
    label = "assessments"
    verbose_name = "Assessments"
