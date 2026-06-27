"""
DSAT LMS v2 — Identity Emails
Domain: Identity
Description: Build + send the verification and password-reset emails.

Sent synchronously here (dev uses the console backend). Each `send_*` is a single
seam: move the body into a Celery task (apps.identity.tasks) later without touching
callers. Links point at the FRONTEND, which then POSTs the uid/token to the
*/confirm/ endpoints.
"""

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail

from .tokens import email_verification_token, encode_uid


def _frontend_url() -> str:
    return getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")


def _from_email() -> str:
    return getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@dsat.local")


def send_verification_email(user) -> str:
    uid = encode_uid(user)
    token = email_verification_token.make_token(user)
    link = f"{_frontend_url()}/verify-email?uid={uid}&token={token}"
    send_mail(
        subject="Verify your DSAT LMS email",
        message=(
            f"Hi {user.first_name},\n\n"
            f"Please verify your email address:\n{link}\n\n"
            "If you didn't create an account, you can ignore this message."
        ),
        from_email=_from_email(),
        recipient_list=[user.email],
        fail_silently=False,
    )
    return link


def send_password_reset_email(user) -> str:
    uid = encode_uid(user)
    token = default_token_generator.make_token(user)
    link = f"{_frontend_url()}/reset-password?uid={uid}&token={token}"
    send_mail(
        subject="Reset your DSAT LMS password",
        message=(
            f"Hi {user.first_name},\n\n"
            f"Reset your password using the link below:\n{link}\n\n"
            "If you didn't request this, you can safely ignore this message."
        ),
        from_email=_from_email(),
        recipient_list=[user.email],
        fail_silently=False,
    )
    return link
