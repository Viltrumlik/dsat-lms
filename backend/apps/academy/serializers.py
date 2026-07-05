"""
DSAT LMS v2 — Academy Serializers
Domain: Academy
"""

from rest_framework import serializers

from apps.identity.models import User

from .models import Class, ClassEnrollment, Guardian, StudentProfile


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


class GuardianSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guardian
        fields = [
            "id",
            "relation",
            "name",
            "phone",
            "telegram",
            "email",
            "is_emergency",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class StudentProfileSerializer(serializers.ModelSerializer):
    """Read: demographics + lifecycle status + the linked user's basics + guardians.
    The profile photo is the user's avatar_url (managed by the files pipeline)."""

    student = StudentMiniSerializer(source="user", read_only=True)
    avatar_url = serializers.CharField(source="user.avatar_url", read_only=True)
    status_changed_by = StudentMiniSerializer(read_only=True)
    guardians = GuardianSerializer(many=True, read_only=True)

    class Meta:
        model = StudentProfile
        fields = [
            "id",
            "student",
            "avatar_url",
            "gender",
            "date_of_birth",
            "phone",
            "address",
            "school",
            "grade",
            "status",
            "status_changed_at",
            "status_changed_by",
            "enrolled_at",
            "guardians",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "student",
            "avatar_url",
            "status",
            "status_changed_at",
            "status_changed_by",
            "enrolled_at",
            "guardians",
            "updated_at",
        ]


class StudentProfileUpdateSerializer(serializers.ModelSerializer):
    """Write: demographics only. Lifecycle status has its own guarded endpoint."""

    class Meta:
        model = StudentProfile
        fields = ["gender", "date_of_birth", "phone", "address", "school", "grade"]


class StatusChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=StudentProfile.LifecycleStatus.choices)
