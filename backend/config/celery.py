"""
DSAT LMS v2 — Celery application
Domain: Config
Description: Celery app bound to Django settings (CELERY_* namespace) with task
            autodiscovery across apps.

Eager mode (run tasks inline, no broker) is controlled by CELERY_TASK_ALWAYS_EAGER.
We load .env here *before* Django settings finish importing, because this module is
imported very early (via config/__init__) — otherwise the flag wouldn't be visible
yet. Dev/CI run eager (no Redis needed); production leaves it off and runs real
workers. Tests force eager via a fixture.
"""

import os
from pathlib import Path

import environ
from celery import Celery

# Repo-root .env (backend/config/celery.py -> parents[2] == repo root). No-op if absent.
environ.Env.read_env(Path(__file__).resolve().parents[2] / ".env")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

app = Celery("dsat")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

if os.getenv("CELERY_TASK_ALWAYS_EAGER", "False").lower() in ("1", "true", "yes"):
    app.conf.task_always_eager = True
    app.conf.task_eager_propagates = True


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Trivial task for smoke-testing a worker (`celery -A config call config.celery.debug_task`)."""
    return f"request: {self.request!r}"
