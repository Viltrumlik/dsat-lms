"""
DSAT LMS v2 — Admin dashboard views (Phase 5.1)
Domain: Analytics (admin)
Description: GET /admin/dashboard/ — the executive control-center overview (KPIs,
    today, alerts, recent activity, trends). POST /admin/dashboard/rebuild/ — re-roll
    the trailing PlatformOpsDaily window then return the fresh overview. Admin-only.
Permissions: IsAdmin.
"""

from rest_framework.views import APIView

from common.permissions import IsAdmin
from common.responses import success_response

from .admin_ops import admin_dashboard_overview, rollup_recent

_MAX_DAYS = 90
_DEFAULT_DAYS = 30


def _window_days(request):
    try:
        days = int(request.query_params.get("days", _DEFAULT_DAYS))
    except (TypeError, ValueError):
        return _DEFAULT_DAYS
    return max(1, min(days, _MAX_DAYS))


class AdminDashboardView(APIView):
    """Live KPIs + today + alerts + recent activity + the last N days of flow trends."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return success_response(admin_dashboard_overview(days=_window_days(request)))


class AdminDashboardRebuildView(APIView):
    """Re-roll the trailing PlatformOpsDaily window, then return the fresh overview."""

    permission_classes = [IsAdmin]

    def post(self, request):
        rollup_recent()
        return success_response(admin_dashboard_overview(days=_window_days(request)))
