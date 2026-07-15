"""
DSAT LMS v2 — CRM serializers
Domain: CRM (front-office leads)
"""

from rest_framework import serializers

from apps.identity.models import User

from .models import FollowUpTask, Lead, LeadActivity

# Leads are owned and follow-ups assigned by front-office staff only (mirrors the
# IsFrontOffice gate) — not students/teachers/public.
_FRONT_OFFICE_ROLES = ("admin", "academic_manager", "receptionist")


def _front_office_users():
    return User.objects.filter(deleted_at__isnull=True, role__in=_FRONT_OFFICE_ROLES)


class _UserMiniSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "full_name"]


class LeadActivitySerializer(serializers.ModelSerializer):
    author = _UserMiniSerializer(read_only=True)

    class Meta:
        model = LeadActivity
        fields = ["id", "kind", "body", "author", "created_at"]


class LeadActivityCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeadActivity
        fields = ["kind", "body"]


class FollowUpTaskSerializer(serializers.ModelSerializer):
    assignee = _UserMiniSerializer(read_only=True)
    lead = serializers.UUIDField(source="lead_id", read_only=True)

    class Meta:
        model = FollowUpTask
        fields = ["id", "lead", "title", "due_at", "done", "done_at", "assignee", "created_at"]


class FollowUpTaskCreateSerializer(serializers.ModelSerializer):
    assignee = serializers.PrimaryKeyRelatedField(
        queryset=_front_office_users(), required=False, allow_null=True
    )

    class Meta:
        model = FollowUpTask
        fields = ["title", "due_at", "assignee"]


class FollowUpTaskUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FollowUpTask
        fields = ["title", "due_at", "done"]


class LeadListSerializer(serializers.ModelSerializer):
    owner = _UserMiniSerializer(read_only=True)
    open_tasks = serializers.SerializerMethodField()

    class Meta:
        model = Lead
        fields = [
            "id",
            "name",
            "email",
            "phone",
            "stage",
            "source",
            "subject_interest",
            "owner",
            "converted_user",
            "converted_at",
            "open_tasks",
            "created_at",
        ]

    def get_open_tasks(self, obj):
        annotated = getattr(obj, "open_tasks_annotated", None)
        if annotated is not None:
            return annotated
        return obj.follow_ups.filter(done=False).count()


class LeadDetailSerializer(serializers.ModelSerializer):
    owner = _UserMiniSerializer(read_only=True)
    converted_user = _UserMiniSerializer(read_only=True)
    activities = LeadActivitySerializer(many=True, read_only=True)
    follow_ups = FollowUpTaskSerializer(many=True, read_only=True)

    class Meta:
        model = Lead
        fields = [
            "id",
            "name",
            "email",
            "phone",
            "stage",
            "source",
            "subject_interest",
            "note",
            "owner",
            "converted_user",
            "converted_at",
            "activities",
            "follow_ups",
            "created_at",
            "updated_at",
        ]


class LeadWriteSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(
        queryset=_front_office_users(), required=False, allow_null=True
    )

    class Meta:
        model = Lead
        fields = [
            "name",
            "email",
            "phone",
            "stage",
            "source",
            "subject_interest",
            "note",
            "owner",
        ]
