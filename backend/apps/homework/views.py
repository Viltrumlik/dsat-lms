"""
DSAT LMS v2 — Homework Views
Domain: Homework
Description: Teachers assign/list homework for their classes and view submissions;
            enrolled students see their classes' homework and submit it.
Permissions: academy-only (has_full_access). Create/submissions = teacher/admin;
             submit = student. Everything is scoped (others 404 / 403).
"""

from django.db.models import Prefetch
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.views import APIView

from apps.academy.models import ClassEnrollment
from common.responses import created_response, success_response

from .models import Homework, HomeworkSubmission
from .serializers import (
    HomeworkCreateSerializer,
    HomeworkSerializer,
    HomeworkSubmissionSerializer,
)


def _require_academy(user):
    if not user.has_full_access:
        raise PermissionDenied("Homework is available to academy members only.")


def _visible_homeworks(user):
    queryset = Homework.objects.select_related("assigned_class", "exam")
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
                queryset=HomeworkSubmission.objects.filter(student=user),
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
        return created_response(HomeworkSerializer(homework).data)


class HomeworkDetailView(APIView):
    def get(self, request, pk):
        _require_academy(request.user)
        homework = _accessible_homework(request.user, pk)
        return success_response(HomeworkSerializer(homework).data)


class HomeworkSubmitView(APIView):
    def post(self, request, pk):
        if not request.user.is_academy_student:
            raise PermissionDenied("Only students can submit homework.")
        # Student visibility already requires active enrollment + published.
        homework = _accessible_homework(request.user, pk)
        submission, _ = HomeworkSubmission.objects.update_or_create(
            homework=homework,
            student=request.user,
            defaults={
                "status": HomeworkSubmission.Status.SUBMITTED,
                "submitted_at": timezone.now(),
            },
        )
        return success_response(HomeworkSubmissionSerializer(submission).data)


class HomeworkSubmissionsView(APIView):
    def get(self, request, pk):
        if not (request.user.is_teacher or request.user.is_admin):
            raise PermissionDenied("Only teachers can view submissions.")
        homework = _accessible_homework(request.user, pk)
        submissions = homework.submissions.select_related("student").order_by("-created_at")
        return success_response(HomeworkSubmissionSerializer(submissions, many=True).data)
