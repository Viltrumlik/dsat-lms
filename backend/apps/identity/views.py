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

from common.responses import created_response, success_response

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
from .tasks import send_password_reset_email, send_verification_email

logger = logging.getLogger("apps.identity")


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

        # Fire-and-forget: a failing broker/mail server must not break registration.
        try:
            send_verification_email.delay(user.id)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to enqueue verification email for %s", user.email)

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
    """Resend the verification email to the logged-in user."""

    permission_classes = [IsAuthenticated]
    throttle_scope = "auth_verify_email"  # each POST triggers an email send

    def post(self, request):
        user = request.user
        if user.is_email_verified:
            return success_response({"detail": "Email is already verified."})
        try:
            send_verification_email.delay(user.id)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to enqueue verification email for %s", user.email)
        return success_response({"detail": "Verification email sent."})


class VerifyEmailConfirmView(APIView):
    """Confirm an email from the uid + token in the verification link."""

    permission_classes = [AllowAny]
    throttle_scope = "auth_verify_email"
    serializer_class = EmailVerifyConfirmSerializer

    def post(self, request):
        serializer = EmailVerifyConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        if not user.is_email_verified:
            user.is_email_verified = True
            user.save(update_fields=["is_email_verified"])
        return success_response({"detail": "Email verified.", "user": UserSerializer(user).data})


class PasswordResetRequestView(APIView):
    """Send a reset link. Always 200 — never reveals whether the email exists."""

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
                send_password_reset_email.delay(user.id)
            except Exception:  # noqa: BLE001
                logger.exception("Failed to enqueue password reset email for %s", email)
        return success_response(
            {"detail": "If an account exists for that email, a reset link has been sent."}
        )


class PasswordResetConfirmView(APIView):
    """Set a new password from the uid + token in the reset link."""

    permission_classes = [AllowAny]
    serializer_class = PasswordResetConfirmSerializer
    throttle_scope = "auth_password_reset"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        _blacklist_user_tokens(user)  # log out every existing session
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
