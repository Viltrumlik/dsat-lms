"""
DSAT LMS v2 — Identity Views (Auth vertical)
Domain: Identity
Description: register, login, refresh, logout, me.
            Access token → response body (Bearer). Refresh token → HttpOnly cookie
            scoped to /api/v1/auth/. Refresh rotates + blacklists per SIMPLE_JWT.
Permissions: register/login/refresh/logout = AllowAny; me = IsAuthenticated.
"""

import logging

from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.mailer import codes as mail_codes
from apps.mailer import quota as mail_quota
from apps.mailer.models import VerificationCode
from common.exceptions import ValidationError
from common.responses import created_response, success_response

from . import emails
from .cookies import REFRESH_COOKIE_NAME, clear_refresh_cookie, set_refresh_cookie
from .models import User
from .serializers import (
    EmailVerifyConfirmSerializer,
    LoginSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
)

logger = logging.getLogger("apps.identity")


def _quota_response(exc):
    """A refused email, as a 429 the caller can act on.

    Told plainly, with the wait: "try again in 40 seconds" is something a student
    can do, and hiding it behind a generic error just makes them press the button
    again — which is the behaviour the cooldown exists to stop.
    """
    from rest_framework import status
    from rest_framework.response import Response

    body = {
        "success": False,
        "error": {"code": "EMAIL_RATE_LIMITED", "message": exc.message, "field": None},
    }
    response = Response(body, status=status.HTTP_429_TOO_MANY_REQUESTS)
    if exc.retry_after:
        response["Retry-After"] = str(exc.retry_after)
    return response


def _code_error_response(exc):
    """A refused verification code, in a shape the client can translate.

    The slug goes out as the error code (`CODE_EXPIRED`, `CODE_INVALID`, …) and
    the attempts remaining as a number. Before this the only machine-readable
    part was `VALIDATION_ERROR` and the detail lived in an English sentence, so
    an Uzbek interface had nothing to render but English — or would have had to
    parse the count back out of the prose.
    """
    return ValidationError(
        exc.message,
        field="code",
        code=f"CODE_{exc.reason.upper()}",
        extra=({"attempts_left": exc.attempts_left} if exc.attempts_left is not None else None),
    ).to_response()


def _issue_tokens(user):
    """Return (access_str, refresh_str) for a user, recording an outstanding token."""
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


def _blacklist_user_tokens(user):
    """Blacklist all of a user's outstanding refresh tokens (e.g. after a password change)."""
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


class RegisterView(APIView):
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer
    throttle_scope = "auth_register"

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # A failing mail server must not break registration — the account exists
        # either way, and the verify screen offers a resend.
        try:
            emails.send_verification_code(user)
        except mail_quota.QuotaExceededError as exc:
            logger.info("Verification code for %s refused: %s", user.email, exc.reason)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to send verification code for %s", user.email)

        access, refresh = _issue_tokens(user)
        response = created_response({"user": UserSerializer(user).data, "access_token": access})
        return set_refresh_cookie(response, refresh)


class LoginView(APIView):
    permission_classes = [AllowAny]
    serializer_class = LoginSerializer
    throttle_scope = "auth_login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]

        user.last_login_at = timezone.now()
        user.save(update_fields=["last_login_at"])

        access, refresh = _issue_tokens(user)
        response = success_response({"user": UserSerializer(user).data, "access_token": access})
        return set_refresh_cookie(response, refresh)


class RefreshView(APIView):
    """Mint a new access token from the HttpOnly refresh cookie (rotating it)."""

    permission_classes = [AllowAny]

    def post(self, request):
        cookie = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if not cookie:
            raise InvalidToken("No refresh token cookie was provided.")

        serializer = TokenRefreshSerializer(data={"refresh": cookie})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            raise InvalidToken(str(exc)) from exc

        data = serializer.validated_data
        response = success_response({"access_token": data["access"]})
        # ROTATE_REFRESH_TOKENS=True → a fresh refresh token is returned; re-set it.
        if data.get("refresh"):
            set_refresh_cookie(response, data["refresh"])
        return response


class LogoutView(APIView):
    """Blacklist the refresh token and clear the cookie. Idempotent."""

    permission_classes = [AllowAny]

    def post(self, request):
        cookie = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if cookie:
            try:
                RefreshToken(cookie).blacklist()
            except TokenError:
                pass  # already expired/blacklisted — nothing to do
        response = success_response({"detail": "Logged out."})
        return clear_refresh_cookie(response)


class MeView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer

    def get(self, request):
        return success_response({"user": UserSerializer(request.user).data})

    def patch(self, request):
        """Self-service profile update (name, target score, exam date, timezone)."""
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response({"user": UserSerializer(request.user).data})


