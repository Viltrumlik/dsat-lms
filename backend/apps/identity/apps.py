"""
DSAT LMS v2 — Identity App Config
Domain: Identity
Description: Auth, users, permissions. Owns the custom User model (AUTH_USER_MODEL).
"""

from django.apps import AppConfig


class IdentityConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.identity"
    label = "identity"
    verbose_name = "Identity"
