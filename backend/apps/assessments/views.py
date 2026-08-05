"""
DSAT LMS v2 — Assessment Views (Test Engine)
Domain: Assessments
Description: Session lifecycle — start, fetch (recovery), auto-save (timer-checked),
            answer, submit (grade), result, and post-submission review.
Permissions: IsAuthenticated (global). Sessions are owner-scoped (others get 404).
             Academy-only exams require user.has_full_access to start.
"""

import logging

from django.db.models import Count
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.views import APIView

from apps.question_bank.models import Question
from common.exceptions import ExamSessionError
from common.pagination import CursorPagination
from common.responses import created_response, success_response

from .eligibility import NotEligibleError, check_can_start, live_session_for
from .models import ExamQuestion, ExamResponse, ExamSession, ExamTemplate
from .serializers import (
    AnswerSerializer,
    AutoSaveSerializer,
    ExamListSerializer,
    InstantFeedbackSerializer,
    ResultSerializer,
    ReviewQuestionSerializer,
    SessionDetailSerializer,
    SessionListItemSerializer,
    StartSessionSerializer,
    TestResponseSerializer,
)
from .services import (
    answers_match,
    exam_is_over,
    grade_session,
    is_expired,
    section_time_remaining,
    server_time_remaining,
)

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
            .filter(section_count__gt=0, question_count__gt=0, is_generated=False)
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
        """Start a paper — or hand back the one already open on it.

        Minting a second session for the same exam would restart the clock, so a
        student holding a live session is returned THAT session rather than a
        fresh one. Scheduling, attempt caps and free-tier quotas are enforced
        here (see eligibility.py); access level stays a 403.
        """
        serializer = StartSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        exam = ExamTemplate.objects.get(id=serializer.validated_data["exam"])

        if (
            exam.access_level == ExamTemplate.AccessLevel.ACADEMY
            and not request.user.has_full_access
        ):
            raise PermissionDenied("This exam is available to academy members only.")

        existing = live_session_for(request.user, exam)
        if existing is not None:
            return success_response(SessionDetailSerializer(existing).data)

        try:
            assignment = check_can_start(request.user, exam)
        except NotEligibleError as exc:
            error = ExamSessionError(exc.message)
            error.code = exc.code  # PRACTICE_LIMIT_REACHED, EXAM_CLOSED, …
            return error.to_response()

        session = ExamSession.objects.create(
            user=request.user,
            exam=exam,
            assignment=assignment,
            status=ExamSession.Status.IN_PROGRESS,
            time_remaining=exam.time_limit * 60 if exam.time_limit else None,
        )
        return created_response(SessionDetailSerializer(session).data)


class SessionDetailView(APIView):
    def get(self, request, pk):
        session = _owned_session(request, pk)
        return success_response(SessionDetailSerializer(session).data)

    def patch(self, request, pk):
        """Auto-save navigation + client state, with a server-authoritative timer.

        Two rules do the security work here:

        1. Sections move FORWARD ONLY. Entering a section stamps its clock, so a
           client that could move backward could restamp it — hop 2→1→2 and the
           module timer resets, forever. Backward moves are now refused outright.
        2. A spent SECTION clock is not a spent PAPER. When the module timer runs
           out the only thing still permitted is the advance to the next section;
           when the whole-exam clock runs out nothing is, and the paper must be
           submitted. Conflating the two used to strand the student: refused the
           advance because the section had expired, and so unable to ever reach
           the section they had time left in.

        time_remaining is not read from the request at all — it is recomputed and
        written by the server on every save.
        """
        session = _owned_session(request, pk)
        if session.status != ExamSession.Status.IN_PROGRESS:
            return ExamSessionError("Session is not in progress.").to_response()

        serializer = AutoSaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if exam_is_over(session):
            return ExamSessionError("Time is up. Please submit the session.").to_response()

        requested_section = data.get("current_section")
        advancing = requested_section is not None and requested_section != session.current_section
        if advancing and requested_section < session.current_section:
            return ExamSessionError(
                "You cannot go back to a previous section.",
                field="current_section",
            ).to_response()

        section_left = section_time_remaining(session)
        if section_left is not None and section_left <= 0 and not advancing:
            return ExamSessionError(
                "Time is up for this section. Move on to the next one."
            ).to_response()

        if advancing:
            # First (and only) time this section is entered — start its clock.
            session.section_started_at = timezone.now()
            session.current_section = requested_section

        for field in ("current_question", "client_session_data"):
            if field in data:
                setattr(session, field, data[field])

        # Server-computed cache of the clock, so the stored column can never
        # disagree with what the server would enforce.
        session.time_remaining = server_time_remaining(session)
        session.save()
        return success_response(SessionDetailSerializer(session).data)


