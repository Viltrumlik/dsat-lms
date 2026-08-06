"""
DSAT LMS v2 — Mailer App Config
Domain: Mailer
Description: The outbox every email goes through — queueing, delivery, a
    suppression list, per-recipient and global quotas, and the six-digit codes
    used to verify an address or reset a password.
"""

from django.apps import AppConfig


class MailerConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.mailer"
    label = "mailer"
    verbose_name = "Mailer"
