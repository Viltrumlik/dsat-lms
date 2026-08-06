"""
DSAT LMS v2 — Base Settings
Domain: Config
"""

from pathlib import Path

import environ
from celery.schedules import crontab

# ─────────────────────────────────────
# Paths
# ─────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
)
environ.Env.read_env(BASE_DIR.parent / ".env")

# ─────────────────────────────────────
# Security
# ─────────────────────────────────────
# Product identity. One place, so a rebrand is one edit — emails, the OpenAPI
# title and the Django admin header all read it.
PRODUCT_NAME = env("PRODUCT_NAME", default="SATFergana")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env("DJANGO_DEBUG")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost"])

# ─────────────────────────────────────
# Installed Apps
# ─────────────────────────────────────
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "django_celery_beat",
    "django_celery_results",
]

LOCAL_APPS = [
    "common",
    "apps.identity",
    "apps.academy",
    "apps.question_bank",
    "apps.assessments",
    "apps.homework",
    "apps.analytics",
    "apps.notifications",
    "apps.files",
    "apps.support",
    "apps.audit",
    "apps.courses",
    "apps.crm",
    "apps.automation",
    "apps.vocabulary",
    "apps.mailer",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ─────────────────────────────────────
# Middleware
# ─────────────────────────────────────
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# ─────────────────────────────────────
# Auth
# ─────────────────────────────────────
AUTH_USER_MODEL = "identity.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ─────────────────────────────────────
# Database
# ─────────────────────────────────────
DATABASES = {"default": env.db("DATABASE_URL")}
DATABASES["default"]["ATOMIC_REQUESTS"] = True
# Persistent connections: reconnecting per request is a measurable cost against
# Postgres. The ceiling is not comfort — every gunicorn worker holds one, so
# workers × replicas must stay under max_connections (see deploy/README.md).
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=60)
# Without this, the first request after a database restart or a failover gets
# handed a dead socket from the pool and dies — one free 500 per worker, every
# time. Django pings the connection instead.
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

# ─────────────────────────────────────
# Cache (Redis)
# ─────────────────────────────────────
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": env("REDIS_URL", default="redis://localhost:6379/0"),
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            "SOCKET_CONNECT_TIMEOUT": 5,
            "SOCKET_TIMEOUT": 5,
        },
    }
}

# ─────────────────────────────────────
# Celery
# ─────────────────────────────────────
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/1")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://localhost:6379/2")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "Asia/Tashkent"
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"

CELERY_TASK_ROUTES = {
    "apps.analytics.tasks.*": {"queue": "analytics"},
    "apps.notifications.tasks.*": {"queue": "notifications"},
    "apps.mailer.tasks.*": {"queue": "email"},
}

