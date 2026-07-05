"""
DSAT LMS v2 — Support serializers (S1 booking)
Domain: Support
Description: Availability, slots, bookings, outcomes, ratings. The staff-only
    `notes` on SessionOutcome is enforced structurally: student reads use
    StudentOutcomeSerializer (no `notes`), staff reads use StaffOutcomeSerializer.
"""

from rest_framework import serializers

from apps.identity.models import User

from .enums import Subject
from .models import SessionOutcome, SessionRating, SupportBooking, TeacherAvailability


class UserMiniSerializer(serializers.ModelSerializer):
    """Compact identity for a teacher or student in booking payloads."""

    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "full_name"]


class TeacherAvailabilitySerializer(serializers.ModelSerializer):
    """A teacher's own weekly window. `teacher` is set from request.user, never
    from the body."""

    class Meta:
        model = TeacherAvailability
        fields = [
            "id",
            "subject",
            "weekday",
            "start_time",
            "end_time",
            "slot_minutes",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate_weekday(self, value):
        if not 0 <= value <= 6:
            raise serializers.ValidationError("weekday must be 0 (Mon) … 6 (Sun).")
        return value

    def validate_slot_minutes(self, value):
        if value <= 0:
            raise serializers.ValidationError("slot_minutes must be positive.")
        return value

    def validate(self, attrs):
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"end_time": "end_time must be after start_time."})
        return attrs


class SlotSerializer(serializers.Serializer):
    """A single materialized bookable slot (output of generate_slots)."""

    scheduled_at = serializers.DateTimeField()
    duration_minutes = serializers.IntegerField()


class StudentOutcomeSerializer(serializers.ModelSerializer):
    """Student-facing outcome — deliberately omits staff-only `notes`."""

    class Meta:
        model = SessionOutcome
        fields = ["topics_covered", "homework", "next_recommendation"]


class StaffOutcomeSerializer(serializers.ModelSerializer):
    """Staff-facing outcome — includes `notes`."""

    class Meta:
        model = SessionOutcome
        fields = ["topics_covered", "homework", "next_recommendation", "notes"]


class OutcomeWriteSerializer(serializers.ModelSerializer):
    """Teacher writes/updates the outcome after a session (includes `notes`)."""

    class Meta:
        model = SessionOutcome
        fields = ["topics_covered", "homework", "next_recommendation", "notes"]


class SessionRatingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SessionRating
        fields = ["score", "comment", "created_at"]
        read_only_fields = ["created_at"]

    def validate_score(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError("score must be between 1 and 5.")
        return value


class SupportBookingSerializer(serializers.ModelSerializer):
    """Student-facing booking. Nested outcome omits staff notes."""

    student = UserMiniSerializer(read_only=True)
    teacher = UserMiniSerializer(read_only=True)
    outcome = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()

    outcome_serializer_class = StudentOutcomeSerializer

    class Meta:
        model = SupportBooking
        fields = [
            "id",
            "student",
            "teacher",
            "subject",
            "topic",
            "reason",
            "scheduled_at",
            "duration_minutes",
            "actual_duration_minutes",
            "status",
            "confirmed_at",
            "completed_at",
            "cancelled_at",
            "join_url",
            "outcome",
            "rating",
            "created_at",
        ]

    def get_outcome(self, obj):
        try:
            outcome = obj.outcome
        except SessionOutcome.DoesNotExist:
            return None
        return self.outcome_serializer_class(outcome).data

    def get_rating(self, obj):
        try:
            rating = obj.rating
        except SessionRating.DoesNotExist:
            return None
        return SessionRatingSerializer(rating).data


class StaffBookingSerializer(SupportBookingSerializer):
    """Staff-facing booking. Nested outcome includes staff notes."""

    outcome_serializer_class = StaffOutcomeSerializer


class SupportBookingCreateSerializer(serializers.Serializer):
    """Student booking request. Slot legality is enforced server-side by
    create_booking against generate_slots, not here."""

    teacher = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role=User.Role.TEACHER, deleted_at__isnull=True)
    )
    subject = serializers.ChoiceField(choices=Subject.choices)
    scheduled_at = serializers.DateTimeField()
    topic = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class BookingStatusChangeSerializer(serializers.Serializer):
    """Staff action on a booking. `actual_duration_minutes` is applied only when
    completing."""

    status = serializers.ChoiceField(choices=["confirmed", "completed", "cancelled", "no_show"])
    actual_duration_minutes = serializers.IntegerField(required=False, min_value=1, max_value=600)
