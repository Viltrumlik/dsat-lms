"""
DSAT LMS v2 — Attendance views (5.2a)
Domain: Academy
Description: Staff create dated class sessions and mark per-student attendance for
    their own classes (admin / academic_manager / receptionist see all). Row-scoped
    via academy.scoping — an out-of-scope class or session is 404, never 403.
Permissions: IsOperationsStaff (+ per-row scoping).
"""

from django.db.models import Count
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from common.exceptions import ValidationError
from common.pagination import CursorPagination
from common.permissions import IsOperationsStaff
from common.responses import created_response, no_content_response, success_response

from .models import Attendance, ClassEnrollment, ClassScheduleRule, ClassSession
from .scoping import scoped_classes
from .serializers import (
    AttendanceMarkSerializer,
    AttendanceRowSerializer,
    ClassScheduleRuleSerializer,
    ClassScheduleRuleWriteSerializer,
    ClassSessionCreateSerializer,
    ClassSessionSerializer,
    ClassSessionUpdateSerializer,
)


class _SessionPagination(CursorPagination):
    """Cursor by session time (schedule order), newest first."""

    ordering = "-starts_at"


def _scoped_session_or_404(request, pk):
    session = (
        ClassSession.objects.filter(klass__in=scoped_classes(request), pk=pk)
        .select_related("klass")
        .first()
    )
    if session is None:
        raise NotFound("Session not found.")
    return session


def _scoped_class_or_404(request, pk):
    klass = scoped_classes(request).filter(pk=pk).first()
    if klass is None:
        raise NotFound("Class not found.")
    return klass


def _scoped_rule_or_404(request, pk):
    rule = ClassScheduleRule.objects.filter(klass__in=scoped_classes(request), pk=pk).first()
    if rule is None:
        raise NotFound("Schedule rule not found.")
    return rule


def _roster_rows(session):
    """Active-enrolled students of the session's class, each with their mark (a
    null status = unmarked). One prefetch of marks + one enrollment query."""
    marks = {a.student_id: a for a in session.attendances.all()}
    enrollments = (
        ClassEnrollment.objects.filter(klass=session.klass, status=ClassEnrollment.Status.ACTIVE)
        .select_related("student")
        .order_by("student__first_name", "student__last_name")
    )
    rows = []
    for e in enrollments:
        a = marks.get(e.student_id)
        rows.append(
            {"student": e.student, "status": a.status if a else None, "note": a.note if a else ""}
        )
    return rows


class TeacherClassSessionListCreateView(APIView):
    permission_classes = [IsOperationsStaff]

    def get(self, request):
        qs = ClassSession.objects.filter(klass__in=scoped_classes(request)).select_related("klass")
        class_id = (request.query_params.get("class_id") or "").strip()
        if class_id:
            qs = qs.filter(klass_id=class_id)
        dt_from = parse_datetime(request.query_params.get("from") or "")
        if dt_from:
            qs = qs.filter(starts_at__gte=dt_from)
        dt_to = parse_datetime(request.query_params.get("to") or "")
        if dt_to:
            qs = qs.filter(starts_at__lte=dt_to)
        qs = qs.annotate(marked_count_annotated=Count("attendances"))
        paginator = _SessionPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(ClassSessionSerializer(page, many=True).data)

    def post(self, request):
        serializer = ClassSessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        klass = serializer.validated_data["klass"]
        # Out-of-scope class → 404 (don't leak existence).
        if not scoped_classes(request).filter(pk=klass.pk).exists():
            raise NotFound("Class not found.")
        session = serializer.save(teacher=klass.teacher)
        return created_response(ClassSessionSerializer(session).data)


class TeacherClassSessionDetailView(APIView):
    permission_classes = [IsOperationsStaff]

    def get(self, request, pk):
        session = _scoped_session_or_404(request, pk)
        data = ClassSessionSerializer(session).data
        data["roster"] = AttendanceRowSerializer(_roster_rows(session), many=True).data
        return success_response(data)

    def patch(self, request, pk):
        session = _scoped_session_or_404(request, pk)
        serializer = ClassSessionUpdateSerializer(session, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(ClassSessionSerializer(session).data)


class TeacherClassSessionAttendanceView(APIView):
    permission_classes = [IsOperationsStaff]

    def get(self, request, pk):
        session = _scoped_session_or_404(request, pk)
        return success_response(AttendanceRowSerializer(_roster_rows(session), many=True).data)

    def put(self, request, pk):
        session = _scoped_session_or_404(request, pk)
        serializer = AttendanceMarkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        marks = serializer.validated_data["marks"]

        # Only students actively enrolled in this session's class may be marked.
        enrolled = set(
            ClassEnrollment.objects.filter(
                klass=session.klass, status=ClassEnrollment.Status.ACTIVE
            ).values_list("student_id", flat=True)
        )
        if any(m["student"] not in enrolled for m in marks):
            return ValidationError(
                "Some students are not enrolled in this class.", field="marks"
            ).to_response()

        for m in marks:
            Attendance.objects.update_or_create(
                session=session,
                student_id=m["student"],
                defaults={
                    "status": m["status"],
                    "note": m.get("note", ""),
                    "marked_by": request.user,
                },
            )
        return success_response(AttendanceRowSerializer(_roster_rows(session), many=True).data)


class TeacherClassScheduleRulesView(APIView):
    """List / create recurring schedule rules for one class."""

    permission_classes = [IsOperationsStaff]

    def get(self, request, pk):
        klass = _scoped_class_or_404(request, pk)
        rules = klass.schedule_rules.all()
        return success_response(ClassScheduleRuleSerializer(rules, many=True).data)

    def post(self, request, pk):
        klass = _scoped_class_or_404(request, pk)
        serializer = ClassScheduleRuleWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rule = serializer.save(klass=klass)
        return created_response(ClassScheduleRuleSerializer(rule).data)


class TeacherScheduleRuleDetailView(APIView):
    """Update / delete a single schedule rule (soft-delete)."""

    permission_classes = [IsOperationsStaff]

    def patch(self, request, pk):
        rule = _scoped_rule_or_404(request, pk)
        serializer = ClassScheduleRuleWriteSerializer(rule, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(ClassScheduleRuleSerializer(rule).data)

    def delete(self, request, pk):
        rule = _scoped_rule_or_404(request, pk)
        rule.soft_delete()
        return no_content_response()
