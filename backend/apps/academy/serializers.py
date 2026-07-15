"""
DSAT LMS v2 — Academy Serializers
Domain: Academy
"""

from decimal import Decimal

from rest_framework import serializers

from apps.identity.models import User

from .models import (
    Attendance,
    Class,
    ClassEnrollment,
    ClassScheduleRule,
    ClassSession,
    Guardian,
    MentorCheckIn,
    ParentContactLog,
    StudentNote,
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


class MenteeDetailSerializer(serializers.ModelSerializer):
    """A mentee's detail header for the mentor's drilldown — student + status +
    guardians (so the parent-contact form has its recipient list) — WITHOUT the
    class-scoped demographics of the full profile endpoint."""

    student = StudentMiniSerializer(source="user", read_only=True)
    guardians = GuardianSerializer(many=True, read_only=True)

    class Meta:
        model = StudentProfile
        fields = ["id", "student", "status", "mentor_assigned_at", "guardians"]


class AssignMentorSerializer(serializers.Serializer):
    """Assign by `email` (friendly, mirrors enroll-by-email) or by `mentor` id;
    omit both / mentor=null to unassign."""

    mentor = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(deleted_at__isnull=True), required=False, allow_null=True
    )
    email = serializers.EmailField(required=False, allow_blank=True)


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


# ─────────────────────────────────────
# Attendance (5.2a)
# ─────────────────────────────────────


class ClassSessionSerializer(serializers.ModelSerializer):
    klass_name = serializers.CharField(source="klass.name", read_only=True)
    marked_count = serializers.SerializerMethodField()

    class Meta:
        model = ClassSession
        fields = [
            "id",
            "klass",
            "klass_name",
            "title",
            "starts_at",
            "ends_at",
            "location",
            "status",
            "marked_count",
            "created_at",
        ]
        read_only_fields = ["id", "klass_name", "marked_count", "created_at"]

    def get_marked_count(self, obj):
        annotated = getattr(obj, "marked_count_annotated", None)
        if annotated is not None:
            return annotated
        return obj.attendances.count()


class ClassSessionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassSession
        fields = ["klass", "title", "starts_at", "ends_at", "location"]


class ClassSessionUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassSession
        fields = ["title", "starts_at", "ends_at", "location", "status"]


class AttendanceRowSerializer(serializers.Serializer):
    """One roster row: the student + their current mark (null = unmarked)."""

    student = StudentMiniSerializer(read_only=True)
    status = serializers.CharField(allow_null=True)
    note = serializers.CharField(allow_blank=True)


class AttendanceMarkSerializer(serializers.Serializer):
    """Bulk-mark payload: a list of {student, status, note?}."""

    class _Mark(serializers.Serializer):
        student = serializers.UUIDField()
        status = serializers.ChoiceField(choices=Attendance.Status.choices)
        note = serializers.CharField(required=False, allow_blank=True, default="")

    marks = _Mark(many=True)


class ClassScheduleRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassScheduleRule
        fields = [
            "id",
            "klass",
            "weekday",
            "start_time",
            "end_time",
            "title",
            "location",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "klass", "created_at"]


class ClassScheduleRuleWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassScheduleRule
        fields = ["weekday", "start_time", "end_time", "title", "location", "is_active"]

    def validate_weekday(self, value):
        if not 0 <= value <= 6:
            raise serializers.ValidationError("weekday must be 0–6 (0=Mon … 6=Sun).")
        return value


class StudentNoteSerializer(serializers.ModelSerializer):
    author = StudentMiniSerializer(read_only=True)

    class Meta:
        model = StudentNote
        fields = ["id", "body", "pinned", "author", "created_at", "updated_at"]


class StudentNoteWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentNote
        fields = ["body", "pinned"]


class GradeWriteSerializer(serializers.Serializer):
    """Set/clear a submission's manual grade + feedback."""

    grade = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True
    )
    grade_scale = serializers.IntegerField(min_value=1, required=False)
    feedback = serializers.CharField(required=False, allow_blank=True)


class BulkGradeSerializer(serializers.Serializer):
    """Bulk-grade payload: a list of {submission, grade?, feedback?}."""

    class _Row(serializers.Serializer):
        submission = serializers.UUIDField()
        grade = serializers.DecimalField(
            max_digits=5, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True
        )
        # No default: an omitted feedback must be SKIPPED, not overwrite a stored
        # comment with "" (a default would always land in validated_data).
        feedback = serializers.CharField(required=False, allow_blank=True)

    grades = _Row(many=True)
