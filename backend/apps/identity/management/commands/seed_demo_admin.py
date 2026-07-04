"""
DSAT LMS v2 — Seed a demo admin user (idempotent).
Domain: Identity
Description: Creates an 'admin'-role user for exercising the /api/v1/admin/ surface
            and the (admin) frontend. is_staff/is_superuser=True so it can also
            reach Django /admin/. Safe to re-run.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.identity.models import User

EMAIL = "admin@dsat.local"
PASSWORD = "DevAdmin123!"


class Command(BaseCommand):
    help = "Seed a demo admin user (idempotent)."

    @transaction.atomic
    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(
            email=EMAIL,
            defaults={
                "first_name": "Demo",
                "last_name": "Admin",
                "role": User.Role.ADMIN,
                "is_staff": True,
                "is_superuser": True,
                "is_email_verified": True,
            },
        )
        if created:
            user.set_password(PASSWORD)
            user.save(update_fields=["password"])
            self.stdout.write(self.style.SUCCESS(f"admin created: {EMAIL} / {PASSWORD}"))
        else:
            self.stdout.write(self.style.WARNING(f"admin exists: {EMAIL}"))
