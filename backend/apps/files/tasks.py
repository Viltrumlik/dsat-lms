"""
DSAT LMS v2 — Files tasks
Domain: Files
Description: Purge the blobs of attachments soft-deleted more than 30 days ago,
    then hard-remove the row. Scheduled daily via CELERY_BEAT_SCHEDULE.
"""

from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import Attachment

PURGE_AFTER_DAYS = 30


@shared_task
def purge_soft_deleted_attachments():
    """Delete storage blobs + rows for attachments soft-deleted long enough ago.
    Uses all_objects so soft-deleted rows are visible. Returns the purge count."""
    cutoff = timezone.now() - timedelta(days=PURGE_AFTER_DAYS)
    stale = Attachment.all_objects.filter(deleted_at__isnull=False, deleted_at__lt=cutoff)
    purged = 0
    for attachment in stale.iterator():
        if attachment.file:
            attachment.file.delete(save=False)
        Attachment.all_objects.filter(pk=attachment.pk).delete()
        purged += 1
    return purged
