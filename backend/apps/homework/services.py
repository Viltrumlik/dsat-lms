"""
DSAT LMS v2 — Homework Services
Domain: Homework
Description: The submission lifecycle, in one place, plus the seams other domains
            call into lazily so the module dependency stays one-way (assessments'
            submit calls complete_submissions_for_session).

Lifecycle:

    ASSIGNED ──submit──> SUBMITTED ──grade──> GRADED
                             │                   │
                             └──return───────────┘
                                    ↓
                                 RETURNED ──submit──> SUBMITTED   (attempt N+1)

Every move is recorded as a HomeworkEvent. The transitions live here rather than
in the views because two of them (submit, grade) are reachable from more than one
place — a student's own submit, an exam-backed session finishing, a teacher
grading from the homework list or from the gradebook — and they must not drift.
"""

from django.db import transaction
from django.utils import timezone


class HomeworkError(Exception):
    """A refusal with a student/teacher-facing reason."""

    def __init__(self, message: str, field: str | None = None):
        super().__init__(message)
        self.message = message
        self.field = field


def get_or_create_submission(homework, student):
    from .models import HomeworkSubmission

    submission, _ = HomeworkSubmission.objects.get_or_create(homework=homework, student=student)
    return submission


def _attachments_owned_by(student, attachment_ids):
    """Resolve ids to Attachments the student actually owns.

    Ownership is checked here, not taken on trust from the request: without it a
    student could attach any attachment id they could guess and hand a teacher a
    readable link to somebody else's file.
    """
    from apps.files.models import Attachment

    if not attachment_ids:
        return []
    found = list(
        Attachment.objects.filter(id__in=attachment_ids, owner=student, deleted_at__isnull=True)
    )
    if len(found) != len(set(attachment_ids)):
        raise HomeworkError("One or more files could not be attached.", field="attachments")
    return found


@transaction.atomic
def submit_homework(homework, student, *, response_text="", attachment_ids=None):
    """Hand work in (or hand it in again after a return).

    Returns the submission. Raises HomeworkError if it is not open for work.
    """
    from .models import HomeworkEvent, HomeworkSubmission, HomeworkSubmissionFile

    submission = get_or_create_submission(homework, student)
    if not submission.is_open_for_work:
        raise HomeworkError("This homework has already been graded.")

    attachments = _attachments_owned_by(student, attachment_ids or [])

    now = timezone.now()
    submission.attempt_number += 1
    submission.status = HomeworkSubmission.Status.SUBMITTED
    submission.submitted_at = now
    submission.is_late = bool(homework.due_at and now > homework.due_at)
    submission.returned_at = None
    if response_text:
        submission.response_text = response_text
    submission.save(
        update_fields=[
            "attempt_number",
            "status",
            "submitted_at",
            "is_late",
            "returned_at",
            "response_text",
            "updated_at",
        ]
    )

    for attachment in attachments:
        HomeworkSubmissionFile.objects.get_or_create(
            submission=submission,
            attachment=attachment,
            defaults={"attempt_number": submission.attempt_number},
        )

    HomeworkEvent.objects.create(
        submission=submission,
        kind=HomeworkEvent.Kind.SUBMITTED,
        actor=student,
        attempt_number=submission.attempt_number,
    )
    return submission


@transaction.atomic
def grade_submission(submission, teacher, *, grade=None, feedback="", grade_scale=None):
    """Record a mark. Only work that has been handed in can be graded."""
    from .models import HomeworkEvent, HomeworkSubmission

    if submission.status == HomeworkSubmission.Status.ASSIGNED:
        raise HomeworkError("This student has not handed anything in yet.")

    submission.status = HomeworkSubmission.Status.GRADED
    submission.grade = grade
    if grade_scale:
        submission.grade_scale = grade_scale
    submission.feedback = feedback or ""
    submission.graded_by = teacher
    submission.graded_at = timezone.now()
    submission.save(
        update_fields=[
            "status",
            "grade",
            "grade_scale",
            "feedback",
            "graded_by",
            "graded_at",
            "updated_at",
        ]
    )

    HomeworkEvent.objects.create(
        submission=submission,
        kind=HomeworkEvent.Kind.GRADED,
        actor=teacher,
        note=feedback or "",
        attempt_number=submission.attempt_number,
    )
    _notify_student(submission, "homework_graded")
    return submission


@transaction.atomic
def return_submission(submission, teacher, *, note=""):
    """Hand the work back for another go.

    The previous grade is cleared: a returned piece is not a graded piece, and
    leaving a stale mark on it would feed the gradebook a score for work the
    student is being asked to redo.
    """
    from .models import HomeworkEvent, HomeworkSubmission

    if submission.status not in (
        HomeworkSubmission.Status.SUBMITTED,
        HomeworkSubmission.Status.GRADED,
    ):
        raise HomeworkError("There is nothing to hand back yet.")

    submission.status = HomeworkSubmission.Status.RETURNED
    submission.returned_at = timezone.now()
    submission.grade = None
    submission.graded_at = None
    submission.feedback = note or ""
    submission.save(
        update_fields=[
            "status",
            "returned_at",
            "grade",
            "graded_at",
            "feedback",
            "updated_at",
        ]
    )

    HomeworkEvent.objects.create(
        submission=submission,
        kind=HomeworkEvent.Kind.RETURNED,
        actor=teacher,
        note=note or "",
        attempt_number=submission.attempt_number,
    )
    _notify_student(submission, "homework_returned")
    return submission


def _notify_student(submission, notification_type):
    """Best-effort in-app notification. Lazy import keeps the dependency one-way,
    and a broker/DB hiccup must never fail the grading itself."""
    import logging

    try:
        from apps.notifications.services import notify

        homework = submission.homework
        notify(
            submission.student,
            notification_type,
            homework.title,
            body=submission.feedback[:200] if submission.feedback else "",
            data={
                "homework_id": str(homework.id),
                "homework_title": homework.title,
            },
        )
    except Exception:  # noqa: BLE001
        logging.getLogger(__name__).exception(
            "Failed to notify %s for submission %s", notification_type, submission.id
        )


def complete_submissions_for_session(session):
    """Flip homework submissions linked to this exam session to submitted.

    Sessions get linked to a submission when the student starts an exam-backed
    homework via POST /homework/{id}/start/. Returns the number updated.

    Goes through the model rather than a bulk .update() so the attempt counter,
    the late flag and the event trail stay consistent with a manual submit —
    an exam-backed hand-in is a hand-in like any other.
    """
    from .models import HomeworkEvent, HomeworkSubmission

    submissions = HomeworkSubmission.objects.filter(
        session=session,
        status__in=(HomeworkSubmission.Status.ASSIGNED, HomeworkSubmission.Status.RETURNED),
    ).select_related("homework")

    now = timezone.now()
    count = 0
    for submission in submissions:
        submission.attempt_number += 1
        submission.status = HomeworkSubmission.Status.SUBMITTED
        submission.submitted_at = now
        submission.is_late = bool(submission.homework.due_at and now > submission.homework.due_at)
        submission.returned_at = None
        submission.save(
            update_fields=[
                "attempt_number",
                "status",
                "submitted_at",
                "is_late",
                "returned_at",
                "updated_at",
            ]
        )
        HomeworkEvent.objects.create(
            submission=submission,
            kind=HomeworkEvent.Kind.SUBMITTED,
            actor=submission.student,
            attempt_number=submission.attempt_number,
        )
        count += 1
    return count