class SessionPauseView(APIView):
    """Stop the clock.

    Only where the paper allows it. Pausing freezes the timer and resume shifts
    the start timestamps forward, so on an invigilated paper pause/resume is
    simply unlimited time with extra steps — look the answer up, come back. See
    ExamTemplate.allow_pause.
    """

    def post(self, request, pk):
        session = _owned_session(request, pk)
        if session.status != ExamSession.Status.IN_PROGRESS:
            return ExamSessionError("Only an in-progress session can be paused.").to_response()
        if not session.exam.allow_pause:
            return ExamSessionError("This test cannot be paused once it has started.").to_response()
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
    """Record one answer.

    The question must belong to the section the student is CURRENTLY in. Without
    that, per-section timing means nothing: finish module 1, advance to module 2,
    and keep answering module 1's questions with module 2's clock. Sections are
    forward-only, so a question from an earlier section is closed for good.
    """

    def post(self, request, pk):
        session = _owned_session(request, pk)
        if session.status != ExamSession.Status.IN_PROGRESS:
            return ExamSessionError("Session is not in progress.").to_response()
        if is_expired(session):
            return ExamSessionError("Time is up for this section.").to_response()

        serializer = AnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        question_id = data["question"]

        placements = ExamQuestion.objects.filter(
            section__exam=session.exam, question_id=question_id
        ).values_list("section__section_number", flat=True)
        if not placements:
            return ExamSessionError(
                "That question is not part of this exam.", field="question"
            ).to_response()
        if session.current_section not in set(placements):
            return ExamSessionError(
                "That question belongs to a section you have already finished.",
                field="question",
            ).to_response()

        chosen = data.get("chosen_answer", "")
        instant = session.feedback_mode == ExamSession.FeedbackMode.INSTANT

        # Marked as it is given, but ONLY on a session that was started in
        # instant mode. The mode is set at start and is not a request field, so
        # a client cannot ask a real paper to grade for it — which is exactly
        # the oracle the exam-mode shape exists to prevent.
        is_correct = None
        if instant and chosen.strip():
            question = Question.objects.only("correct_answer").get(pk=question_id)
            is_correct = answers_match(chosen, question.correct_answer)

        response, _ = ExamResponse.objects.update_or_create(
            session=session,
            question_id=question_id,
            defaults={
                "chosen_answer": chosen,
                "time_spent": data.get("time_spent"),
                "is_correct": is_correct,
            },
        )

        if instant:
            return success_response(InstantFeedbackSerializer(response).data)
        return success_response(TestResponseSerializer(response).data)


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

        # If this session was started from an exam-backed homework, turn the
        # homework in automatically. Lazy import keeps the dependency one-way.
        try:
            from apps.homework.services import complete_submissions_for_session

            complete_submissions_for_session(session)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to complete homework submissions for session %s", session.id)

        try:
            from apps.notifications.services import notify

            notify(
                session.user,
                "exam_graded",
                f"Your results for {session.exam.title} are ready.",
                data={"session_id": str(session.id), "exam_title": session.exam.title},
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


class SessionReviewView(APIView):
    """GET /sessions/{id}/review/ — the post-submission answer review.

    Returns every question in exam order with its correct answer, the student's
    answer, and whether they matched — right and wrong, nothing else. Only
    available on a submitted session the requester owns, since it exposes the key.

    Correctness is recomputed here from the question bank's CURRENT correct
    answer (via the same `answers_match` grading uses) rather than read from the
    stored response flag, so the review always agrees with the question a student
    is looking at — questions are not versioned and admins edit them in place.
    """

    def get(self, request, pk):
        session = _owned_session(request, pk)
        if session.status != ExamSession.Status.COMPLETED:
            return ExamSessionError("Review is available after you submit.").to_response()

        exam_questions = (
            ExamQuestion.objects.filter(section__exam=session.exam)
            .select_related("section", "question")
            .prefetch_related("question__choices")
            .order_by("section__section_number", "position")
        )
        chosen_by_question = {
            r.question_id: r.chosen_answer for r in ExamResponse.objects.filter(session=session)
        }

        rows = []
        for number, exam_question in enumerate(exam_questions, start=1):
            question = exam_question.question
            chosen = chosen_by_question.get(question.id) or ""
            if not chosen.strip():
                status = "skipped"
            elif answers_match(chosen, question.correct_answer):
                status = "correct"
            else:
                status = "incorrect"
            rows.append(
                {
                    "number": number,
                    "section_number": exam_question.section.section_number,
                    "section_title": exam_question.section.title,
                    "question": question,
                    "correct_answer": question.correct_answer,
                    "chosen_answer": chosen or None,
                    "status": status,
                }
            )

        return success_response(ReviewQuestionSerializer(rows, many=True).data)
