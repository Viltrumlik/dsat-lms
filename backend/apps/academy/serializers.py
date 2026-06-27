"""
DSAT LMS v2 — Academy Serializers
Domain: Academy
"""

from rest_framework import serializers

from apps.identity.models import User

from .models import Class, ClassEnrollment


class ClassSerializer(serializers.ModelSerializer):
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = Class
        fields = ["id", "name", "is_active", "student_count", "created_at"]

    def get_student_count(self, obj):
        # Prefer an annotated count (list view) to avoid an extra query.
        annotated = getattr(obj, "active_count", None)
        if annotated is not None:
            return annotated
        return obj.enrollments.filter(status=ClassEnrollment.Status.ACTIVE).count()


class ClassCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Class
        fields = ["name"]


class StudentMiniSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "full_name"]


class RosterEntrySerializer(serializers.ModelSerializer):
    student = StudentMiniSerializer(read_only=True)

    class Meta:
        model = ClassEnrollment
        fields = ["id", "student", "status", "created_at"]


class EnrollSerializer(serializers.Serializer):
    email = serializers.EmailField()
