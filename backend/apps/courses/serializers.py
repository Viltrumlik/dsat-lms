"""
DSAT LMS v2 — Courses student serializers
Domain: Courses (student player)
Description: Read-only course/unit/lesson serializers for the assigned student,
    carrying per-lesson progress (from a context map). Published lessons only.
"""

from rest_framework import serializers

from .models import Course, Lesson, Unit
from .serializers_admin import (
    LessonAttachmentSerializer,
    LinkedExamMiniSerializer,
    LinkedHomeworkMiniSerializer,
)


class StudentLessonSerializer(serializers.ModelSerializer):
    linked_exam = LinkedExamMiniSerializer(read_only=True)
    linked_homework = LinkedHomeworkMiniSerializer(read_only=True)
    attachments = LessonAttachmentSerializer(many=True, read_only=True)
    progress_status = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = [
            "id",
            "title",
            "position",
            "content_md",
            "video_url",
            "linked_exam",
            "linked_homework",
            "attachments",
            "progress_status",
        ]

    def get_progress_status(self, obj):
        return (self.context.get("progress_map") or {}).get(obj.id)


class StudentUnitSerializer(serializers.ModelSerializer):
    lessons = StudentLessonSerializer(many=True, read_only=True)

    class Meta:
        model = Unit
        fields = ["id", "title", "position", "lessons"]


class StudentCourseSerializer(serializers.ModelSerializer):
    units = StudentUnitSerializer(many=True, read_only=True)

    class Meta:
        model = Course
        fields = ["id", "title", "slug", "description", "subject", "cover_image_url", "units"]


class StudentCourseListSerializer(serializers.ModelSerializer):
    """A course card for the student's browse page, with rolled-up completion."""

    completed = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()
    completion_pct = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            "id",
            "title",
            "slug",
            "subject",
            "description",
            "cover_image_url",
            "completed",
            "total",
            "completion_pct",
        ]

    def _stats(self, obj):
        return (self.context.get("completion") or {}).get(obj.id, {})

    def get_completed(self, obj):
        return self._stats(obj).get("completed", 0)

    def get_total(self, obj):
        return self._stats(obj).get("total", 0)

    def get_completion_pct(self, obj):
        return self._stats(obj).get("pct", 0.0)
