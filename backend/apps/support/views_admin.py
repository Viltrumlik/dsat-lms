"""
DSAT LMS v2 — Support Center admin views (S7)
Domain: Support
Description: The admin ops dashboard. GET returns live platform-wide Support KPIs
    (bookings, tickets, office hours, the trigger funnel) plus a continuous daily
    trend series; POST /rebuild/ regenerates today's (and yesterday's) rollup on
    demand. Admin-only.
Permissions: IsAdmin.
"""

from rest_framework.views import APIView

from common.permissions import IsAdmin
from common.responses import success_response

from .ops import admin_support_overview, rollup_recent

_MAX_DAYS = 90
_DEFAULT_DAYS = 30


def _window_days(request):
    """Clamp the ?days= trend window to a sane range."""
    try:
        days = int(request.query_params.get("days", _DEFAULT_DAYS))
    except (TypeError, ValueError):
        return _DEFAULT_DAYS
    return max(1, min(days, _MAX_DAYS))


class AdminSupportOpsView(APIView):
    """GET: live KPIs + the last N days of flow metrics (N = ?days=, default 30)."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return success_response(admin_support_overview(days=_window_days(request)))


class AdminSupportOpsRebuildView(APIView):
    """POST: re-roll the trailing window, then return the fresh overview (so the
    dashboard reflects same-day activity — and late no-show/attendance marks —
    without waiting for the beat)."""

    permission_classes = [IsAdmin]

    def post(self, request):
        rollup_recent()
        return success_response(admin_support_overview(days=_window_days(request)))
