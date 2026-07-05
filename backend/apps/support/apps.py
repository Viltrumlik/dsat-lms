"""
DSAT LMS v2 — Support Center App Config
Domain: Support
Description: Booking (1:1), async Q&A tickets, group office hours, an academic
    mentor layer, and the proactive Support Session Trigger. S0 ships the app
    skeleton only (shared enums + row-scoping + URL mount); models arrive with
    their feature slices.
"""

from django.apps import AppConfig


class SupportConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.support"
    label = "support"
    verbose_name = "Support Center"
