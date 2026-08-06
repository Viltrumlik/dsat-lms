"""
DSAT LMS v2 — Mailer quotas
Domain: Mailer
Description: The limits, in one place, all of them counted off the outbox.

Why not DRF throttling: the existing `auth_verify_email` scope caps requests per
IP, which is the wrong axis for email. It does not stop one address being mailed
from a dozen IPs, it does not stop a Celery loop or a management command sending
without an HTTP request at all, and it has no idea what the day's total is. This
counts what was actually QUEUED, per recipient and overall, so every path that
sends goes through the same gate.

Three limits, each answering a different failure:

    cooldown   the impatient resend — a student clicking "send again" six times
               in ten seconds should get one email, not six.
    per-day    the enumeration / harassment case — a script asking for reset
               codes for one address all afternoon.
    global     the runaway — a bug or a bad import loop burning the month's
               allowance overnight. This one is a hard stop on everything.

Every value is an env var, because the right number depends on the plan you are
paying for.
"""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import EmailMessage, EmailSuppression


class QuotaExceededError(Exception):
    """Refused before anything was queued. `reason` names which limit."""

    def __init__(self, reason: str, message: str, retry_after: int | None = None):
        super().__init__(message)
        self.reason = reason
        self.message = message
        self.retry_after = retry_after


def _setting(name: str, default: int) -> int:
    return int(getattr(settings, name, default))


# Mail a student ASKED for and is waiting on, versus mail we decided to send.
# The two must not share an allowance: a class that got ten announcements this
# morning would otherwise be unable to reset a password this afternoon, and the
# reason would be invisible to everyone involved.
TRANSACTIONAL = frozenset({EmailMessage.Kind.VERIFY_EMAIL, EmailMessage.Kind.PASSWORD_RESET})


def is_transactional(kind: str) -> bool:
    return kind in TRANSACTIONAL


def _counts_against_quota():
    """Rows that used (or tried to use) the allowance.

    A SUPPRESSED row never reached the provider, so it must not count — else a
    student who hit the cooldown once would have that refusal held against them.
    """
    return EmailMessage.objects.filter(
        status__in=(EmailMessage.Status.QUEUED, EmailMessage.Status.SENT)
    )


def check(to_email: str, kind: str) -> None:
    """Raise QuotaExceededError if this send must not happen. Silence means go."""
    email = to_email.strip().lower()
    now = timezone.now()

    if EmailSuppression.objects.filter(email__iexact=email).exists():
        raise QuotaExceededError(
            "suppressed",
            "That address is not accepting mail from us.",
        )

    cooldown = _setting("MAIL_COOLDOWN_SECONDS", 60)
    if cooldown:
        since = now - timedelta(seconds=cooldown)
        last = (
            _counts_against_quota()
            .filter(to_email__iexact=email, kind=kind, created_at__gte=since)
            .order_by("-created_at")
            .first()
        )
        if last is not None:
            wait = cooldown - int((now - last.created_at).total_seconds())
            raise QuotaExceededError(
                "cooldown",
                f"Please wait {max(wait, 1)} seconds before requesting another email.",
                retry_after=max(wait, 1),
            )

    day_ago = now - timedelta(days=1)
    transactional = is_transactional(kind)

    # Counted only against its OWN family, so broadcast volume can never use up
    # a student's ability to receive a code.
    family = TRANSACTIONAL if transactional else None
    per_day = _setting(
        (
            "MAIL_MAX_CODES_PER_RECIPIENT_PER_DAY"
            if transactional
            else "MAIL_MAX_PER_RECIPIENT_PER_DAY"
        ),
        5 if transactional else 10,
    )
    if per_day:
        rows = _counts_against_quota().filter(to_email__iexact=email, created_at__gte=day_ago)
        rows = rows.filter(kind__in=family) if family else rows.exclude(kind__in=TRANSACTIONAL)
        if rows.count() >= per_day:
            raise QuotaExceededError(
                "recipient_daily",
                "This address has reached today's email limit. Please try again tomorrow.",
            )

    # The runaway backstop. Bulk stops early so the last slice of the day's
    # allowance is still there for the student who needs to get back into their
    # account — a marketing loop must not be able to lock everyone out.
    global_day = _setting("MAIL_MAX_PER_DAY", 2000)
    if global_day:
        reserve = 0 if transactional else _setting("MAIL_RESERVE_FOR_CODES", 200)
        ceiling = max(1, global_day - reserve)
        if _counts_against_quota().filter(created_at__gte=day_ago).count() >= ceiling:
            raise QuotaExceededError(
                "global_daily",
                "We are temporarily unable to send email. Please try again later.",
            )


def usage() -> dict:
    """What has gone out in the last day — for the admin and for alerting."""
    day_ago = timezone.now() - timedelta(days=1)
    recent = EmailMessage.objects.filter(created_at__gte=day_ago)
    return {
        "sent_24h": recent.filter(status=EmailMessage.Status.SENT).count(),
        "queued": EmailMessage.objects.filter(status=EmailMessage.Status.QUEUED).count(),
        "failed_24h": recent.filter(status=EmailMessage.Status.FAILED).count(),
        "suppressed_24h": recent.filter(status=EmailMessage.Status.SUPPRESSED).count(),
        "daily_cap": _setting("MAIL_MAX_PER_DAY", 2000),
        "suppressed_addresses": EmailSuppression.objects.count(),
    }
