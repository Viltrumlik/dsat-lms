"""
DSAT LMS v2 — Homework Views
Domain: Homework
Description: Teachers assign/list homework for their classes and view submissions;
            enrolled students see their classes' homework and submit it.
Permissions: academy-only (has_full_access). Create/submissions = teacher/admin;
             submit = student. Everything is scoped (others 404 / 403).
"""

import logging

from django.db.models import Prefetch
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.views import APIView

from apps.academy.models import ClassEnrollment
from apps.assessments.eligibility import NotEligibleError, check_can_start, live_session_for
from apps.assessments.models import ExamSession
from apps.assessments.serializers import SessionDetailSerializer
from common.exceptions import ExamSessionError, ValidationError
from common.responses import created_response, success_response

from .models import Homework, HomeworkAttachment, HomeworkSubmission
from .serializers import (
    GradeSerializer,
    HomeworkCreateSerializer,
    HomeworkSerializer,
    HomeworkSubmissionSerializer,
    ReturnSerializer,
    SubmitSerializer,
)
from .services import (
    HomeworkError,
    get_or_create_submission,
    grade_submission,
    return_submission,
    submit_homework,
)

logger = logging.getLogger(__name__)


def _require_academy(user):
    if not user.has_full_access:
        raise PermissionDenied("Homework is available to academy members only.")


def _visible_homeworks(user):
    queryset = Homework.objects.select_related("assigned_class", "exam").prefetch_related(
        "attachments__attachment"
    )
    if user.is_admin:
        return queryset
    if user.is_teacher:
        return queryset.filter(assigned_class__teacher=user)
    return (
        queryset.filter(
            assigned_class__enrollments__student=user,
            assigned_class__enrollments__status=ClassEnrollment.Status.ACTIVE,
            is_published=True,
        )
        .distinct()
        .prefetch_related(
            Prefetch(
                "submissions",
                queryset=HomeworkSubmission.objects.filter(student=user).prefetch_related(
                    "files__attachment", "events__actor"
                ),
                to_attr="my_submissions",
            )
        )
    )


def _accessible_homework(user, pk):
    try:
        return _visible_homeworks(user).get(pk=pk)
    except Homework.DoesNotExist:
        raise NotFound("Homework not found.") from None


class HomeworkListCreateView(APIView):
    def get(self, request):
        _require_academy(request.user)
        homeworks = _visible_homeworks(request.user).order_by("-created_at")
        return success_response(HomeworkSerializer(homeworks, many=True).data)

    def post(self, request):
        if not (request.user.is_teacher or request.user.is_admin):
            raise PermissionDenied("Only teachers can assign homework.")
        serializer = HomeworkCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        klass = serializer.validated_data["assigned_class"]
        if not request.user.is_admin and klass.teacher_id != request.user.id:
            raise PermissionDenied("You can only assign homework to your own classes.")
        homework = serializer.save(assigned_by=request.user)

        # Link any materials the teacher uploaded with the brief. They must own
        # the attachments — same rule as a student attaching their own work.
        attachment_ids = serializer.validated_data.get("attachment_ids") or []
        if attachment_ids:
            from apps.files.models import Attachment

            for attachment in Attachment.objects.filter(
                id__in=attachment_ids, owner=request.user, deleted_at__isnull=True
            ):
                HomeworkAttachment.objects.get_or_create(
                    homework=homework, attachment=attachment, defaults={"added_by": request.user}
                )

        # Best-effort in-app notification to every actively enrolled student.
        # Lazy import keeps the domain dependency one-way. English title/body are
        # fallbacks; clients render localized templates from the structured data.
        try:
            from apps.notifications.services import notify

            enrollments = klass.enrollments.filter(
                status=ClassEnrollment.Status.ACTIVE
            ).select_related("student")
            for enrollment in enrollments:
                notify(
                    enrollment.student,
                    "homework_assigned",
                    f"New homework: {homework.title}",
                    body=f"{klass.name} — due {homework.due_at:%b %d, %Y}",
                    data={
                        "homework_id": str(homework.id),
                        "homework_title": homework.title,
                        "class_name": klass.name,
                        "due_at": homework.due_at.isoformat(),
                    },
                )
        except Exception:  # noqa: BLE001
            logger.exception("Failed to create homework-assigned notifications for %s", homework.id)

        return created_response(HomeworkSerializer(homework).data)


