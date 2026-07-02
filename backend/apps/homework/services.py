"""
DSAT LMS v2 — Homework Services
Domain: Homework
Description: Seams other domains call into (lazily) so the module dependency
            stays one-way: assessments' submit calls complete_submissions_for_session.
"""

from django.utils import timezone


def complete_submissions_for_session(session):
    """Flip homework submissions linked to this exam session to submitted.

    Sessions get linked to a submission when the student starts an exam-backed
    homework via POST /homework/{id}/start/. Returns the number updated.
    """
    from .models import HomeworkSubmission

    return HomeworkSubmission.objects.filter(
        session=session,
        status=HomeworkSubmission.Status.ASSIGNED,
    ).update(
        status=HomeworkSubmission.Status.SUBMITTED,
        submitted_at=timezone.now(),
    )
