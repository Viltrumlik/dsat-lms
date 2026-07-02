"""
DSAT LMS v2 — Development Settings
"""

from django.db.backends.signals import connection_created
from django.dispatch import receiver

from .base import *  # noqa

DEBUG = True


# Dev runs on SQLite (no Docker/Postgres locally). With ATOMIC_REQUESTS + the
# threaded dev server, overlapping writes (e.g. the test engine flushing several
# answer POSTs at once) hit "database is locked" instead of queuing. WAL mode lets
# readers and a writer coexist, and busy_timeout makes writers wait for the lock.
# Prod uses Postgres, so this is dev-only.
@receiver(connection_created)
def _tune_sqlite(sender, connection, **kwargs):  # noqa: ANN001, ARG001
    if connection.vendor == "sqlite":
        cursor = connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA busy_timeout=20000;")


# Dev/CI/tests run without Redis (Celery is eager), so the default Redis cache
# from base would refuse-connect on any cache op — including DRF throttling, which
# would then 500 every login. Use an in-process cache instead. Prod keeps Redis.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "dsat-dev",
    },
}

# Dev'da email console'ga chiqadi
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Debug toolbar
INSTALLED_APPS += ["debug_toolbar"]
MIDDLEWARE = ["debug_toolbar.middleware.DebugToolbarMiddleware"] + MIDDLEWARE
INTERNAL_IPS = ["127.0.0.1", "::1"]

# Logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {process:d} {thread:d} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django.db.backends": {
            "handlers": ["console"],
            "level": "DEBUG" if DEBUG else "WARNING",
            "propagate": False,
        },
        "apps": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
    },
}
