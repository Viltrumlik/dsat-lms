"""
DSAT LMS v2 — Courses admin views
Domain: Courses (admin authoring)
Description: Course CRUD + publish lifecycle, unit/lesson CRUD + reorder
    (active-rows-only permutation), and lesson attachments. Mounted at
    /api/v1/admin/. IsAdmin on every endpoint.
"""

import logging

from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from apps.files.models import Attachment
from common.exceptions import ValidationError
from common.pagination import CursorPagination
from common.permissions import IsAdmin
from common.responses import created_response, no_content_response, success_response

from . import services
from .models import Course, CourseAssignment, Lesson, LessonAttachment, Unit
from .serializers_admin import (
    AddLessonAttachmentSerializer,
    AdminCourseAssignmentSerializer,
    AdminCourseAssignmentWriteSerializer,
    CourseDetailSerializer,
    CourseListSerializer,
    CourseWriteSerializer,
    LessonAttachmentSerializer,
    LessonDetailSerializer,
    LessonWriteSerializer,
    ReorderSerializer,
    UnitNodeSerializer,
    UnitWriteSerializer,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────
# Lookups (404 on miss)
# ─────────────────────────────────────
def _get_course(pk):
    course = Course.objects.prefetch_related("units__lessons").filter(pk=pk).first()
    if course is None:
        raise NotFound("Course not found.")
    return course


def _get_unit(course, unit_id):
    unit = course.units.filter(pk=unit_id).first()
    if unit is None:
        raise NotFound("Unit not found.")
    return unit


def _get_lesson(pk):
    lesson = (
        Lesson.objects.select_related("unit", "linked_exam", "linked_homework")
        .prefetch_related("attachments__attachment")
        .filter(pk=pk)
        .first()
    )
    if lesson is None:
        raise NotFound("Lesson not found.")
    return lesson


# ─────────────────────────────────────
# Courses
# ─────────────────────────────────────
class AdminCourseListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = Course.objects.annotate(
            unit_count_annotated=Count("units", distinct=True),
            lesson_count_annotated=Count("units__lessons", distinct=True),
        )
        status_f = (request.query_params.get("status") or "").strip()
        if status_f:
            qs = qs.filter(status=status_f)
        subject_f = (request.query_params.get("subject") or "").strip()
        if subject_f:
            qs = qs.filter(subject=subject_f)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))
        qs = qs.order_by("-created_at")
        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(CourseListSerializer(page, many=True).data)

    def post(self, request):
        serializer = CourseWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        data["slug"] = services.unique_course_slug(data["title"])
        course = Course.objects.create(created_by=request.user, **data)
        return created_response(CourseDetailSerializer(course).data)


class AdminCourseDetailView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return success_response(CourseDetailSerializer(_get_course(pk)).data)

    def patch(self, request, pk):
        course = _get_course(pk)
        serializer = CourseWriteSerializer(course, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        # Keep the slug in sync when the title changes (unique among active courses).
        if "title" in serializer.validated_data:
            course.slug = services.unique_course_slug(
                serializer.validated_data["title"], exclude_pk=course.pk
            )
        serializer.save(slug=course.slug)
        return success_response(CourseDetailSerializer(_get_course(pk)).data)

    def delete(self, request, pk):
        _get_course(pk).soft_delete()
        return no_content_response()


class AdminCoursePublishView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        course = _get_course(pk)
        action = (request.data.get("action") or "publish").strip()
        if action == "publish":
            if not Lesson.objects.filter(unit__course=course).exists():
                return ValidationError(
                    "Add at least one lesson before publishing.", field="status"
                ).to_response()
            course.publish()
        elif action == "archive":
            course.archive()
        elif action == "unpublish":
            course.status = Course.Status.DRAFT
            course.save(update_fields=["status", "updated_at"])
        else:
            return ValidationError("Unknown action.", field="action").to_response()
        return success_response(CourseDetailSerializer(_get_course(pk)).data)


# ─────────────────────────────────────
# Units
# ─────────────────────────────────────
class AdminUnitListCreateView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, course_id):
        course = _get_course(course_id)
        serializer = UnitWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        unit = Unit.objects.create(
            course=course,
            position=services.next_position(course.units),
            **serializer.validated_data,
        )
        return created_response(UnitNodeSerializer(unit).data)


class AdminUnitDetailView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, course_id, unit_id):
        course = _get_course(course_id)
        unit = _get_unit(course, unit_id)
        serializer = UnitWriteSerializer(unit, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(UnitNodeSerializer(unit).data)

    def delete(self, request, course_id, unit_id):
        course = _get_course(course_id)
        _get_unit(course, unit_id).soft_delete()
        return no_content_response()


class AdminUnitReorderView(APIView):
    """Reorder units within a course (permutation of the course's active units)."""

    permission_classes = [IsAdmin]

    def post(self, request, course_id):
        course = _get_course(course_id)
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.reorder(course.units.all(), serializer.validated_data["order"])
        except ValueError as exc:
            return ValidationError(str(exc), field="order").to_response()
        return success_response(CourseDetailSerializer(_get_course(course_id)).data)


# ─────────────────────────────────────
# Lessons
# ─────────────────────────────────────
class AdminLessonListCreateView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, course_id, unit_id):
        course = _get_course(course_id)
        unit = _get_unit(course, unit_id)
        serializer = LessonWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lesson = Lesson.objects.create(
            unit=unit,
            position=services.next_position(unit.lessons),
            **serializer.validated_data,
        )
        return created_response(LessonDetailSerializer(lesson).data)


