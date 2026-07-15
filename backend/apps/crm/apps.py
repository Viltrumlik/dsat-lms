"""
DSAT LMS v2 — CRM App Config
Domain: CRM
Description: Pre-enrollment leads pipeline (Lead → activities + follow-up tasks +
    convert-to-student) plus cross-entity tags (GenericForeignKey). Front-office
    staff surface under /api/v1/staff/; admin tag management under /api/v1/admin/.
"""

from django.apps import AppConfig


class CrmConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.crm"
    label = "crm"
    verbose_name = "CRM"
