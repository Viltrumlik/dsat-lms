"""
DSAT LMS v2 — Question Bank Serializers
Domain: Question Bank
Description: Public read serializers for browsing the question bank.
Permissions: read-only; only PUBLISHED questions are ever exposed (enforced in views).
"""

from rest_framework import serializers

from .models import Question, QuestionCategory, QuestionChoice, QuestionTag


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionCategory
        fields = ["id", "module", "name", "slug", "parent", "sort_order"]


class CategoryMiniSerializer(serializers.ModelSerializer):
    """Compact category shape nested inside questions."""

    class Meta:
        model = QuestionCategory
        fields = ["id", "name", "module"]


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionTag
        fields = ["id", "name", "slug", "color"]


class ChoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionChoice
        fields = ["label", "text", "image_url", "sort_order"]


class QuestionListSerializer(serializers.ModelSerializer):
    """Lightweight shape for list/scan — no choices, answer, or explanation."""

    category = CategoryMiniSerializer(read_only=True)
    tags = serializers.SlugRelatedField(many=True, read_only=True, slug_field="slug")

    class Meta:
        model = Question
        fields = [
            "id",
            "module",
            "category",
            "difficulty",
            "answer_type",
            "has_math",
            "stem",
            "tags",
            "version",
            "created_at",
        ]


class QuestionDetailSerializer(serializers.ModelSerializer):
    """Full study shape — includes choices, correct answer, and explanation."""

    category = CategoryMiniSerializer(read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    choices = ChoiceSerializer(many=True, read_only=True)

    class Meta:
        model = Question
        fields = [
            "id",
            "module",
            "category",
            "difficulty",
            "answer_type",
            "has_math",
            "stem",
            "stem_image_url",
            "passage",
            "passage_image_url",
            "choices",
            "correct_answer",
            "explanation",
            "explanation_image_url",
            "source",
            "source_ref",
            "tags",
            "version",
            "created_at",
        ]
