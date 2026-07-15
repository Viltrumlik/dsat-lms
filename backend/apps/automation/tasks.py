"""
DSAT LMS v2 — Automation Celery tasks
Domain: Automation
Description: The daily scheduled sweep (beat) and the event-dispatch task enqueued
    by the dispatch seam. Both delegate to services.py.
"""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task
def run_automation_sweep():
    """Beat task: apply every enabled scheduled_daily rule over the active cohort."""
    from .services import run_automation_sweep as _sweep

    summary = _sweep()
    logger.info("automation sweep: %s", summary)
    return summary


@shared_task
def dispatch_automation_event(event_key, subject_id):
    """Enqueued by dispatch(); runs enabled EVENT rules for one subject."""
    from .services import run_event_dispatch

    return run_event_dispatch(event_key, subject_id)
