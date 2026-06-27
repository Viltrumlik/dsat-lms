"""
DSAT LMS v2 — Production Settings
Domain: Config
Description: Hardened settings for production. Inherits base; flips DEBUG off,
            enforces TLS/security headers, wires R2 storage, SMTP email, Sentry.
"""

from .base import *  # noqa: F403

DEBUG = False

# ─────────────────────────────────────
# Security
# ─────────────────────────────────────
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_HSTS_SECONDS = env.int("DJANGO_SECURE_HSTS_SECONDS", default=60 * 60 * 24 * 30)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
X_FRAME_OPTIONS = "DENY"

# The refresh-cookie helper reads these (identity/cookies.py).
REFRESH_COOKIE_SECURE = True
REFRESH_COOKIE_SAMESITE = env("REFRESH_COOKIE_SAMESITE", default="None")

# Frontend base URL for email links.
FRONTEND_URL = env("NEXT_PUBLIC_APP_URL", default="https://app.example.com")

# ─────────────────────────────────────
# Storage — Cloudflare R2 (S3-compatible)
# ─────────────────────────────────────
STORAGE_BACKEND = env("STORAGE_BACKEND", default="r2")
if STORAGE_BACKEND == "r2":
    AWS_ACCESS_KEY_ID = env("R2_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = env("R2_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = env("R2_BUCKET_NAME")
    AWS_S3_ENDPOINT_URL = f"https://{env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com"
    AWS_S3_CUSTOM_DOMAIN = env("R2_CUSTOM_DOMAIN", default="")
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = False
    STORAGES = {
        "default": {"BACKEND": "storages.backends.s3.S3Storage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }

# ─────────────────────────────────────
# Email — SMTP (Resend / SES both speak SMTP)
# ─────────────────────────────────────
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = env("EMAIL_HOST", default="smtp.resend.com")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="resend")
EMAIL_HOST_PASSWORD = env("RESEND_API_KEY", default="")
EMAIL_USE_TLS = True
DEFAULT_FROM_EMAIL = env("EMAIL_FROM", default="noreply@example.com")

# ─────────────────────────────────────
# Sentry (optional)
# ─────────────────────────────────────
SENTRY_DSN = env("SENTRY_DSN", default="")
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration()],
        traces_sample_rate=env.float("SENTRY_TRACES_SAMPLE_RATE", default=0.1),
        send_default_pii=False,
        environment=env("SENTRY_ENVIRONMENT", default="production"),
    )

# ─────────────────────────────────────
# Logging — to stdout (collected by the platform)
# ─────────────────────────────────────
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "{levelname} {asctime} {name} {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
        "apps": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}