class VerifyEmailResendView(APIView):
    """Send the logged-in user a fresh verification code.

    The quota is enforced HERE rather than on a worker, because this is the one
    request someone is actually waiting on: a refusal has to come back as a
    number of seconds, not vanish into a log.
    """

    permission_classes = [IsAuthenticated]
    throttle_scope = "auth_verify_email"  # per-IP; the real limit is the mailer's

    def post(self, request):
        user = request.user
        if user.is_email_verified:
            return success_response({"detail": "Email is already verified."})
        try:
            emails.send_verification_code(user)
        except mail_quota.QuotaExceededError as exc:
            return _quota_response(exc)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to send verification code for %s", user.email)
            return ValidationError("Could not send the code. Please try again.").to_response()
        return success_response(
            {"detail": "Verification code sent.", "expires_in_minutes": mail_codes.ttl_minutes()}
        )


class VerifyEmailConfirmView(APIView):
    """Verify an address with the six-digit code that was emailed to it."""

    permission_classes = [AllowAny]
    throttle_scope = "auth_verify_email"
    serializer_class = EmailVerifyConfirmSerializer

    def post(self, request):
        serializer = EmailVerifyConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower().strip()
        user = User.objects.filter(email__iexact=email).first()

        # An unknown address gets the generic refusal — never "no such account".
        #
        # It is NOT indistinguishable from a wrong code: that path counts down
        # ("3 attempts left"), which does tell a stranger the address has a code
        # in flight. Kept deliberately — the hint is what stops a student
        # retyping a code they have already burned — and it costs little, since
        # registration already refuses a taken address outright. What is withheld
        # is the direct answer.
        wrong = ValidationError("That code is not valid. Please request a new one.", field="code")
        if user is None:
            return wrong.to_response()
        if user.is_email_verified:
            return success_response(
                {"detail": "Email is already verified.", "user": UserSerializer(user).data}
            )
        try:
            mail_codes.verify(
                user, VerificationCode.Purpose.VERIFY_EMAIL, serializer.validated_data["code"]
            )
        except mail_codes.CodeError as exc:
            return _code_error_response(exc)

        user.is_email_verified = True
        user.save(update_fields=["is_email_verified"])
        return success_response({"detail": "Email verified.", "user": UserSerializer(user).data})


class PasswordResetRequestView(APIView):
    """Email a reset code. Always 200 — never reveals whether the account exists.

    A quota refusal is swallowed here for the same reason: a 429 for a known
    address and a 200 for an unknown one would turn the cooldown into an account
    oracle. The per-IP throttle above still bounds the abuse.
    """

    permission_classes = [AllowAny]
    serializer_class = PasswordResetRequestSerializer
    throttle_scope = "auth_password_reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower().strip()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            try:
                emails.send_password_reset_code(user)
            except mail_quota.QuotaExceededError as exc:
                logger.info("Reset code for %s refused: %s", email, exc.reason)
            except Exception:  # noqa: BLE001
                logger.exception("Failed to send reset code for %s", email)
        return success_response(
            {
                "detail": "If an account exists for that email, a reset code has been sent.",
                "expires_in_minutes": mail_codes.ttl_minutes(),
            }
        )


class PasswordResetConfirmView(APIView):
    """Set a new password from the emailed code."""

    permission_classes = [AllowAny]
    serializer_class = PasswordResetConfirmSerializer
    throttle_scope = "auth_password_reset"

    def post(self, request):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError

        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower().strip()
        user = User.objects.filter(email__iexact=email, is_active=True).first()

        wrong = ValidationError("That code is not valid. Please request a new one.", field="code")
        if user is None:
            return wrong.to_response()
        try:
            mail_codes.verify(
                user, VerificationCode.Purpose.PASSWORD_RESET, serializer.validated_data["code"]
            )
        except mail_codes.CodeError as exc:
            return _code_error_response(exc)

        # Strength is checked only once the code is accepted: `validate_password`
        # compares the password against the user's own name and email, so it
        # needs the user — and an unauthenticated caller must not be able to
        # probe the rules against an address they do not control.
        try:
            validate_password(serializer.validated_data["new_password"], user)
        except DjangoValidationError as exc:
            return ValidationError(" ".join(exc.messages), field="new_password").to_response()

        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        # Reaching this point proves control of the inbox, so every existing
        # session is now suspect — a reset is also how you kick out an intruder.
        _blacklist_user_tokens(user)
        return success_response({"detail": "Password has been reset. Please log in again."})


class PasswordChangeView(APIView):
    """Authenticated password change; invalidates other sessions."""

    permission_classes = [IsAuthenticated]
    serializer_class = PasswordChangeSerializer

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        _blacklist_user_tokens(user)
        return success_response({"detail": "Password changed. Please log in again."})
