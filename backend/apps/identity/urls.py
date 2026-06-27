"""
DSAT LMS v2 — Identity URLs
Domain: Identity
Description: Public auth endpoints (mounted at /api/v1/auth/).
"""

from django.urls import path

from .views import (
    LoginView,
    LogoutView,
    MeView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RefreshView,
    RegisterView,
    VerifyEmailConfirmView,
    VerifyEmailResendView,
)

app_name = "identity"

urlpatterns = [
    # Session
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    # Email verification
    path("verify-email/resend/", VerifyEmailResendView.as_view(), name="verify-email-resend"),
    path("verify-email/confirm/", VerifyEmailConfirmView.as_view(), name="verify-email-confirm"),
    # Password reset / change
    path("password/reset/", PasswordResetRequestView.as_view(), name="password-reset"),
    path(
        "password/reset/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"
    ),
    path("password/change/", PasswordChangeView.as_view(), name="password-change"),
]