# django_celery_beat's DatabaseScheduler installs these entries into the DB on
# beat startup, so the schedule ships with the code (still editable in admin).
CELERY_BEAT_SCHEDULE = {
    "purge-expired-verification-codes": {
        "task": "apps.mailer.tasks.purge_expired_codes",
        "schedule": crontab(hour=3, minute=20),
    },
    "send-homework-due-reminders": {
        "task": "apps.notifications.tasks.send_homework_due_reminders",
        "schedule": crontab(hour=8, minute=0),  # daily, CELERY_TIMEZONE
    },
    "abandon-stale-sessions": {
        "task": "apps.assessments.tasks.abandon_stale_sessions",
        "schedule": crontab(hour=3, minute=30),  # daily, CELERY_TIMEZONE
    },
    # Answers are POSTed as they are chosen; this is the net under a write that
    # failed, sweeping the auto-save blob into ExamResponse so nothing a student
    # actually answered can score as omitted. Runs often because a live session
    # is the only thing it can help.
    "reconcile-session-answers": {
        "task": "apps.assessments.tasks.reconcile_session_answers",
        "schedule": crontab(minute="*/10"),
    },
    "cleanup-generated-exams": {
        "task": "apps.assessments.tasks.cleanup_generated_exams",
        "schedule": crontab(hour=3, minute=45),  # daily, after the stale sweep
    },
    "purge-soft-deleted-attachments": {
        "task": "apps.files.tasks.purge_soft_deleted_attachments",
        "schedule": crontab(hour=4, minute=0),  # daily, CELERY_TIMEZONE
    },
    "sweep-support-triggers": {
        "task": "apps.support.tasks.sweep_support_triggers",
        "schedule": crontab(hour=6, minute=0),  # daily, CELERY_TIMEZONE
    },
    "materialize-office-hours": {
        "task": "apps.support.tasks.materialize_office_hours",
        "schedule": crontab(hour=5, minute=0),  # daily, CELERY_TIMEZONE
    },
    "send-office-hour-reminders": {
        "task": "apps.support.tasks.send_office_hour_reminders",
        "schedule": crontab(hour=7, minute=0),  # daily, CELERY_TIMEZONE
    },
    "send-mentor-checkin-reminders": {
        "task": "apps.academy.tasks.send_mentor_checkin_reminders",
        "schedule": crontab(hour=8, minute=0, day_of_week="mon"),  # weekly, CELERY_TIMEZONE
    },
    "generate-support-ops-daily": {
        "task": "apps.support.tasks.generate_support_ops_daily",
        "schedule": crontab(hour=1, minute=0),  # daily, CELERY_TIMEZONE
    },
    "generate-platform-ops-daily": {
        "task": "apps.analytics.tasks.generate_platform_ops_daily",
        "schedule": crontab(hour=1, minute=15),  # daily, CELERY_TIMEZONE
    },
    # A percentile written at submit ranks a student against the cohort as it was
    # at that second. The cohort keeps growing, so every old score card drifts
    # until this re-ranks it.
    "refresh-exam-percentiles": {
        "task": "apps.analytics.tasks.refresh_exam_percentiles",
        "schedule": crontab(hour=2, minute=30),  # daily, CELERY_TIMEZONE
    },
    "materialize-class-sessions": {
        "task": "apps.academy.tasks.materialize_class_sessions",
        "schedule": crontab(hour=2, minute=0),  # daily, CELERY_TIMEZONE
    },
    "send-follow-up-reminders": {
        "task": "apps.crm.tasks.send_follow_up_reminders",
        "schedule": crontab(hour=8, minute=30),  # daily, CELERY_TIMEZONE
    },
    "run-automation-sweep": {
        "task": "apps.automation.tasks.run_automation_sweep",
        "schedule": crontab(hour=6, minute=30),  # daily, after support triggers
    },
}

# ─────────────────────────────────────
# DRF
# ─────────────────────────────────────
# ─────────────────────────────────────
# Email quotas (apps.mailer)
# ─────────────────────────────────────
# Counted off the OUTBOX, not off HTTP requests: a per-IP throttle does not stop
# one address being mailed from a dozen IPs, and does not see a Celery task or a
# management command sending with no request at all.
#
#   COOLDOWN  the impatient resend — one email, not six.
#   RECIPIENT one address being farmed for codes all afternoon.
#   PER_DAY   the runaway: a bug must not burn the month's allowance overnight.
#
# Defaults suit a small academy on a modest plan; raise them with the plan.
MAIL_COOLDOWN_SECONDS = env.int("MAIL_COOLDOWN_SECONDS", default=60)
MAIL_MAX_PER_RECIPIENT_PER_DAY = env.int("MAIL_MAX_PER_RECIPIENT_PER_DAY", default=10)
# Codes are counted separately from broadcast mail: a class that got ten
# announcements this morning must still be able to reset a password this
# afternoon.
MAIL_MAX_CODES_PER_RECIPIENT_PER_DAY = env.int("MAIL_MAX_CODES_PER_RECIPIENT_PER_DAY", default=5)
MAIL_MAX_PER_DAY = env.int("MAIL_MAX_PER_DAY", default=2000)
# Bulk mail stops this many sends before the global cap, so the end of the day's
# allowance is still there for someone locked out of their account.
MAIL_RESERVE_FOR_CODES = env.int("MAIL_RESERVE_FOR_CODES", default=200)
# How long a six-digit code stays usable.
MAIL_CODE_TTL_MINUTES = env.int("MAIL_CODE_TTL_MINUTES", default=15)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "common.pagination.CursorPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "common.exceptions.custom_exception_handler",
    # ScopedRateThrottle is a no-op for views without a `throttle_scope`, so this
    # is safe globally — only the auth views opt in. Rates are env-overridable so
    # production can tighten them; defaults are a brute-force speed bump (not a
    # wall) that sit well above what the e2e suite exercises. Tests disable
    # throttling (see conftest._disable_throttling).
    #
    # NUM_PROXIES controls the throttle identity. With 0 (dev default) DRF keys on
    # REMOTE_ADDR and IGNORES the client-supplied X-Forwarded-For — so the header
    # can't be spoofed to dodge the limit. BEHIND A REVERSE PROXY (prod = Nginx)
    # set NUM_PROXIES to the trusted hop count (1 for a single Nginx that appends
    # the real peer to XFF); leaving it unset would make DRF trust the raw XFF.
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "NUM_PROXIES": env.int("NUM_PROXIES", default=0),
    "DEFAULT_THROTTLE_RATES": {
        "auth_login": env("THROTTLE_AUTH_LOGIN", default="30/min"),
        "auth_register": env("THROTTLE_AUTH_REGISTER", default="30/min"),
        "auth_password_reset": env("THROTTLE_AUTH_PASSWORD_RESET", default="10/min"),
        "auth_verify_email": env("THROTTLE_AUTH_VERIFY_EMAIL", default="10/min"),
        # Admin resetting another user's password is auth-sensitive; cap it too.
        "admin_set_password": env("THROTTLE_ADMIN_SET_PASSWORD", default="10/min"),
    },
}


