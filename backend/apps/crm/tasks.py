"""
DSAT LMS v2 — CRM Celery tasks
Domain: CRM
Description: Daily follow-up reminder — notifies assignees of tasks coming due,
    deduped via reminder_sent_at so a task is reminded once.
"""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task
def send_follow_up_reminders():
    """Notify each assignee of their not-done follow-up tasks due within 24h that
    haven't already been reminded. Returns the number of reminders sent."""
    from datetime import timedelta

    from django.utils import timezone

    from apps.notifications.services import notify

    from .models import FollowUpTask

    now = timezone.now()
    horizon = now + timedelta(hours=24)
    due = FollowUpTask.objects.filter(
        done=False,
        reminder_sent_at__isnull=True,
        due_at__lte=horizon,
        assignee__isnull=False,
        assignee__deleted_at__isnull=True,
    ).select_related("assignee", "lead")
    sent = 0
    for task in due:
        try:
            notify(
                task.assignee,
                "follow_up_due",
                f"Follow-up due: {task.title}",
                body=task.lead.name,
                data={
                    "lead_id": str(task.lead_id),
                    "task_title": task.title,
                    "due_at": task.due_at.isoformat(),
                    "url": "/admin/leads",
                },
            )
            task.reminder_sent_at = now
            task.save(update_fields=["reminder_sent_at", "updated_at"])
            sent += 1
        except Exception:  # noqa: BLE001
            logger.exception("Failed to send follow-up reminder for task %s", task.id)
    return sent