class HomeworkDetailView(APIView):
    def get(self, request, pk):
        _require_academy(request.user)
        homework = _accessible_homework(request.user, pk)
        return success_response(HomeworkSerializer(homework).data)


class HomeworkStartView(APIView):
    def post(self, request, pk):
        """Start the linked exam AND bind the session to the student's submission,
        so submitting the test turns the homework in automatically.

        This creates an ExamSession, so it goes through the SAME gate as
        POST /sessions/ — it used to mint one directly, which meant pressing
        "Start" twice handed out a second paper with a second clock, and the
        assignment window and attempt cap were never consulted.
        """
        if not request.user.is_academy_student:
            raise PermissionDenied("Only students can start homework.")
        homework = _accessible_homework(request.user, pk)
        if homework.exam_id is None:
            return ValidationError("This homework has no linked test.", field="exam").to_response()

        exam = homework.exam
        # Visibility already implies active enrollment (academy access), so the
        # exam's access level needs no separate check here.
        session = live_session_for(request.user, exam)
        if session is None:
            try:
                assignment = check_can_start(request.user, exam)
            except NotEligibleError as exc:
                error = ExamSessionError(exc.message)
                error.code = exc.code
                return error.to_response()
            session = ExamSession.objects.create(
                user=request.user,
                exam=exam,
                assignment=assignment,
                status=ExamSession.Status.IN_PROGRESS,
                time_remaining=exam.time_limit * 60 if exam.time_limit else None,
            )

        submission = get_or_create_submission(homework, request.user)
        if submission.session_id != session.id:
            submission.session = session
            submission.save(update_fields=["session", "updated_at"])
        return created_response(SessionDetailSerializer(session).data)


class HomeworkSubmitView(APIView):
    def post(self, request, pk):
        """Hand work in — a written response, files, or just the acknowledgement."""
        if not request.user.is_academy_student:
            raise PermissionDenied("Only students can submit homework.")
        # Student visibility already requires active enrollment + published.
        homework = _accessible_homework(request.user, pk)

        serializer = SubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            submission = submit_homework(
                homework,
                request.user,
                response_text=data["response_text"],
                attachment_ids=data["attachment_ids"],
            )
        except HomeworkError as exc:
            return ValidationError(exc.message, field=exc.field).to_response()

        # Event seam: fire any enabled automation rules listening for this event.
        # Best-effort + lazy import (one-way dep) — never breaks the submission.
        from apps.automation.dispatch import dispatch

        dispatch("homework_submitted", request.user.id)
        return success_response(HomeworkSubmissionSerializer(submission).data)


class HomeworkSubmissionsView(APIView):
    def get(self, request, pk):
        if not (request.user.is_teacher or request.user.is_admin):
            raise PermissionDenied("Only teachers can view submissions.")
        homework = _accessible_homework(request.user, pk)
        submissions = (
            homework.submissions.select_related("student")
            .prefetch_related("files__attachment")
            .order_by("-created_at")
        )
        return success_response(HomeworkSubmissionSerializer(submissions, many=True).data)


def _gradable_submission(request, homework_pk, submission_pk):
    """A submission on a homework this staff member owns, or 404."""
    if not (request.user.is_teacher or request.user.is_admin):
        raise PermissionDenied("Only teachers can mark homework.")
    homework = _accessible_homework(request.user, homework_pk)
    try:
        return homework.submissions.select_related("student", "homework").get(pk=submission_pk)
    except HomeworkSubmission.DoesNotExist:
        raise NotFound("Submission not found.") from None


class HomeworkGradeView(APIView):
    def post(self, request, pk, submission_pk):
        submission = _gradable_submission(request, pk, submission_pk)
        serializer = GradeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            submission = grade_submission(
                submission,
                request.user,
                grade=data.get("grade"),
                grade_scale=data.get("grade_scale"),
                feedback=data["feedback"],
            )
        except HomeworkError as exc:
            return ValidationError(exc.message, field=exc.field).to_response()
        return success_response(HomeworkSubmissionSerializer(submission).data)


class HomeworkReturnView(APIView):
    """Hand the work back for another go, with a note saying why."""

    def post(self, request, pk, submission_pk):
        submission = _gradable_submission(request, pk, submission_pk)
        serializer = ReturnSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            submission = return_submission(
                submission, request.user, note=serializer.validated_data["note"]
            )
        except HomeworkError as exc:
            return ValidationError(exc.message, field=exc.field).to_response()
        return success_response(HomeworkSubmissionSerializer(submission).data)
