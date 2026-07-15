"""
DSAT LMS v2 — Automation admin views
Domain: Automation
Description: Rule CRUD (validated DSL), the builder catalog, a side-effect-free
    dry-run, an on-demand sweep trigger, and the run log. Mounted at /api/v1/admin/.
    IsAdmin on every endpoint.
"""

from django.db.models import Count, Q
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from apps.audit.services import record_activity
from common.pagination import CursorPagination
from common.permissions import IsAdmin
from common.responses import created_response, no_content_response, success_response

from .catalog import catalog_payload
from .models import AutomationLog, AutomationRule
from .serializers_admin import (
    AutomationLogSerializer,
    AutomationRuleSerializer,
    AutomationRuleWriteSerializer,
)
from .services import dry_run_rule, run_automation_sweep

_TRUE = {"true", "1", "yes", "on"}
_FALSE = {"false", "0", "no", "off"}


def _bool_param(value):
    if value is None:
        return None
    v = value.strip().lower()
    return True if v in _TRUE else False if v in _FALSE else None


def _get_rule(pk):
    rule = AutomationRule.objects.filter(pk=pk).first()
    if rule is None:
        raise NotFound("Automation rule not found.")
    return rule


class AutomationCatalogView(APIView):
    """The builder vocabulary: triggers, events, fields, ops, actions, limits."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return success_response(catalog_payload())


class AutomationRuleListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = AutomationRule.objects.annotate(
            log_count_annotated=Count("logs", filter=Q(logs__deleted_at__isnull=True))
        )
        enabled = _bool_param(request.query_params.get("enabled"))
        if enabled is not None:
            qs = qs.filter(enabled=enabled)
        trigger = (request.query_params.get("trigger_type") or "").strip()
        if trigger:
            qs = qs.filter(trigger_type=trigger)
        qs = qs.select_related("created_by").order_by("-created_at")
        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(AutomationRuleSerializer(page, many=True).data)

    def post(self, request):
        serializer = AutomationRuleWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rule = serializer.save(created_by=request.user)
        record_activity(
            actor=request.user,
            action="automation.rule.created",
            target=rule,
            summary=f"Created automation rule '{rule.name}'.",
            request=request,
        )
        return created_response(AutomationRuleSerializer(rule).data)


class AutomationRuleDetailView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return success_response(AutomationRuleSerializer(_get_rule(pk)).data)

    def patch(self, request, pk):
        rule = _get_rule(pk)
        serializer = AutomationRuleWriteSerializer(rule, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        rule = serializer.save()
        record_activity(
            actor=request.user,
            action="automation.rule.updated",
            target=rule,
            summary=f"Updated automation rule '{rule.name}'.",
            request=request,
        )
        return success_response(AutomationRuleSerializer(rule).data)

    def delete(self, request, pk):
        rule = _get_rule(pk)
        rule.soft_delete()
        record_activity(
            actor=request.user,
            action="automation.rule.deleted",
            target=rule,
            summary=f"Deleted automation rule '{rule.name}'.",
            request=request,
        )
        return no_content_response()


class AutomationRuleTestView(APIView):
    """Dry-run a saved rule against the active cohort — match count + sample +
    would-be actions. No AutomationLog rows, no actions executed."""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        rule = _get_rule(pk)
        result = dry_run_rule(conditions=rule.conditions, actions=rule.actions)
        return success_response(result)


class AutomationSweepView(APIView):
    """On-demand trigger of the scheduled sweep (for verification / manual runs)."""

    permission_classes = [IsAdmin]

    def post(self, request):
        summary = run_automation_sweep()
        record_activity(
            actor=request.user,
            action="automation.sweep.ran",
            summary=f"Ran automation sweep: {summary}.",
            request=request,
        )
        return success_response(summary)


class AutomationLogListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = AutomationLog.objects.select_related("rule").order_by("-created_at")
        rule_id = (request.query_params.get("rule") or "").strip()
        if rule_id:
            qs = qs.filter(rule_id=rule_id)
        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(AutomationLogSerializer(page, many=True).data)
