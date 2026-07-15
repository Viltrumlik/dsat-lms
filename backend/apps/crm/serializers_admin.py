"""
DSAT LMS v2 — CRM admin serializers (tags)
Domain: CRM
"""

from rest_framework import serializers

from .tags import Tag


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name", "color", "created_at"]


class TagCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["name", "color"]


class AssignTagSerializer(serializers.Serializer):
    tag = serializers.UUIDField()
