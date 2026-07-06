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


@shared_task
def materialize_office_hours():
    """Daily: create OfficeHourSession occurrences for the next fortnight (S5)."""
    from .office_hours import materialize_office_hours as _materialize

    return _materialize()


@shared_task
def send_office_hour_reminders():
    """Daily: remind joined students of office-hours sessions within 24h (S5)."""
    from .office_hours import send_office_hour_reminders as _remind

    return _remind()
