"""
DSAT LMS v2 — Courses student views
Domain: Courses (student player)
Description: An enrolled student browses their assigned, published courses, plays
    lessons, and marks per-lesson progress. Visibility is assignment-scoped:
    unassigned / unpublished courses 404. Mounted at /api/v1/courses/.
"""

from django.db.models import Prefetch
from django.utils import timezone
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from common.exceptions import ValidationError
from common.permissions import IsAcademyStudent
from common.responses import success_response

from . import services
from .models import Lesson, LessonProgress, Unit
from .serializers import StudentCourseListSerializer, StudentCourseSerializer


class CourseListView(APIView):
    permission_classes = [IsAcademyStudent]

    def get(self, request):
        courses = list(services.visible_course_qs(request.user).order_by("title"))
        completion = services.student_course_completion(request.user, [c.id for c in courses])
        data = StudentCourseListSerializer(
            courses, many=True, context={"completion": completion}
        ).data
        return success_response(data)


class CourseDetailView(APIView):
    permission_classes = [IsAcademyStudent]

    def get(self, request, pk):
        course = (
            services.visible_course_qs(request.user)
            .prefetch_related(
                Prefetch(
                    "units",
                    queryset=Unit.objects.prefetch_related(
                        Prefetch(
                            "lessons",
                            queryset=Lesson.objects.select_related(
                                "linked_exam", "linked_homework"
                            ).prefetch_related("attachments__attachment"),
                        )
                    ),
                )
            )
            .filter(pk=pk)
            .first()
        )
        if course is None:
            raise NotFound("Course not found.")
        # Per-lesson progress for this student across the course.
        progress_map = {
            p.lesson_id: p.status
            for p in LessonProgress.objects.filter(
                student=request.user, lesson__unit__course=course
            )
        }
        data = StudentCourseSerializer(course, context={"progress_map": progress_map}).data
        return success_response(data)


class LessonProgressView(APIView):
    permission_classes = [IsAcademyStudent]

    def post(self, request, pk):
        lesson = Lesson.objects.select_related("unit").filter(pk=pk).first()
        # The lesson must belong to a course the student can see.
        if (
            lesson is None
            or not services.visible_course_qs(request.user)
            .filter(id=lesson.unit.course_id)
            .exists()
        ):
            raise NotFound("Lesson not found.")

        status = (request.data.get("status") or LessonProgress.Status.COMPLETED).strip()
        if status not in LessonProgress.Status.values:
            return ValidationError("Unknown status.", field="status").to_response()

        defaults = {"status": status}
        defaults["completed_at"] = (
            timezone.now() if status == LessonProgress.Status.COMPLETED else None
        )
        progress, _ = LessonProgress.objects.update_or_create(
            student=request.user, lesson=lesson, defaults=defaults
        )
        return success_response({"lesson": str(lesson.id), "status": progress.status})
