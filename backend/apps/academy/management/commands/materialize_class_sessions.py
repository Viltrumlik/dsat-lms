"""
DSAT LMS v2 — Materialize class sessions on demand (5.2b)
Domain: Academy (dev/ops tooling)

Creates dated ClassSessions from active recurring schedule rules — the same logic
the daily beat task runs. Handy for dev/e2e.

    python manage.py materialize_class_sessions
"""

from django.core.management.base import BaseCommand

from apps.academy.schedule import materialize_class_sessions


class Command(BaseCommand):
    help = "Materialize dated class sessions from active recurring schedule rules."

    def handle(self, *args, **options):
        created = materialize_class_sessions()
        self.stdout.write(self.style.SUCCESS(f"Created {created} class session(s)."))
