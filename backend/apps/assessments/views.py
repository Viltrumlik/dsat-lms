"""
DSAT LMS v2 — Assessment Views (Test Engine)
Domain: Assessments
Description: Session lifecycle — start, fetch (recovery), auto-save (timer-checked),
            answer, submit (grade), result.
Permissions: IsAuthenticated (global). Sessions are owner-scoped (others get 404).
             Academy-only exams require user.has_full_access to start.
"""

import logging

from django.db.models import Count
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.views import APIView

from common.exceptions import ExamSessionError
from common.pagination import CursorPagination
from common.responses import created_response, success_response

from .models import ExamQuestion, ExamResponse, ExamSession, ExamTemplate
from .serializers import (
    AnswerSerializer,
    AutoSaveSerializer,
    ExamListSerializer,
    ResponseSerializer,
    ResultSerializer,
    SessionDetailSerializer,
    SessionListItemSerializer,
    StartSessionSerializer,
)
from .services import TIME_GRACE_SECONDS, grade_session, is_expired, server_time_remaining

logger = logging.getLogger("apps.assessments")


def _owned_session(request, pk):
    """Fetch a session owned by the requester, or 404 (no existence leak)."""
    try:
        return ExamSession.objects.select_related("exam").get(pk=pk, user=request.user)
    except ExamSession.DoesNotExist:
        raise NotFound("Session not found.") from None


class ExamListView(APIView):
    """Startable exam templates for the current user (dashboard 'take a test').

    Only exams that actually have questions are returned. Public exams are visible
    to everyone; academy-only exams require academy access (student/teacher/admin).
    Optional ?type= filter (practice, past_paper, ...).
    """

    def get(self, request):
        queryset = (
            ExamTemplate.objects.annotate(
                section_count=Count("sections", distinct=True),
                question_count=Count("sections__exam_questions", distinct=True),
            )
            .filter(section_count__gt=0, question_count__gt=0)
            .order_by("type", "title")
        )

        if not request.user.has_full_access:
            queryset = queryset.filter(access_level=ExamTemplate.AccessLevel.PUBLIC)

        exam_type = request.query_params.get("type")
        if exam_type:
            queryset = queryset.filter(type=exam_type)

        return success_response(ExamListSerializer(queryset, many=True).data)


class SessionListCreateView(APIView):
    def get(self, request):
        """The current user's session history (newest first, cursor-paginated)."""
        sessions = (
            ExamSession.objects.filter(user=request.user)
            .select_related("exam")
            .order_by("-created_at")
        )
        paginator = CursorPagination()
        page = paginator.paginate_queryset(sessions, request, view=self)
        return paginator.get_paginated_response(SessionListItemSerializer(page, many=True).data)

    def post(self, request):
        serializer = StartSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        exam = ExamTemplate.objects.get(id=serializer.validated_data["exam"])

        if (
            exam.access_level == ExamTemplate.AccessLevel.ACADEMY
            and not request.user.has_full_access
        ):
            raise PermissionDenied("This exam is available to academy members only.")

        session = ExamSession.objects.create(
            user=request.user,
            exam=exam,
            status=ExamSession.Status.IN_PROGRESS,
            time_remaining=exam.time_limit * 60 if exam.time_limit else None,
        )
        return created_response(SessionDetailSerializer(session).data)


class SessionDetailView(APIView):
    def get(self, request, pk):
        session = _owned_session(request, pk)
        return success_response(SessionDetailSerializer(session).data)

    def patch(self, request, pk):
        """Auto-save navigation + client state, with server-authoritative timer."""
        session = _owned_session(request, pk)
        if session.status != ExamSession.Status.IN_PROGRESS:
            return ExamSessionError("Session is not in progress.").to_response()

        serializer = AutoSaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        remaining = server_time_remaining(session)
        if remaining is not None:
            if remaining <= 0:
                return ExamSessionError("Time is up. Please submit the session.").to_response()
            claimed = data.get("time_remaining")
            if claimed is not None and claimed > remaining + TIME_GRACE_SECONDS:
                return ExamSessionError(
                    "Reported time exceeds the server clock.", field="time_remaining"
                ).to_response()

        # Moving to a new section starts that section's clock.
        if "current_section" in data and data["current_section"] != session.current_section:
            session.section_started_at = timezone.now()
        for field in ("current_section", "current_question", "client_session_data"):
            if field in data:
                setattr(session, field, data[field])
        if "time_remaining" in data:
            session.time_remaining = (
                min(data["time_remaining"], remaining)
                if remaining is not None
                else data["time_remaining"]
            )
        session.save()
        return success_response(SessionDetailSerializer(session).data)


