"""
DSAT LMS v2 — Mailer models
Domain: Mailer
Description: An outbox, a suppression list, and the codes we email out.

Every message this system sends becomes a ROW before it becomes an email. That
is the whole point: `send_mail()` scattered through the apps leaves no record of
what was sent, to whom, whether it arrived, or how often — which is exactly the
information you need the day the bill arrives, or the day a student says "I
never got the code".

`EmailSuppression` is the biggest saving of the three. A dead address does not
get better by being written to again; a provider charges for the attempt and
punishes the sending domain's reputation for the bounce. Once an address is
suppressed nothing is queued for it at all.
"""

import hashlib
import hmac
import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

from common.models import BaseModel


class EmailMessage(BaseModel):
    """One outbound email — queued, then delivered (or not)."""

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        # Never handed to the provider: over quota, or the address is dead.
        SUPPRESSED = "suppressed", "Suppressed"

    class Kind(models.TextChoices):
        VERIFY_EMAIL = "verify_email", "Email verification code"
        PASSWORD_RESET = "password_reset", "Password reset code"
        ANNOUNCEMENT = "announcement", "Announcement"
        NOTIFICATION = "notification", "Notification"
        OTHER = "other", "Other"

    to_email = models.EmailField(db_index=True)
    user = models.ForeignKey(
        "identity.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="emails",
    )
    kind = models.CharField(max_length=32, choices=Kind.choices, default=Kind.OTHER, db_index=True)
    subject = models.CharField(max_length=300)
    body = models.TextField()
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.QUEUED, db_index=True
    )
    attempts = models.PositiveSmallIntegerField(default=0)
    error = models.TextField(blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True, db_index=True)
    # Why it was never sent, when status is SUPPRESSED.
    reason = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        db_table = "email_messages"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["to_email", "kind", "-created_at"]),
            models.Index(fields=["status", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.kind} → {self.to_email} ({self.status})"


class EmailSuppression(BaseModel):
    """An address we will not write to again.

    Added by hand or by a provider webhook. Checked before anything is queued,
    so a suppressed address costs nothing at all — not a send, not a row in the
    provider's log, not a hit to the domain's reputation.
    """

    class Reason(models.TextChoices):
        BOUNCED = "bounced", "Hard bounce"
        COMPLAINED = "complained", "Marked as spam"
        UNSUBSCRIBED = "unsubscribed", "Unsubscribed"
        MANUAL = "manual", "Blocked manually"

    email = models.EmailField(unique=True, db_index=True)
    reason = models.CharField(max_length=24, choices=Reason.choices, default=Reason.BOUNCED)
    note = models.TextField(blank=True, default="")

    class Meta:
        db_table = "email_suppressions"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.email} ({self.reason})"


class VerificationCode(BaseModel):
    """A short numeric code, emailed to prove someone reads that inbox.

    Stored HASHED. A code is a credential for the few minutes it lives, and a
    database dump — or an admin idly reading the table — should not be able to
    verify someone else's address or reset their password. The comparison is
    constant-time for the same reason.

    Single-use, time-limited, and attempt-limited: five wrong guesses burn it,
    because six digits is 10^6 and a patient script would otherwise walk it.
    """

    class Purpose(models.TextChoices):
        VERIFY_EMAIL = "verify_email", "Verify email"
        PASSWORD_RESET = "password_reset", "Reset password"

    DIGITS = 6
    MAX_ATTEMPTS = 5

    user = models.ForeignKey(
        "identity.User", on_delete=models.CASCADE, related_name="verification_codes"
    )
    # Denormalised: a code is issued to an ADDRESS, and the user's may change.
    email = models.EmailField(db_index=True)
    purpose = models.CharField(max_length=24, choices=Purpose.choices, db_index=True)
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField(db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "verification_codes"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "purpose", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.purpose} for {self.email}"

    # ─────────────────────────────────────

    @staticmethod
    def generate() -> str:
        """A cryptographically random 6-digit code, leading zeros kept."""
        return f"{secrets.randbelow(10**VerificationCode.DIGITS):0{VerificationCode.DIGITS}d}"

    @staticmethod
    def hash_code(code: str) -> str:
        """Keyed with SECRET_KEY, so the table alone does not yield the codes."""
        return hmac.new(
            settings.SECRET_KEY.encode(), code.strip().encode(), hashlib.sha256
        ).hexdigest()

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_live(self) -> bool:
        return (
            self.consumed_at is None and not self.is_expired and self.attempts < self.MAX_ATTEMPTS
        )

    def matches(self, code: str) -> bool:
        return hmac.compare_digest(self.code_hash, self.hash_code(code))
