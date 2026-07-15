"""
DSAT LMS v2 — CRM staff views
Domain: CRM (front-office leads); mounted at /api/v1/staff/. IsFrontOffice + per-row
    scoping (out-of-scope → 404). A receptionist sees only own leads; admin /
    academic_manager see all (see apps/crm/scoping.py).
"""

import logging

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import CursorPagination
from common.permissions import IsFrontOffice
from common.responses import created_response, no_content_response, success_response

from . import services
from .models import FollowUpTask, Lead, LeadActivity
from .scoping import scoped_lead_or_404, scoped_leads
from .serializers import (
    FollowUpTaskCreateSerializer,
    FollowUpTaskSerializer,
    FollowUpTaskUpdateSerializer,
    LeadActivityCreateSerializer,
    LeadActivitySerializer,
    LeadDetailSerializer,
    LeadListSerializer,
    LeadWriteSerializer,
)

logger = logging.getLogger(__name__)

_CONVERSION_MESSAGES = {
    "email_required": "The lead needs an email address to convert.",
    "email_exists": "A user with that email already exists.",
    "already_converted": "This lead has already been converted.",
}
# 409 for a dedupe/state collision; 400 for the caller's own omissions.
_CONVERSION_STATUS = {"email_exists": 409, "already_converted": 409, "email_required": 400}


def _error_response(code, message, field, status_code):
    return Response(
        {"success": False, "error": {"code": code, "message": message, "field": field}},
        status=status_code,
    )


# Kanban columns are bounded; cap each so the board never returns an unbounded set.
_BOARD_COLUMN_CAP = 100


def _notify_lead_assigned(lead):
    if lead.owner_id is None:
        return
    try:
        from apps.notifications.services import notify

        notify(
            lead.owner,
            "lead_assigned",
            f"Lead assigned: {lead.name}",
            body=lead.name,
            data={"lead_id": str(lead.id), "lead_name": lead.name, "url": "/admin/leads"},
        )
    except Exception:  # noqa: BLE001
        logger.exception("Failed to send lead-assigned notification for %s", lead.id)


class LeadListCreateView(APIView):
    permission_classes = [IsFrontOffice]

    def get(self, request):
        qs = (
            scoped_leads(request)
            .select_related("owner", "converted_user")
            .annotate(
                open_tasks_annotated=Count(
                    "follow_ups",
                    filter=Q(follow_ups__done=False, follow_ups__deleted_at__isnull=True),
                )
            )
        )
        stage = (request.query_params.get("stage") or "").strip()
        if stage:
            qs = qs.filter(stage=stage)
        owner = (request.query_params.get("owner") or "").strip()
        if owner:
            qs = qs.filter(owner_id=owner)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(email__icontains=search))
        qs = qs.order_by("-created_at")
        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(LeadListSerializer(page, many=True).data)

    def post(self, request):
        serializer = LeadWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # A receptionist's new leads default to their own ownership.
        if "owner" not in serializer.validated_data and request.user.role == "receptionist":
            lead = serializer.save(owner=request.user)
        else:
            lead = serializer.save()
        if lead.owner_id:
            _notify_lead_assigned(lead)
        return created_response(LeadDetailSerializer(lead).data)


class LeadBoardView(APIView):
    """Kanban board — scoped leads grouped by stage (each column capped)."""

    permission_classes = [IsFrontOffice]

    def get(self, request):
        # Annotate open_tasks like the list view — else the serializer fallback
        # fires one COUNT per card (N+1 across the board).
        qs = (
            scoped_leads(request)
            .select_related("owner")
            .annotate(
                open_tasks_annotated=Count(
                    "follow_ups",
                    filter=Q(follow_ups__done=False, follow_ups__deleted_at__isnull=True),
                )
            )
            .order_by("-created_at")
        )
        columns = {}
        for stage, _label in Lead.Stage.choices:
            rows = qs.filter(stage=stage)[:_BOARD_COLUMN_CAP]
            columns[stage] = LeadListSerializer(rows, many=True).data
        return success_response({"columns": columns})


