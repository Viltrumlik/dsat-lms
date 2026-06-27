"""
DSAT LMS v2 — Identity Tasks
Domain: Identity
Description: Async email delivery. Default task names (apps.identity.tasks.*) match
            the CELERY_TASK_ROUTES "email" queue in settings.
"""

from celery import shared_task

from . import emails
from .models import User


@shared_task
def send_verification_email(user_id):
    user = User.objects.filter(pk=user_id).first()
    if user is not None:
        emails.send_verification_email(user)


@shared_task
def send_password_reset_email(user_id):
    user = User.objects.filter(pk=user_id).first()
    if user is not None:
        emails.send_password_reset_email(user)