def _validate_throttle_rates(rates):
    """Fail fast on a malformed rate — DRF only parses rates lazily, so an invalid
    env value would otherwise surface as a 500 on the first request to that
    endpoint. A count of 0 is rejected too (it locks the endpoint for everyone;
    to disable a scope, drop its throttle_scope, don't set 0)."""
    from django.core.exceptions import ImproperlyConfigured

    for scope, rate in rates.items():
        if rate is None:
            continue
        try:
            count, period = rate.split("/")
            count = int(count)
            unit = period[0]
        except (ValueError, IndexError):
            raise ImproperlyConfigured(
                f"Malformed throttle rate for {scope!r}: {rate!r} "
                "(expected '<count>/<s|min|hour|day>')."
            ) from None
        if unit not in "smhd" or count <= 0:
            raise ImproperlyConfigured(
                f"Invalid throttle rate for {scope!r}: {rate!r} "
                "(count must be > 0 and the period must start with s/m/h/d)."
            )


_validate_throttle_rates(REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"])

# ─────────────────────────────────────
# JWT
# ─────────────────────────────────────
from datetime import timedelta

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=env.int("JWT_ACCESS_TOKEN_LIFETIME_MINUTES", default=15)
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=env.int("JWT_REFRESH_TOKEN_LIFETIME_DAYS", default=30)
    ),
    "ROTATE_REFRESH_TOKENS": env.bool("JWT_ROTATE_REFRESH_TOKENS", default=True),
    "BLACKLIST_AFTER_ROTATION": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# ─────────────────────────────────────
# CORS
# ─────────────────────────────────────
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:3000", "http://127.0.0.1:3000"],
)
CORS_ALLOW_CREDENTIALS = True

# ─────────────────────────────────────
# Spectacular (OpenAPI)
# ─────────────────────────────────────
SPECTACULAR_SETTINGS = {
    "TITLE": f"{PRODUCT_NAME} API",
    "DESCRIPTION": "Digital SAT Learning Management System API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

# ─────────────────────────────────────
# Internationalization
# ─────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Tashkent"
USE_I18N = True
USE_TZ = True

# ─────────────────────────────────────
# Static & Media
# ─────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# File storage — local filesystem by default (dev/tests); production.py repoints
# the default backend at Cloudflare R2 (S3) via django-storages when STORAGE_BACKEND=r2.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

# Absolute base URL of THIS backend — used to build stable file download URLs
# (stored in User.avatar_url), so they don't embed an expiring signed token.
BACKEND_PUBLIC_URL = env("BACKEND_PUBLIC_URL", default="http://localhost:8000")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ─────────────────────────────────────
# Templates
# ─────────────────────────────────────
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ─────────────────────────────────────
# Feature Flags
# ─────────────────────────────────────
PUBLIC_PRACTICE_TEST_LIMIT_PER_WEEK = env.int("PUBLIC_PRACTICE_TEST_LIMIT_PER_WEEK", default=3)
PUBLIC_PAST_PAPER_LIMIT = env.int("PUBLIC_PAST_PAPER_LIMIT", default=5)
