"""
DSAT LMS v2 — Identity Tokens
Domain: Identity
Description: Stateless, time-limited tokens for email verification and a uid<->user
            helper. Password reset reuses Django's default_token_generator.

Both generators are HMAC-based (no DB row): the email-verification token folds
`is_email_verified` into its hash so it self-invalidates once the email is verified;
the password-reset token folds the password hash so it dies when the password changes.
"""

from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from .models import User


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    """Token tied to the user's verified state — invalid once verified."""

    def _make_hash_value(self, user, timestamp):
        return f"{user.pk}{timestamp}{user.is_email_verified}{user.email}"


email_verification_token = EmailVerificationTokenGenerator()


def encode_uid(user) -> str:
    """Encode a user's (UUID) pk as a urlsafe base64 string for use in links."""
    return urlsafe_base64_encode(force_bytes(user.pk))


def get_user_from_uidb64(uidb64: str):
    """Resolve a user from a uidb64, or return None if it doesn't map to one."""
    try:
        pk = force_str(urlsafe_base64_decode(uidb64))
        return User.objects.get(pk=pk)
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        return None
