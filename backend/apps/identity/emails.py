"""
DSAT LMS v2 — Identity emails
Domain: Identity
Description: Issue and send the two codes identity needs — verify an address,
    reset a password.

Thin on purpose. Everything that makes sending safe — the outbox row, the
suppression list, the cooldown and the daily caps — lives in apps.mailer, and
these are the two callers. There is deliberately no `send_mail()` here any more:
a limit any module can walk around is a suggestion.
"""

from apps.mailer import codes
from apps.mailer.models import VerificationCode


def send_verification_code(user) -> str:
    """Email a verification code. Returns the plaintext (dev/tests only)."""
    _, plaintext = codes.issue(user, VerificationCode.Purpose.VERIFY_EMAIL)
    return plaintext


def send_password_reset_code(user) -> str:
    """Email a password-reset code. Returns the plaintext (dev/tests only)."""
    _, plaintext = codes.issue(user, VerificationCode.Purpose.PASSWORD_RESET)
    return plaintext
