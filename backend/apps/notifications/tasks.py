"""
DSAT LMS v2 — Notification Tasks
Domain: Notifications
Description: Beat task — homework due-soon reminders. Scheduled daily via
            CELERY_BEAT_SCHEDULE (django_celery_beat syncs it into the DB).
"""

import datetime as dt
import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)

REMINDER_WINDOW_HOURS = 24


@shared_task
def send_homework_due_reminders():
    """Notify actively enrolled students who haven't submitted homework that is
    due within the next 24 hours. Deduped per user + homework (safe to re-run).

    Returns the number of notifications created.
    """
    # Lazy imports keep the domain dependency one-way (homework → notifications).
    from apps.academy.models import ClassEnrollment
    from apps.homework.models import Homework, HomeworkSubmission

    from .models import Notification
    from .services import notify

    now = timezone.now()
    due_soon = Homework.objects.filter(
        is_published=True,
        due_at__gt=now,
        due_at__lte=now + dt.timedelta(hours=REMINDER_WINDOW_HOURS),
    ).select_related("assigned_class")

    sent = 0
    for homework in due_soon:
        done_student_ids = set(
            HomeworkSubmission.objects.filter(
                homework=homework,
                status__in=[
                    HomeworkSubmission.Status.SUBMITTED,
                    HomeworkSubmission.Status.GRADED,
                ],
            ).values_list("student_id", flat=True)
        )
        already_reminded_ids = set(
            Notification.objects.filter(
                type=Notification.Type.HOMEWORK_DUE,
                data__homework_id=str(homework.id),
            ).values_list("user_id", flat=True)
        )
        enrollments = homework.assigned_class.enrollments.filter(
            status=ClassEnrollment.Status.ACTIVE
        ).select_related("student")

        for enrollment in enrollments:
            student = enrollment.student
            if student.id in done_student_ids or student.id in already_reminded_ids:
                continue
            notify(
                student,
                Notification.Type.HOMEWORK_DUE,
                f"Due soon: {homework.title}",
                body=f"{homework.assigned_class.name} — due {homework.due_at:%b %d, %Y}",
                data={
                    "homework_id": str(homework.id),
                    "homework_title": homework.title,
                    "class_name": homework.assigned_class.name,
                    "due_at": homework.due_at.isoformat(),
                },
            )
            sent += 1

    if sent:
        logger.info("Sent %s homework due reminder(s)", sent)
    return sent
