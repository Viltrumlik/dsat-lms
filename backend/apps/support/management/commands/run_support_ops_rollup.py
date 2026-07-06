"""
DSAT LMS v2 — Run the Support ops daily rollup on demand (S7)
Domain: Support (dev/ops tooling)

Regenerates the SupportOpsDaily flow metrics — the same logic the daily beat runs.
Defaults to today; pass --date YYYY-MM-DD to (back)fill a specific day.

    python manage.py run_support_ops_rollup
    python manage.py run_support_ops_rollup --date 2026-07-05
"""

import datetime as dt

from django.core.management.base import BaseCommand, CommandError

from apps.support.ops import run_support_ops_rollup


class Command(BaseCommand):
    help = "Generate (upsert) the Support ops daily rollup for a date (default today)."

    def add_arguments(self, parser):
        parser.add_argument("--date", help="Target date YYYY-MM-DD (default: today).")

    def handle(self, *args, **options):
        target_date = None
        if options.get("date"):
            try:
                target_date = dt.date.fromisoformat(options["date"])
            except ValueError as exc:
                raise CommandError(f"Invalid --date: {exc}") from exc

        summary = run_support_ops_rollup(target_date)
        self.stdout.write(
            self.style.SUCCESS(
                "Rollup {date}: bookings_created={bookings_created} "
                "tickets_created={tickets_created}".format(**summary)
            )
        )
