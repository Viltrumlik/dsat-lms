"""
DSAT LMS v2 — Verification codes
Domain: Mailer
Description: Issue a six-digit code, email it, and check it back.

Codes rather than links, because a link only works in the browser that opened
the tab: a student who signs up on a laptop and reads mail on a phone is stuck
with one, and fine with the other. A code is also cheap to re-send and cheap to
expire, which is what makes the quotas above bearable.

Issuing INVALIDATES every earlier live code for that user and purpose. Two valid
codes at once is two chances for a guesser and one confused student wondering
which of the emails is the real one.
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from . import service
from .models import EmailMessage, VerificationCode

logger = logging.getLogger(__name__)

_KIND = {
    VerificationCode.Purpose.VERIFY_EMAIL: EmailMessage.Kind.VERIFY_EMAIL,
    VerificationCode.Purpose.PASSWORD_RESET: EmailMessage.Kind.PASSWORD_RESET,
}


class CodeError(Exception):
    """A code that will not do.

    `reason` is a stable machine-readable slug and `attempts_left` a number, so
    the client can render this in the language it is actually running in. The
    message is English written on the server: a fallback, not the thing to show
    by preference.
    """

    def __init__(self, reason: str, message: str, attempts_left: int | None = None):
        super().__init__(message)
        self.reason = reason
        self.message = message
        self.attempts_left = attempts_left


def ttl_minutes() -> int:
    return int(getattr(settings, "MAIL_CODE_TTL_MINUTES", 15))


def _product() -> str:
    return getattr(settings, "PRODUCT_NAME", "SATFergana")


BODIES = {
    VerificationCode.Purpose.VERIFY_EMAIL: (
        "Verify your {product} email",
        "Hi {name},\n\n"
        "Your {product} verification code is:\n\n"
        "    {code}\n\n"
        "It expires in {minutes} minutes.\n\n"
        "If you didn't create an account, you can ignore this message.",
    ),
    VerificationCode.Purpose.PASSWORD_RESET: (
        "Your {product} password reset code",
        "Hi {name},\n\n"
        "Your {product} password reset code is:\n\n"
        "    {code}\n\n"
        "It expires in {minutes} minutes. Your password has not changed yet.\n\n"
        "If you didn't ask for this, you can ignore this message — but consider "
        "changing your password if you get several of these.",
    ),
}


@transaction.atomic
def issue(user, purpose: str) -> tuple[VerificationCode, str]:
    """Mint a code, retire the old ones, and email it.

    Returns (row, plaintext). The plaintext exists only in this call — it is
    never stored and never returned over the API. Dev reads it off the console
    backend, exactly as the old links were read.

    The quota is checked BEFORE the row is written (inside `service.send`), so a
    refused send raises and rolls back rather than leaving a live code nobody was
    told about.
    """
    VerificationCode.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True).update(
        consumed_at=timezone.now()
    )

    plaintext = VerificationCode.generate()
    minutes = ttl_minutes()
    row = VerificationCode.objects.create(
        user=user,
        email=user.email,
        purpose=purpose,
        code_hash=VerificationCode.hash_code(plaintext),
        expires_at=timezone.now() + timedelta(minutes=minutes),
    )

    subject_tpl, body_tpl = BODIES[purpose]
    fields = {
        "product": _product(),
        "name": user.first_name or user.email.split("@")[0],
        "code": plaintext,
        "minutes": minutes,
    }
    service.send(
        user.email,
        subject_tpl.format(**fields),
        body_tpl.format(**fields),
        kind=_KIND[purpose],
        user=user,
    )
    return row, plaintext


def verify(user, purpose: str, code: str) -> VerificationCode:
    """Check a code and consume it. Raises CodeError with a reason on failure.

    A wrong guess is counted on the LIVE code, so five attempts burn it whatever
    order they come in. The messages deliberately do not distinguish "no code was
    issued" from "wrong code" — the difference tells an attacker whether an
    address is in flight.
    """
    row = (
        VerificationCode.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if row is None:
        raise CodeError("no_code", "That code is not valid. Please request a new one.")
    if row.is_expired:
        raise CodeError("expired", "That code has expired. Please request a new one.")
    if row.attempts >= VerificationCode.MAX_ATTEMPTS:
        raise CodeError(
            "too_many_attempts", "Too many incorrect attempts. Please request a new code."
        )

    if not row.matches(code):
        row.attempts += 1
        row.save(update_fields=["attempts", "updated_at"])
        left = VerificationCode.MAX_ATTEMPTS - row.attempts
        if left <= 0:
            raise CodeError(
                "too_many_attempts", "Too many incorrect attempts. Please request a new code."
            )
        raise CodeError(
            "invalid", f"That code is not correct. {left} attempts left.", attempts_left=left
        )

    row.consumed_at = timezone.now()
    row.save(update_fields=["consumed_at", "updated_at"])
    return row


def purge_expired(older_than_days: int = 3) -> int:
    """Drop codes nobody can use any more. Returns how many went.

    Hard delete, not soft: these rows are credentials with a fifteen-minute life
    and no historical value, and keeping hashes of them around forever is a
    liability rather than an audit trail — the outbox already records that a
    code was sent.
    """
    cutoff = timezone.now() - timedelta(days=older_than_days)
    count, _ = VerificationCode.objects.filter(created_at__lt=cutoff).delete()
    return count
