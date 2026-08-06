"""
DSAT LMS v2 — Gunicorn configuration
Domain: Deploy
Description: How the WSGI server is run in production.

Sync workers, not gevent: this app talks to Postgres and Redis over short calls
and hands anything slow (email, grading, rollups) to Celery. Async workers buy
concurrency for IO-bound waiting the app does not do, and cost the simple
per-request database connection that CONN_MAX_AGE depends on.
"""

import multiprocessing
import os

# ─────────────────────────────────────
# Binding
# ─────────────────────────────────────
bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8000")
# The classic 2×CPU+1. Override where the box is shared or the database has a
# connection cap: every worker holds its own persistent connection, so
# workers × instances must stay under Postgres's max_connections.
workers = int(os.getenv("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))
threads = int(os.getenv("GUNICORN_THREADS", 1))
worker_class = os.getenv("GUNICORN_WORKER_CLASS", "sync")

# ─────────────────────────────────────
# Timeouts
# ─────────────────────────────────────
# A request that takes 30s is a bug, not a slow request — the long jobs are all
# on Celery. Killing it frees the worker instead of letting one query hold it.
timeout = int(os.getenv("GUNICORN_TIMEOUT", 30))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", 30))
# Must exceed the proxy's keepalive, or Nginx reuses a connection gunicorn has
# just closed and the client sees a 502 from nowhere.
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", 65))

# ─────────────────────────────────────
# Worker recycling
# ─────────────────────────────────────
# Retire a worker after N requests. This is not a fix for a leak — it is the
# insurance that a slow one never becomes an outage. The jitter stops every
# worker retiring on the same request and taking the whole pool with it.
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", 1000))
max_requests_jitter = int(os.getenv("GUNICORN_MAX_REQUESTS_JITTER", 100))
# Load the app before forking: the workers share the parsed code pages, which
# is a real memory saving on a Django app of this size.
preload_app = True

# ─────────────────────────────────────
# Logging — stdout/stderr, for the platform to collect
# ─────────────────────────────────────
accesslog = os.getenv("GUNICORN_ACCESS_LOG", "-")
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
# %({X-Forwarded-For}i)s, not %(h)s: behind Nginx every request appears to come
# from the proxy, and an access log full of one IP tells you nothing.
access_log_format = (
    '%({X-Forwarded-For}i)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(L)ss'
)
# The probes are the noisiest lines in the log and the least interesting: a
# health check every second is a log nobody can read an incident out of.
_QUIET_PATHS = ("/healthz", "/readyz")


class _SkipProbes:
    """Filter the probe lines out of the access log without silencing it."""

    def filter(self, record):
        message = record.getMessage()
        return not any(path in message for path in _QUIET_PATHS)


logconfig_dict = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"skip_probes": {"()": _SkipProbes}},
    "handlers": {
        "console": {"class": "logging.StreamHandler", "filters": ["skip_probes"]},
    },
    "loggers": {"gunicorn.access": {"handlers": ["console"], "propagate": False}},
}
