"""
DSAT LMS v2 — Run the support trigger sweep on demand (S4)
Domain: Support (dev/ops tooling)

Evaluates the active-enrolled cohort and raises/expires support recommendations —
the same logic the daily beat task runs. Handy for dev/e2e and manual re-runs.

    python manage.py run_support_sweep
"""

from django.core.management.base import BaseCommand

from apps.support.services import run_support_sweep


class Command(BaseCommand):
    help = "Run the proactive support-trigger sweep once and print a summary."

    def handle(self, *args, **options):
        summary = run_support_sweep()
        self.stdout.write(
            self.style.SUCCESS(
                "Sweep: {students} students · {created} created · "
                "{notified} notified · {expired} expired".format(**summary)
            )
        )
