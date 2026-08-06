"""
DSAT LMS v2 — Client error intake
Domain: Common
Description: Where the browser reports a crash it could not recover from.

The backend has had Sentry since deploy; the frontend had nothing. An exam
surface that broke in a student's browser wrote to a console nobody was watching,
and the first we heard was "it doesn't work" — the one surface a student actually
touches was the one we were blind to. This logs the report at ERROR, which the
Sentry logging integration turns into an event in the same project as the
server's, so there is one place to look and no second DSN to manage.

It is unauthenticated on purpose: the errors most worth seeing are the ones that
happen before or instead of a working session. That makes it a write endpoint
open to the internet, so everything below is about making it a boring one to
abuse — nothing is stored, every field is truncated, and it is rate limited
per IP. The worst an attacker achieves is noise in a log, at ten lines a minute.
"""

import json
import logging

from django.db import transaction
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from rest_framework.throttling import AnonRateThrottle

logger = logging.getLogger("apps.client")

# Long enough to be a usable stack trace, short enough that the endpoint is not
# a free log-injection channel.
LIMITS = {
    "message": 500,
    "stack": 4000,
    "digest": 100,
    "url": 500,
    "user_agent": 500,
}
MAX_BODY_BYTES = 16 * 1024
MAX_CONTEXT_KEYS = 10


class _ReportThrottle(AnonRateThrottle):
    scope = "client_errors"


def _clean(payload: dict) -> dict:
    """Truncate to the documented limits and drop everything not asked for.

    An allowlist rather than a sanitizer: a browser can put anything in this
    body, and the surest way not to log a password someone's form helpfully
    included is never to read a field we did not name.
    """
    cleaned = {key: str(payload.get(key) or "")[:limit] for key, limit in LIMITS.items()}
    context = payload.get("context")
    if isinstance(context, dict):
        cleaned["context"] = {
            str(k)[:40]: str(v)[:200] for k, v in list(context.items())[:MAX_CONTEXT_KEYS]
        }
    else:
        cleaned["context"] = {}
    return cleaned


@method_decorator(csrf_exempt, name="dispatch")
@method_decorator(transaction.non_atomic_requests, name="dispatch")
class ClientErrorView(View):
    """POST a browser crash. Always 204 — there is nobody to report a failure to.

    Non-atomic because `ATOMIC_REQUESTS` is global and this view stores nothing:
    an unauthenticated endpoint that takes a database connection per request is
    a free way to exhaust the pool, and a crash report should still get through
    when the database is the thing that is broken.
    """

    def post(self, request):
        throttle = _ReportThrottle()
        if not throttle.allow_request(request, self):
            # 429 rather than a silent drop, so a runaway client backs off
            # instead of retrying into the limiter forever.
            return JsonResponse({"detail": "Too many reports."}, status=429)

        if len(request.body) > MAX_BODY_BYTES:
            return JsonResponse({"detail": "Report too large."}, status=413)

        try:
            payload = json.loads(request.body or b"{}")
        except (ValueError, UnicodeDecodeError):
            return JsonResponse({"detail": "Invalid report."}, status=400)
        if not isinstance(payload, dict):
            return JsonResponse({"detail": "Invalid report."}, status=400)

        report = _clean(payload)
        if not report["message"]:
            return JsonResponse({"detail": "Invalid report."}, status=400)

        logger.error(
            "Client error: %s (%s)",
            report["message"],
            report["url"],
            extra={"client_report": report},
        )
        return JsonResponse({}, status=204)
