"""
DSAT LMS v2 — Gradebook views (5.3a)
Domain: Academy
Description: A class's students × homework matrix + inline/bulk grade entry. Staff
    are row-scoped to their own classes (admin/manager/reception: all) — an
    out-of-scope class or submission is 404, never 403.
Permissions: teacher surface IsOperationsStaff; admin surface IsAdmin.
"""

from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from common.exceptions import ValidationError
from common.permissions import IsAdmin, IsOperationsStaff
from common.responses import success_response

from .gradebook import class_gradebook
from .models import Class
from .scoping import scoped_classes
from .serializers import BulkGradeSerializer, GradeWriteSerializer


def _scoped_submission_or_404(request, pk):
    from apps.homework.models import HomeworkSubmission

    sub = (
        HomeworkSubmission.objects.filter(
            pk=pk, homework__assigned_class__in=scoped_classes(request)
        )
        .select_related("homework")
        .first()
    )
    if sub is None:
        raise NotFound("Submission not found.")
    return sub


def _apply_grade(sub, data, by):
    from django.utils import timezone

    from apps.homework.models import HomeworkSubmission

    if "grade" in data:
        sub.grade = data["grade"]
    if "grade_scale" in data:
        sub.grade_scale = data["grade_scale"]
    if "feedback" in data:
        sub.feedback = data["feedback"]
    sub.graded_by = by
    sub.graded_at = timezone.now()
    if sub.grade is not None:
        sub.status = HomeworkSubmission.Status.GRADED
    sub.save(
        update_fields=[
            "grade",
            "grade_scale",
            "feedback",
            "graded_by",
            "graded_at",
            "status",
            "updated_at",
        ]
    )


class TeacherGradebookView(APIView):
    permission_classes = [IsOperationsStaff]

    def get(self, request):
        class_id = (request.query_params.get("class_id") or "").strip()
        if not class_id:
            return ValidationError("class_id is required.", field="class_id").to_response()
        klass = scoped_classes(request).filter(pk=class_id).first()
        if klass is None:
            raise NotFound("Class not found.")
        return success_response(class_gradebook(klass))


class GradebookSubmissionView(APIView):
    permission_classes = [IsOperationsStaff]

    def patch(self, request, pk):
        sub = _scoped_submission_or_404(request, pk)
        serializer = GradeWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _apply_grade(sub, serializer.validated_data, request.user)
        return success_response(class_gradebook(sub.homework.assigned_class))


class GradebookBulkGradeView(APIView):
    permission_classes = [IsOperationsStaff]

    def post(self, request):
        serializer = BulkGradeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rows = serializer.validated_data["grades"]
        klass = None
        for row in rows:
            sub = _scoped_submission_or_404(request, row["submission"])
            _apply_grade(sub, row, request.user)
            klass = sub.homework.assigned_class
        # All rows should belong to one class in practice; return that gradebook.
        if klass is None:
            return success_response({"items": [], "rows": []})
        return success_response(class_gradebook(klass))


class AdminGradebookView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        class_id = (request.query_params.get("class_id") or "").strip()
        if not class_id:
            return ValidationError("class_id is required.", field="class_id").to_response()
        klass = Class.objects.filter(pk=class_id).first()
        if klass is None:
            raise NotFound("Class not found.")
        return success_response(class_gradebook(klass))
