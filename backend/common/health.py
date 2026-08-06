"""
DSAT LMS v2 — Health endpoints
Domain: Common
Description: What a load balancer and an orchestrator ask.

Two endpoints, because they answer different questions and a deployment that
conflates them will restart healthy containers:

    /healthz   Is this process alive? Touches NOTHING. If Postgres falls over,
               the answer is still yes — the container does not need replacing,
               and restarting every web container during a database blip turns
               an outage into a longer outage. This is the LIVENESS probe.

    /readyz    Should traffic be sent here? Checks the database and the cache.
               A failing readiness check takes one instance out of the pool
               without killing it. This is the READINESS probe, and the one the
               load balancer should watch.

Both are unauthenticated (a probe has no credentials) and both are deliberately
terse: an unauthenticated endpoint that reports versions, hostnames or settings
is reconnaissance served on request.
"""

import logging

from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.cache import never_cache

logger = logging.getLogger(__name__)


@never_cache
def healthz(request):
    """Liveness. Cheap, dependency-free, always 200 if the process can respond."""
    return JsonResponse({"status": "ok"})


@never_cache
def readyz(request):
    """Readiness. 200 only when this instance can actually serve a request."""
    checks = {}

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        checks["database"] = "ok"
    except Exception:  # noqa: BLE001
        logger.exception("Readiness: database check failed")
        checks["database"] = "error"

    try:
        # Round-trip rather than a bare ping: a cache that accepts writes and
        # returns nothing is broken in a way `ping` will happily call healthy.
        cache.set("readyz", "1", 10)
        checks["cache"] = "ok" if cache.get("readyz") == "1" else "error"
    except Exception:  # noqa: BLE001
        logger.exception("Readiness: cache check failed")
        checks["cache"] = "error"

    ready = all(value == "ok" for value in checks.values())
    return JsonResponse(
        {"status": "ok" if ready else "degraded", "checks": checks}, status=200 if ready else 503
    )
