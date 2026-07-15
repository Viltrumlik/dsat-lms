"""
DSAT LMS v2 — Admin students directory serializers (5.5c)
Domain: CRM (admin Student-360 list)
"""

from rest_framework import serializers

from .models import SavedFilter


class SavedFilterSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedFilter
        fields = ["id", "kind", "name", "params", "created_at"]


class SavedFilterWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedFilter
        fields = ["kind", "name", "params"]


class BulkStudentSerializer(serializers.Serializer):
    student_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
    action = serializers.ChoiceField(choices=["tag", "untag", "status"])
    tag = serializers.UUIDField(required=False)
    status = serializers.CharField(required=False)
