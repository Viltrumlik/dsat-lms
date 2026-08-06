"""
DSAT LMS v2 — Mailer tasks
Domain: Mailer
Description: Delivery (with retry) and the daily sweep of dead codes.
"""

import logging

from celery import shared_task

from . import codes, service
from .models import EmailMessage

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def deliver_email(self, message_id):
    """Send one queued row.

    Retries a handful of times: a provider blip should not cost a student their
    signup code. It does NOT retry forever — after three tries the row sits at
    FAILED where someone can see it, which is more useful than a task quietly
    looping for a day against an address that will never accept mail.
    """
    try:
        message = EmailMessage.objects.get(pk=message_id)
    except EmailMessage.DoesNotExist:
        return "gone"

    if service.deliver(message):
        return "sent"
    if message.status == EmailMessage.Status.SUPPRESSED:
        return "suppressed"

    try:
        raise self.retry()
    except self.MaxRetriesExceededError:
        logger.error("Email %s gave up after %s attempts", message_id, message.attempts)
        return "failed"


@shared_task
def purge_expired_codes():
    """Daily. Codes live fifteen minutes; the rows have no reason to outlive them."""
    return codes.purge_expired()
