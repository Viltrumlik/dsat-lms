"""
DSAT LMS v2 — WSGI config
Domain: Config
Description: WSGI entrypoint for production servers (gunicorn/uwsgi).
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

application = get_wsgi_application()