class LeadDetailView(APIView):
    permission_classes = [IsFrontOffice]

    def get(self, request, pk):
        lead = scoped_lead_or_404(request, pk)
        lead = (
            scoped_leads(request)
            .select_related("owner", "converted_user")
            .prefetch_related("activities__author", "follow_ups__assignee")
            .get(pk=lead.pk)
        )
        return success_response(LeadDetailSerializer(lead).data)

    def patch(self, request, pk):
        lead = scoped_lead_or_404(request, pk)
        serializer = LeadWriteSerializer(lead, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        old_stage = lead.stage
        old_owner_id = lead.owner_id
        serializer.save()
        lead.refresh_from_db()
        if lead.stage != old_stage:
            services.log_activity(
                lead,
                kind=LeadActivity.Kind.STAGE_CHANGE,
                body=f"{old_stage} → {lead.stage}",
                author=request.user,
            )
        if lead.owner_id and lead.owner_id != old_owner_id:
            _notify_lead_assigned(lead)
        return success_response(LeadDetailSerializer(lead).data)

    def delete(self, request, pk):
        scoped_lead_or_404(request, pk).soft_delete()
        return no_content_response()


class LeadConvertView(APIView):
    permission_classes = [IsFrontOffice]

    def post(self, request, pk):
        lead = scoped_lead_or_404(request, pk)
        try:
            services.convert_lead(lead, by=request.user)
        except services.ConversionError as exc:
            return _error_response(
                "CONVERSION_ERROR",
                _CONVERSION_MESSAGES.get(exc.code, "Could not convert the lead."),
                "email",
                _CONVERSION_STATUS.get(exc.code, 400),
            )
        return success_response(LeadDetailSerializer(scoped_lead_or_404(request, pk)).data)


class LeadActivitiesView(APIView):
    permission_classes = [IsFrontOffice]

    def get(self, request, pk):
        lead = scoped_lead_or_404(request, pk)
        activities = lead.activities.select_related("author").all()
        return success_response(LeadActivitySerializer(activities, many=True).data)

    def post(self, request, pk):
        lead = scoped_lead_or_404(request, pk)
        serializer = LeadActivityCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        activity = LeadActivity.objects.create(
            lead=lead, author=request.user, **serializer.validated_data
        )
        return created_response(LeadActivitySerializer(activity).data)


class LeadTasksView(APIView):
    permission_classes = [IsFrontOffice]

    def get(self, request, pk):
        lead = scoped_lead_or_404(request, pk)
        tasks = lead.follow_ups.select_related("assignee").all()
        return success_response(FollowUpTaskSerializer(tasks, many=True).data)

    def post(self, request, pk):
        lead = scoped_lead_or_404(request, pk)
        serializer = FollowUpTaskCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Default the assignee to the lead's owner, else the creator.
        data = serializer.validated_data
        if not data.get("assignee"):
            data["assignee"] = lead.owner or request.user
        task = FollowUpTask.objects.create(lead=lead, **data)
        return created_response(FollowUpTaskSerializer(task).data)


class FollowUpTaskDetailView(APIView):
    """Update a follow-up task (mark done, retitle, reschedule). Scoped via its lead."""

    permission_classes = [IsFrontOffice]

    def _get_task(self, request, pk):
        task = FollowUpTask.objects.select_related("lead", "assignee").filter(pk=pk).first()
        if task is None or not scoped_leads(request).filter(pk=task.lead_id).exists():
            raise NotFound("Task not found.")
        return task

    def patch(self, request, pk):
        task = self._get_task(request, pk)
        serializer = FollowUpTaskUpdateSerializer(task, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        was_done = task.done
        serializer.save()
        task.refresh_from_db()
        # Stamp/clear done_at on the done toggle.
        if task.done and not was_done:
            task.done_at = timezone.now()
            task.save(update_fields=["done_at", "updated_at"])
        elif not task.done and was_done:
            task.done_at = None
            task.save(update_fields=["done_at", "updated_at"])
        return success_response(FollowUpTaskSerializer(task).data)

    def delete(self, request, pk):
        self._get_task(request, pk).soft_delete()
        return no_content_response()