class SessionPauseView(APIView):
    def post(self, request, pk):
        session = _owned_session(request, pk)
        if session.status != ExamSession.Status.IN_PROGRESS:
            return ExamSessionError("Only an in-progress session can be paused.").to_response()
        session.status = ExamSession.Status.PAUSED
        session.paused_at = timezone.now()
        session.save(update_fields=["status", "paused_at"])
        return success_response(SessionDetailSerializer(session).data)


class SessionResumeView(APIView):
    def post(self, request, pk):
        session = _owned_session(request, pk)
        if session.status != ExamSession.Status.PAUSED:
            return ExamSessionError("Only a paused session can be resumed.").to_response()
        if session.paused_at:
            # Shift the start timestamps forward so the paused span doesn't count.
            delta = timezone.now() - session.paused_at
            session.started_at = session.started_at + delta
            if session.section_started_at:
                session.section_started_at = session.section_started_at + delta
        session.paused_at = None
        session.status = ExamSession.Status.IN_PROGRESS
        session.save(update_fields=["status", "paused_at", "started_at", "section_started_at"])
        return success_response(SessionDetailSerializer(session).data)


class SessionAnswerView(APIView):
    def post(self, request, pk):
        session = _owned_session(request, pk)
        if session.status != ExamSession.Status.IN_PROGRESS:
            return ExamSessionError("Session is not in progress.").to_response()
        if is_expired(session):
            return ExamSessionError("Time is up. Please submit the session.").to_response()

        serializer = AnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        question_id = data["question"]

        if not ExamQuestion.objects.filter(
            section__exam=session.exam, question_id=question_id
        ).exists():
            return ExamSessionError(
                "That question is not part of this exam.", field="question"
            ).to_response()

        response, _ = ExamResponse.objects.update_or_create(
            session=session,
            question_id=question_id,
            defaults={
                "chosen_answer": data.get("chosen_answer", ""),
                "time_spent": data.get("time_spent"),
            },
        )
        return success_response(ResponseSerializer(response).data)


class SessionSubmitView(APIView):
    def post(self, request, pk):
        session = _owned_session(request, pk)

        if session.status == ExamSession.Status.COMPLETED:
            result = getattr(session, "result", None) or grade_session(session)
            return success_response(ResultSerializer(result).data)

        if session.status not in (
            ExamSession.Status.IN_PROGRESS,
            ExamSession.Status.PAUSED,
        ):
            return ExamSessionError("This session cannot be submitted.").to_response()

        result = grade_session(session)
        session.status = ExamSession.Status.COMPLETED
        session.submitted_at = timezone.now()
        session.save(update_fields=["status", "submitted_at"])

        # Async post-processing. Best-effort: a broker outage must not fail the
        # submit. Lazy import keeps the domain dependency one-way.
        try:
            from apps.analytics.tasks import calculate_percentile, update_category_stats

            calculate_percentile.delay(result.id)
            update_category_stats.delay(session.user_id)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to enqueue post-submit analytics for result %s", result.id)

        try:
            from apps.notifications.services import notify

            notify(
                session.user,
                "exam_graded",
                f"Your results for {session.exam.title} are ready.",
                data={"session_id": str(session.id)},
            )
        except Exception:  # noqa: BLE001
            logger.exception("Failed to create exam-graded notification for %s", session.user_id)

        return success_response(ResultSerializer(result).data)


class SessionResultView(APIView):
    def get(self, request, pk):
        session = _owned_session(request, pk)
        result = getattr(session, "result", None)
        if result is None:
            return ExamSessionError("No result yet — submit the session first.").to_response()
        return success_response(ResultSerializer(result).data)
