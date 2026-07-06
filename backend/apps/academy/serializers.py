"""
DSAT LMS v2 — Academy Serializers
Domain: Academy
"""

from rest_framework import serializers

from apps.identity.models import User

from .models import (
    Class,
    ClassEnrollment,
    Guardian,
    MentorCheckIn,
    ParentContactLog,
    StudentProfile,
)


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
    mentor = StudentMiniSerializer(read_only=True)

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
            "mentor",
            "mentor_assigned_at",
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
            "mentor",
            "mentor_assigned_at",
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


# ─────────────────────────────────────
# Academic mentor (S6)
# ─────────────────────────────────────


class MentorCheckInSerializer(serializers.ModelSerializer):
    mentor = StudentMiniSerializer(read_only=True)

    class Meta:
        model = MentorCheckIn
        fields = ["id", "mentor", "note", "created_at"]


class ParentContactLogSerializer(serializers.ModelSerializer):
    author = StudentMiniSerializer(read_only=True)
    guardian_name = serializers.CharField(source="guardian.name", read_only=True)

    class Meta:
        model = ParentContactLog
        fields = ["id", "guardian", "guardian_name", "author", "method", "note", "created_at"]
        read_only_fields = ["id", "guardian_name", "author", "created_at"]


class MenteeSerializer(serializers.ModelSerializer):
    """A mentor's mentee row — the student + lifecycle status + last check-in."""

    student = StudentMiniSerializer(source="user", read_only=True)
    last_check_in_at = serializers.SerializerMethodField()

    class Meta:
        model = StudentProfile
        fields = ["id", "student", "status", "mentor_assigned_at", "last_check_in_at"]

    def get_last_check_in_at(self, obj):
        annotated = getattr(obj, "last_check_in_annotated", "__unset__")
        if annotated != "__unset__":
            return annotated
        latest = obj.mentor_checkins.order_by("-created_at").first()
        return latest.created_at if latest else None


class AssignMentorSerializer(serializers.Serializer):
    mentor = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(deleted_at__isnull=True), required=False, allow_null=True
    )


class CheckInCreateSerializer(serializers.Serializer):
    note = serializers.CharField()


class ParentContactCreateSerializer(serializers.Serializer):
    guardian = serializers.UUIDField()
    method = serializers.ChoiceField(
        choices=ParentContactLog.Method.choices,
        required=False,
        default=ParentContactLog.Method.CALL,
    )
    note = serializers.CharField(required=False, allow_blank=True, default="")
