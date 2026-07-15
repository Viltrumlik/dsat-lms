"""
DSAT LMS v2 — run_automation_sweep command
Domain: Automation
Description: Run the daily scheduled automation sweep on demand (dev / manual runs).
"""

from django.core.management.base import BaseCommand

from apps.automation.services import run_automation_sweep


class Command(BaseCommand):
    help = "Apply all enabled scheduled_daily automation rules over the active cohort."

    def handle(self, *args, **options):
        summary = run_automation_sweep()
        self.stdout.write(self.style.SUCCESS(f"Automation sweep: {summary}"))
