"""
DSAT LMS v2 — Assessment Tasks
Domain: Assessments
Description: Beat task — retire dead sessions so the dashboard stops offering
            "Resume" on tests that can't be resumed. Scheduled daily via
            CELERY_BEAT_SCHEDULE.

A session that ran out of clock is NOT the same as one that was never sat. A
student who answered forty questions and then closed the tab has done the work;
throwing it away — which is what marking it `abandoned` did — loses a real
result and, on any capped assessment, burns the attempt for nothing. So an
expired session that has answers is submitted and graded exactly as if the bell
had gone, with the unanswered questions counting as omitted. Only a session with
nothing in it is abandoned.
"""

import datetime as dt
import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger("apps.assessments")

# A timed session whose clock ran out is retired once it's also been inactive
# this long (a same-day return can still submit itself).
EXPIRED_GRACE_HOURS = 24
# Paused / untimed sessions never expire by clock — retire on pure inactivity.
STALE_DAYS = 7


@shared_task
def abandon_stale_sessions():
    """Retire dead in_progress/paused sessions. Returns {graded, abandoned}.

    - Timed + expired (server clock at 0) and inactive > 24h → graded if any
      answers were recorded, else abandoned.
    - Any candidate inactive > 7 days (paused mid-test, untimed) → same rule.
    """
    from .models import ExamSession
    from .services import grade_session, server_time_remaining

    now = timezone.now()
    candidates = ExamSession.objects.filter(
        status__in=[ExamSession.Status.IN_PROGRESS, ExamSession.Status.PAUSED],
        updated_at__lt=now - dt.timedelta(hours=EXPIRED_GRACE_HOURS),
    ).select_related("exam")

    graded = abandoned = 0
    for session in candidates:
        remaining = server_time_remaining(session)
        expired = remaining is not None and remaining <= 0
        stale = session.updated_at < now - dt.timedelta(days=STALE_DAYS)
        if not (expired or stale):
            continue

        if session.responses.exists():
            try:
                grade_session(session)
            except Exception:  # noqa: BLE001
                logger.exception("Failed to grade stranded session %s", session.id)
                continue
            session.status = ExamSession.Status.COMPLETED
            session.submitted_at = now
            session.save(update_fields=["status", "submitted_at", "updated_at"])
            graded += 1
        else:
            session.status = ExamSession.Status.ABANDONED
            session.save(update_fields=["status", "updated_at"])
            abandoned += 1

    if graded or abandoned:
        logger.info("Retired stale sessions: %s graded, %s abandoned", graded, abandoned)
    return {"graded": graded, "abandoned": abandoned}
