"""
DSAT LMS v2 — Refresh Token Cookie Helpers
Domain: Identity
Description: Set/clear the HttpOnly refresh-token cookie. Access tokens go in the
            response body (Authorization: Bearer ...); the long-lived refresh token
            lives ONLY in an HttpOnly cookie scoped to the auth endpoints.
"""

from django.conf import settings

REFRESH_COOKIE_NAME = "refresh_token"
# Scope the cookie to the auth endpoints so it's only sent to refresh/logout.
REFRESH_COOKIE_PATH = "/api/v1/auth/"


def _max_age() -> int:
    return int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())


def set_refresh_cookie(response, refresh_token):
    """Attach the HttpOnly refresh cookie to a response and return it."""
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=str(refresh_token),
        max_age=_max_age(),
        httponly=True,
        # Overridable via settings later (prod: Secure + SameSite per deployment).
        secure=getattr(settings, "REFRESH_COOKIE_SECURE", not settings.DEBUG),
        samesite=getattr(settings, "REFRESH_COOKIE_SAMESITE", "Lax"),
        path=REFRESH_COOKIE_PATH,
    )
    return response


def clear_refresh_cookie(response):
    """Remove the refresh cookie (logout) and return the response."""
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    return response
