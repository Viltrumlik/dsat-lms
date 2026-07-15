"""
DSAT LMS v2 — Audit admin serializers
Domain: Audit
"""

from rest_framework import serializers

from .models import ActivityLog


class ActivityLogSerializer(serializers.ModelSerializer):
    """Read representation for the admin audit viewer + dashboard feed."""

    actor_email = serializers.SerializerMethodField()
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = ActivityLog
        fields = [
            "id",
            "actor",
            "actor_email",
            "actor_name",
            "actor_role",
            "action",
            "target_type",
            "target_id",
            "target_label",
            "summary",
            "metadata",
            "ip",
            "created_at",
        ]
        read_only_fields = fields

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor_id else None

    def get_actor_name(self, obj):
        return obj.actor.get_full_name() if obj.actor_id else None