class AdminLessonDetailView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return success_response(LessonDetailSerializer(_get_lesson(pk)).data)

    def patch(self, request, pk):
        lesson = _get_lesson(pk)
        serializer = LessonWriteSerializer(lesson, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(LessonDetailSerializer(_get_lesson(pk)).data)

    def delete(self, request, pk):
        _get_lesson(pk).soft_delete()
        return no_content_response()


class AdminLessonReorderView(APIView):
    """Reorder lessons within a unit."""

    permission_classes = [IsAdmin]

    def post(self, request, course_id, unit_id):
        course = _get_course(course_id)
        unit = _get_unit(course, unit_id)
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.reorder(unit.lessons.all(), serializer.validated_data["order"])
        except ValueError as exc:
            return ValidationError(str(exc), field="order").to_response()
        return success_response(UnitNodeSerializer(_get_unit(course, unit_id)).data)


# ─────────────────────────────────────
# Lesson attachments
# ─────────────────────────────────────
class AdminLessonAttachmentsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        lesson = _get_lesson(pk)
        return success_response(
            LessonAttachmentSerializer(lesson.attachments.all(), many=True).data
        )

    def post(self, request, pk):
        lesson = _get_lesson(pk)
        serializer = AddLessonAttachmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        attachment = Attachment.objects.filter(pk=serializer.validated_data["attachment"]).first()
        if attachment is None:
            return ValidationError("Attachment not found.", field="attachment").to_response()
        try:
            with transaction.atomic():
                link = LessonAttachment.objects.create(
                    lesson=lesson,
                    attachment=attachment,
                    caption=serializer.validated_data.get("caption", ""),
                )
        except IntegrityError:
            return ValidationError("Could not attach that file.").to_response()
        return created_response(LessonAttachmentSerializer(link).data)


class AdminLessonAttachmentDeleteView(APIView):
    permission_classes = [IsAdmin]

    def delete(self, request, pk, att_id):
        lesson = _get_lesson(pk)
        link = lesson.attachments.filter(pk=att_id).first()
        if link is None:
            raise NotFound("Attachment not on this lesson.")
        link.soft_delete()
        return no_content_response()


# ─────────────────────────────────────
# Assignments
# ─────────────────────────────────────
def _get_assignment(pk):
    assignment = (
        CourseAssignment.objects.select_related(
            "course", "assigned_by", "assigned_class", "assigned_student"
        )
        .filter(pk=pk)
        .first()
    )
    if assignment is None:
        raise NotFound("Assignment not found.")
    return assignment


def _notify_course_assigned(assignment):
    """Best-effort in-app notification to every targeted student. English strings
    are fallbacks; the client renders localized templates from the structured data."""
    try:
        from apps.identity.models import User
        from apps.notifications.services import notify

        student_ids = services.assignment_cohort_ids(assignment)
        course = assignment.course
        for user in User.objects.filter(id__in=student_ids):
            notify(
                user,
                "course_assigned",
                f"New course: {course.title}",
                body=course.title,
                data={
                    "course_id": str(course.id),
                    "course_title": course.title,
                    "url": f"/courses/{course.id}",
                },
            )
    except Exception:  # noqa: BLE001
        logger.exception("Failed to send course-assigned notifications for %s", assignment.id)


class AdminCourseAssignmentListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = CourseAssignment.objects.select_related(
            "course", "assigned_by", "assigned_class", "assigned_student"
        )
        course = (request.query_params.get("course") or "").strip()
        if course:
            qs = qs.filter(course_id=course)
        qs = qs.order_by("-created_at")
        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            AdminCourseAssignmentSerializer(page, many=True).data
        )

    def post(self, request):
        serializer = AdminCourseAssignmentWriteSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        assignment = serializer.save()
        _notify_course_assigned(assignment)
        return created_response(
            AdminCourseAssignmentSerializer(_get_assignment(assignment.id)).data
        )


class AdminCourseAssignmentDetailView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return success_response(AdminCourseAssignmentSerializer(_get_assignment(pk)).data)

    def patch(self, request, pk):
        assignment = _get_assignment(pk)
        serializer = AdminCourseAssignmentWriteSerializer(
            assignment, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(AdminCourseAssignmentSerializer(_get_assignment(pk)).data)

    def delete(self, request, pk):
        _get_assignment(pk).soft_delete()
        return no_content_response()


class AdminCourseAssignmentProgressView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        assignment = _get_assignment(pk)
        return success_response(services.assignment_progress(assignment))
