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
# How long a generated practice template lingers before being swept.
GENERATED_EXAM_TTL_DAYS = 7


@shared_task
def reconcile_session_answers():
    """Persist any answer that reached the auto-save blob but not ExamResponse.

    Every answer is POSTed the moment it is chosen (the runner's answer queue),
    which is what makes a session durable mid-flight. But that write can fail —
    a dropped connection, a closed laptop, a 500 — and the only other copy is in
    `client_session_data`, which the 30-second auto-save carries wholesale. That
    blob is a client-owned scratchpad, not the graded record: grading reads
    ExamResponse and nothing else, so an answer that only ever landed there
    would score as omitted.

    This is the net under that. Every live session, every answer in the blob
    with no matching response row, written through. Grading is deliberately NOT
    done here: correctness is settled at submit for a paper, and at answer time
    for a drill, and this task should not become a third place that decides it.
    Existing rows are never touched — the POSTed value is the newer one.
    """
    from apps.question_bank.models import Question

    from .models import ExamQuestion, ExamResponse, ExamSession

    sessions = ExamSession.objects.filter(
        status__in=[ExamSession.Status.IN_PROGRESS, ExamSession.Status.PAUSED]
    ).only("id", "exam_id", "client_session_data")

    recovered = 0
    for session in sessions:
        blob = (session.client_session_data or {}).get("questions") or {}
        if not blob:
            continue

        answered = {
            qid: str(state.get("answer"))
            for qid, state in blob.items()
            if isinstance(state, dict) and str(state.get("answer") or "").strip()
        }
        if not answered:
            continue

        # Only questions actually on this paper, and only ones with no row yet.
        on_paper = set(
            ExamQuestion.objects.filter(
                section__exam_id=session.exam_id, question_id__in=answered
            ).values_list("question_id", flat=True)
        )
        already = set(
            ExamResponse.objects.filter(session=session, question_id__in=on_paper).values_list(
                "question_id", flat=True
            )
        )
        missing = on_paper - already
        if not missing:
            continue

        valid = set(Question.objects.filter(id__in=missing).values_list("id", flat=True))
        ExamResponse.objects.bulk_create(
            [
                ExamResponse(
                    session=session,
                    question_id=question_id,
                    chosen_answer=answered[str(question_id)][:10],
                )
                for question_id in valid
            ],
            ignore_conflicts=True,
        )
        recovered += len(valid)

    if recovered:
        logger.info("Recovered %s answer(s) from auto-save into ExamResponse", recovered)
    return recovered


@shared_task
def cleanup_generated_exams():
    """Retire question-bank drill templates once their sessions are finished.

    A drill mints a template per run; without this the table grows forever.
    """
    from apps.question_bank.practice import cleanup_generated_exams as sweep

    removed = sweep(timezone.now() - dt.timedelta(days=GENERATED_EXAM_TTL_DAYS))
    if removed:
        logger.info("Retired %s generated practice template(s)", removed)
    return removed


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
