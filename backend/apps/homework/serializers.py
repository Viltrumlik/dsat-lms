"""
DSAT LMS v2 — Homework Serializers
Domain: Homework
"""

from rest_framework import serializers

from apps.academy.serializers import StudentMiniSerializer

from .models import (
    Homework,
    HomeworkEvent,
    HomeworkSubmission,
)


class AttachmentRefSerializer(serializers.Serializer):
    """Enough to render a file row and hit /files/{id}/download/."""

    id = serializers.UUIDField(source="attachment.id")
    original_name = serializers.CharField(source="attachment.original_name")
    content_type = serializers.CharField(source="attachment.content_type")
    size = serializers.IntegerField(source="attachment.size")


class SubmissionFileSerializer(AttachmentRefSerializer):
    attempt_number = serializers.IntegerField()


class HomeworkEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True, default=None)

    class Meta:
        model = HomeworkEvent
        fields = ["id", "kind", "actor_name", "note", "attempt_number", "created_at"]


class MySubmissionSerializer(serializers.ModelSerializer):
    """The requesting student's own submission, embedded in homework payloads.

    Carries the teacher's feedback and the file list because the student's
    homework page is where a returned piece has to explain itself.
    """

    files = SubmissionFileSerializer(many=True, read_only=True)
    events = HomeworkEventSerializer(many=True, read_only=True)

    class Meta:
        model = HomeworkSubmission
        fields = [
            "id",
            "status",
            "submitted_at",
            "response_text",
            "is_late",
            "attempt_number",
            "returned_at",
            "grade",
            "grade_scale",
            "feedback",
            "graded_at",
            "files",
            "events",
        ]


class HomeworkAttachmentSerializer(AttachmentRefSerializer):
    """A file on the brief itself."""


class HomeworkSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source="assigned_class.name", read_only=True)
    exam_title = serializers.CharField(source="exam.title", read_only=True, default=None)
    my_submission = serializers.SerializerMethodField()
    attachments = HomeworkAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Homework
        fields = [
            "id",
            "title",
            "description",
            "assigned_class",
            "class_name",
            "exam",
            "exam_title",
            "due_at",
            "is_published",
            "attachments",
            "my_submission",
            "created_at",
        ]

    def get_my_submission(self, obj):
        # Populated only on student querysets via Prefetch(to_attr="my_submissions");
        # teachers/admins (and fresh create responses) get null.
        submissions = getattr(obj, "my_submissions", None)
        if not submissions:
            return None
        return MySubmissionSerializer(submissions[0]).data


class HomeworkCreateSerializer(serializers.ModelSerializer):
    """Create a brief. `attachment_ids` are linked after save (see the view)."""

    attachment_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, write_only=True
    )

    class Meta:
        model = Homework
        fields = ["title", "description", "assigned_class", "exam", "due_at", "attachment_ids"]

    def create(self, validated_data):
        validated_data.pop("attachment_ids", None)
        return super().create(validated_data)


class HomeworkSubmissionSerializer(serializers.ModelSerializer):
    """The teacher's view of one student's work."""

    student = StudentMiniSerializer(read_only=True)
    files = SubmissionFileSerializer(many=True, read_only=True)

    class Meta:
        model = HomeworkSubmission
        fields = [
            "id",
            "student",
            "status",
            "submitted_at",
            "response_text",
            "is_late",
            "attempt_number",
            "returned_at",
            "grade",
            "grade_scale",
            "feedback",
            "graded_at",
            "files",
            "created_at",
        ]


class SubmitSerializer(serializers.Serializer):
    response_text = serializers.CharField(required=False, allow_blank=True, default="")
    attachment_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )


class GradeSerializer(serializers.Serializer):
    grade = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    grade_scale = serializers.IntegerField(required=False, min_value=1)
    feedback = serializers.CharField(required=False, allow_blank=True, default="")


class ReturnSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, default="")
