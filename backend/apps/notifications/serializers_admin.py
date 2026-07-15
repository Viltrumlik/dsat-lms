"""
DSAT LMS v2 — Announcement admin serializers (5.2c)
Domain: Notifications
"""

from rest_framework import serializers

from apps.identity.models import User

from .announcements import CHANNELS
from .models import Announcement, MessageTemplate


class AnnouncementSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    delivery_count = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            "id",
            "author_name",
            "title",
            "body",
            "audience_type",
            "audience_ref",
            "channels",
            "status",
            "sent_at",
            "delivery_count",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "author_name",
            "status",
            "sent_at",
            "delivery_count",
            "created_at",
        ]

    def get_author_name(self, obj):
        return obj.author.get_full_name() if obj.author_id else None

    def get_delivery_count(self, obj):
        annotated = getattr(obj, "delivery_count_annotated", None)
        if annotated is not None:
            return annotated
        return obj.deliveries.count()


class AnnouncementWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = ["title", "body", "audience_type", "audience_ref", "channels"]

    def validate_channels(self, value):
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError("Select at least one channel.")
        unknown = [c for c in value if c not in CHANNELS]
        if unknown:
            raise serializers.ValidationError(f"Unknown channel(s): {', '.join(unknown)}.")
        return value

    def validate(self, attrs):
        audience_type = attrs.get("audience_type", getattr(self.instance, "audience_type", None))
        audience_ref = attrs.get("audience_ref", getattr(self.instance, "audience_ref", ""))
        if audience_type == Announcement.Audience.ROLE and audience_ref not in User.Role.values:
            raise serializers.ValidationError({"audience_ref": "A valid role is required."})
        if audience_type == Announcement.Audience.CLASS and not audience_ref:
            raise serializers.ValidationError({"audience_ref": "A class is required."})
        return attrs


class MessageTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageTemplate
        fields = ["id", "name", "subject", "body", "created_at"]
        read_only_fields = ["id", "created_at"]
