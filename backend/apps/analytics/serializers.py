"""
DSAT LMS v2 — Analytics Serializers
Domain: Analytics
"""

from rest_framework import serializers

from .models import UserCategoryStat


class CategoryStatSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    module = serializers.CharField(source="category.module", read_only=True)

    class Meta:
        model = UserCategoryStat
        fields = [
            "category",
            "category_name",
            "module",
            "total_answered",
            "total_correct",
            "accuracy_pct",
            "last_practiced_at",
        ]
