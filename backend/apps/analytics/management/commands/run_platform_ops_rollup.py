"""
DSAT LMS v2 — Roll up platform flow metrics on demand (Phase 5.1)
Domain: Analytics (dev/ops tooling)

Re-rolls the trailing PlatformOpsDaily window — the same logic the daily beat
task runs. Handy for dev/e2e and backfills.

    python manage.py run_platform_ops_rollup
"""

from django.core.management.base import BaseCommand

from apps.analytics.admin_ops import rollup_recent


class Command(BaseCommand):
    help = "Re-roll the trailing window of platform flow metrics into PlatformOpsDaily."

    def handle(self, *args, **options):
        summary = rollup_recent()
        self.stdout.write(
            self.style.SUCCESS("Rolled up through {through} ({days} days).".format(**summary))
        )
