"""
DSAT LMS v2 — Automation App Config
Domain: Automation
Description: A DB-backed rule engine over student signals. Admins compose rules
    (typed condition tree + actions) in a visual builder; rules fire either daily
    (scheduled sweep) or on explicit event dispatch. The condition DSL is a strict
    whitelisted typed tree — NEVER eval. Admin surface under /api/v1/admin/.
"""

from django.apps import AppConfig


class AutomationConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.automation"
    label = "automation"
    verbose_name = "Automation"
