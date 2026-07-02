"""
DSAT LMS v2 — Homework Serializers
Domain: Homework
"""

from rest_framework import serializers

from apps.academy.serializers import StudentMiniSerializer

from .models import Homework, HomeworkSubmission


class MySubmissionSerializer(serializers.ModelSerializer):
    """The requesting student's own submission, embedded in homework payloads."""

    class Meta:
        model = HomeworkSubmission
        fields = ["status", "submitted_at"]


class HomeworkSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source="assigned_class.name", read_only=True)
    exam_title = serializers.CharField(source="exam.title", read_only=True, default=None)
    my_submission = serializers.SerializerMethodField()

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
    class Meta:
        model = Homework
        fields = ["title", "description", "assigned_class", "exam", "due_at"]


class HomeworkSubmissionSerializer(serializers.ModelSerializer):
    student = StudentMiniSerializer(read_only=True)

    class Meta:
        model = HomeworkSubmission
        fields = ["id", "student", "status", "submitted_at", "created_at"]
