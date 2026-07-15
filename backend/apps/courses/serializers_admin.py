"""
DSAT LMS v2 — Courses admin serializers
Domain: Courses (admin authoring)
"""

from rest_framework import serializers

from apps.assessments.models import ExamTemplate
from apps.homework.models import Homework

from .models import Course, Lesson, LessonAttachment, Unit


# ─────────────────────────────────────
# Mini read serializers for linked objects
# ─────────────────────────────────────
class LinkedExamMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamTemplate
        fields = ["id", "title", "type"]


class LinkedHomeworkMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Homework
        fields = ["id", "title"]


class LessonAttachmentSerializer(serializers.ModelSerializer):
    attachment_id = serializers.UUIDField(source="attachment.id", read_only=True)
    original_name = serializers.CharField(source="attachment.original_name", read_only=True)
    content_type = serializers.CharField(source="attachment.content_type", read_only=True)
    size = serializers.IntegerField(source="attachment.size", read_only=True)

    class Meta:
        model = LessonAttachment
        fields = [
            "id",
            "attachment_id",
            "original_name",
            "content_type",
            "size",
            "caption",
            "created_at",
        ]


# ─────────────────────────────────────
# Lessons
# ─────────────────────────────────────
class LessonNodeSerializer(serializers.ModelSerializer):
    """Light lesson node for the course tree (no full body)."""

    has_content = serializers.SerializerMethodField()
    attachment_count = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = [
            "id",
            "title",
            "position",
            "video_url",
            "linked_exam",
            "linked_homework",
            "has_content",
            "attachment_count",
        ]

    def get_has_content(self, obj):
        return bool(obj.content_md and obj.content_md.strip())

    def get_attachment_count(self, obj):
        annotated = getattr(obj, "attachment_count_annotated", None)
        if annotated is not None:
            return annotated
        return obj.attachments.count()


class LessonDetailSerializer(serializers.ModelSerializer):
    """Full lesson for the editor — includes body + attachments + linked meta."""

    linked_exam_detail = LinkedExamMiniSerializer(source="linked_exam", read_only=True)
    linked_homework_detail = LinkedHomeworkMiniSerializer(source="linked_homework", read_only=True)
    attachments = LessonAttachmentSerializer(many=True, read_only=True)
    unit = serializers.UUIDField(source="unit_id", read_only=True)
    course = serializers.UUIDField(source="unit.course_id", read_only=True)

    class Meta:
        model = Lesson
        fields = [
            "id",
            "unit",
            "course",
            "title",
            "position",
            "content_md",
            "video_url",
            "linked_exam",
            "linked_exam_detail",
            "linked_homework",
            "linked_homework_detail",
            "attachments",
            "created_at",
            "updated_at",
        ]


class LessonWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lesson
        fields = ["title", "content_md", "video_url", "linked_exam", "linked_homework"]


class AddLessonAttachmentSerializer(serializers.Serializer):
    attachment = serializers.UUIDField()
    caption = serializers.CharField(required=False, allow_blank=True, default="")


# ─────────────────────────────────────
# Units
# ─────────────────────────────────────
class UnitNodeSerializer(serializers.ModelSerializer):
    lessons = LessonNodeSerializer(many=True, read_only=True)

    class Meta:
        model = Unit
        fields = ["id", "title", "position", "lessons"]


class UnitWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = ["title"]


# ─────────────────────────────────────
# Courses
# ─────────────────────────────────────
class CourseListSerializer(serializers.ModelSerializer):
    unit_count = serializers.SerializerMethodField()
    lesson_count = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            "id",
            "title",
            "slug",
            "subject",
            "status",
            "cover_image_url",
            "unit_count",
            "lesson_count",
            "published_at",
            "created_at",
        ]

    def get_unit_count(self, obj):
        return getattr(obj, "unit_count_annotated", None) or obj.units.count()

    def get_lesson_count(self, obj):
        annotated = getattr(obj, "lesson_count_annotated", None)
        if annotated is not None:
            return annotated
        return Lesson.objects.filter(unit__course=obj).count()


class CourseDetailSerializer(serializers.ModelSerializer):
    units = UnitNodeSerializer(many=True, read_only=True)

    class Meta:
        model = Course
        fields = [
            "id",
            "title",
            "slug",
            "description",
            "subject",
            "status",
            "cover_image_url",
            "published_at",
            "units",
            "created_at",
            "updated_at",
        ]


class CourseWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ["title", "description", "subject", "cover_image_url"]


class ReorderSerializer(serializers.Serializer):
    order = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
