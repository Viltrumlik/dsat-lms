"""
DSAT LMS v2 — Audit App Config
Domain: Audit
Description: A central append-only activity log of staff/admin mutations, written
    explicitly via services.record_activity() from write views (not signals) and
    read by the admin audit viewer + the dashboard's recent-activity feed.
"""

from django.apps import AppConfig


class AuditConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.audit"
    label = "audit"
    verbose_name = "Audit"
