"""
DSAT LMS v2 — Audit admin views
Domain: Audit
Description: GET /admin/audit/ — filterable, cursor-paginated activity log.
    GET /admin/audit/actions/ — distinct action + target_type vocab for the
    viewer's filter dropdowns. Admin-only.
Permissions: IsAdmin.
"""

from django.db.models import Q
from django.utils.dateparse import parse_datetime
from rest_framework.views import APIView

from common.pagination import CursorPagination
from common.permissions import IsAdmin
from common.responses import success_response

from .models import ActivityLog
from .serializers_admin import ActivityLogSerializer


class AdminAuditListView(APIView):
    """Filterable activity log. Filters: actor, action, target_type, from, to, q."""

    permission_classes = [IsAdmin]

    def get(self, request):
        qs = ActivityLog.objects.select_related("actor").all()

        actor = (request.query_params.get("actor") or "").strip()
        if actor:
            qs = qs.filter(actor_id=actor)

        action = (request.query_params.get("action") or "").strip()
        if action:
            qs = qs.filter(action=action)

        target_type = (request.query_params.get("target_type") or "").strip()
        if target_type:
            qs = qs.filter(target_type=target_type)

        dt_from = parse_datetime(request.query_params.get("from") or "")
        if dt_from:
            qs = qs.filter(created_at__gte=dt_from)
        dt_to = parse_datetime(request.query_params.get("to") or "")
        if dt_to:
            qs = qs.filter(created_at__lte=dt_to)

        search = (request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(summary__icontains=search)
                | Q(target_label__icontains=search)
                | Q(actor__email__icontains=search)
            )

        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(ActivityLogSerializer(page, many=True).data)


class AdminAuditActionsView(APIView):
    """Distinct action + target_type values present in the log — powers the
    viewer's filter dropdowns."""

    permission_classes = [IsAdmin]

    def get(self, request):
        actions = list(
            ActivityLog.objects.order_by("action").values_list("action", flat=True).distinct()
        )
        target_types = list(
            ActivityLog.objects.exclude(target_type="")
            .order_by("target_type")
            .values_list("target_type", flat=True)
            .distinct()
        )
        return success_response({"actions": actions, "target_types": target_types})
