"""
DSAT LMS v2 — Support Center Celery tasks
Domain: Support
Description: The daily proactive trigger sweep (S4). Registered in
    CELERY_BEAT_SCHEDULE (config/settings/base.py) at 06:00 CELERY_TIMEZONE.
"""

from celery import shared_task


@shared_task
def sweep_support_triggers():
    """Evaluate the active cohort's analytics signals and raise/expire support
    recommendations. Thin wrapper so the schedule points at a stable task path;
    all logic lives in services.run_support_sweep (also callable via the
    run_support_sweep management command)."""
    from .services import run_support_sweep

    return run_support_sweep()
