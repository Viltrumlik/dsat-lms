"""
DSAT LMS v2 — Mailer service
Domain: Mailer
Description: The one door out. Everything that sends email goes through `send()`.

That single entry point is what makes the quotas mean anything: a limit any
caller can walk around is a suggestion. There is no `send_mail()` anywhere in
the apps any more — `send()` writes the outbox row, asks quota.check, and hands
delivery to Celery.

Delivery is deliberately separate from queueing. A student pressing "send me a
code" must not wait on an SMTP handshake, and a provider being briefly down must
not turn into a 500 on a signup form: the row is already saved, the task retries,
and the outbox says exactly where it got to.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMessage as DjangoEmail
from django.core.mail import get_connection
from django.utils import timezone

from . import quota
from .models import EmailMessage

logger = logging.getLogger(__name__)


def send(
    to_email: str,
    subject: str,
    body: str,
    *,
    kind: str = EmailMessage.Kind.OTHER,
    user=None,
) -> EmailMessage:
    """Queue one email. Returns the outbox row.

    Raises `quota.QuotaExceededError` when a limit refuses it — the caller decides
    whether that is an error the user should see (a resend they asked for) or
    something to swallow (a notification nobody is waiting on).
    """
    email = to_email.strip().lower()
    quota.check(email, kind)

    message = EmailMessage.objects.create(
        to_email=email,
        user=user,
        kind=kind,
        subject=subject,
        body=body,
    )
    _dispatch(message)
    return message


def send_quietly(to_email: str, subject: str, body: str, **kwargs) -> EmailMessage | None:
    """`send()` for callers with nobody waiting on the answer.

    A refused quota is recorded as a suppressed row rather than raised: a
    background reminder that hits the daily cap is a fact to look at later, not
    an exception to crash a beat task with.
    """
    try:
        return send(to_email, subject, body, **kwargs)
    except quota.QuotaExceededError as exc:
        EmailMessage.objects.create(
            to_email=to_email.strip().lower(),
            user=kwargs.get("user"),
            kind=kwargs.get("kind", EmailMessage.Kind.OTHER),
            subject=subject,
            body=body,
            status=EmailMessage.Status.SUPPRESSED,
            reason=exc.reason,
        )
        logger.info("Email to %s suppressed (%s)", to_email, exc.reason)
        return None


def _dispatch(message: EmailMessage) -> None:
    """Hand the row to the worker, or deliver inline if there is no worker."""
    from .tasks import deliver_email

    try:
        deliver_email.delay(str(message.id))
    except Exception:  # noqa: BLE001 — broker down; the row is safe either way
        logger.exception("Could not enqueue email %s; delivering inline", message.id)
        deliver(message)


def deliver(message: EmailMessage) -> bool:
    """Actually talk to the provider. Returns whether it went.

    Re-checks suppression at delivery time: an address can be added to the list
    between queueing and sending, and the point of the list is that nothing
    reaches it.
    """
    from .models import EmailSuppression

    if message.status == EmailMessage.Status.SENT:
        return True

    if EmailSuppression.objects.filter(email__iexact=message.to_email).exists():
        message.status = EmailMessage.Status.SUPPRESSED
        message.reason = "suppressed"
        message.save(update_fields=["status", "reason", "updated_at"])
        return False

    message.attempts += 1
    try:
        DjangoEmail(
            subject=message.subject,
            body=message.body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@dsat.local"),
            to=[message.to_email],
            connection=get_connection(),
        ).send(fail_silently=False)
    except Exception as exc:  # noqa: BLE001
        message.status = EmailMessage.Status.FAILED
        message.error = str(exc)[:2000]
        message.save(update_fields=["status", "attempts", "error", "updated_at"])
        logger.warning("Email %s to %s failed: %s", message.id, message.to_email, exc)
        return False

    message.status = EmailMessage.Status.SENT
    message.sent_at = timezone.now()
    message.error = ""
    message.save(update_fields=["status", "attempts", "sent_at", "error", "updated_at"])
    return True
