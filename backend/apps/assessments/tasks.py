"""
DSAT LMS v2 — Assessment Tasks
Domain: Assessments
Description: Beat task — sweep dead sessions into the `abandoned` status so the
            dashboard stops offering "Resume" on tests that can't be resumed.
            Scheduled daily via CELERY_BEAT_SCHEDULE.
"""

import datetime as dt
import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger("apps.assessments")

# A timed session whose clock ran out is abandoned once it's also been inactive
# this long (a same-day return can still submit and get graded).
EXPIRED_GRACE_HOURS = 24
# Paused / untimed sessions never expire by clock — abandon on pure inactivity.
STALE_DAYS = 7


@shared_task
def abandon_stale_sessions():
    """Mark dead in_progress/paused sessions abandoned. Returns how many.

    - Timed + expired (server clock at 0) and inactive > 24h → abandoned.
    - Any candidate inactive > 7 days (paused mid-test, untimed) → abandoned.
    """
    from .models import ExamSession
    from .services import server_time_remaining

    now = timezone.now()
    candidates = ExamSession.objects.filter(
        status__in=[ExamSession.Status.IN_PROGRESS, ExamSession.Status.PAUSED],
        updated_at__lt=now - dt.timedelta(hours=EXPIRED_GRACE_HOURS),
    ).select_related("exam")

    abandoned = 0
    for session in candidates:
        remaining = server_time_remaining(session)
        expired = remaining is not None and remaining <= 0
        stale = session.updated_at < now - dt.timedelta(days=STALE_DAYS)
        if expired or stale:
            session.status = ExamSession.Status.ABANDONED
            session.save(update_fields=["status", "updated_at"])
            abandoned += 1

    if abandoned:
        logger.info("Abandoned %s stale exam session(s)", abandoned)
    return abandoned
