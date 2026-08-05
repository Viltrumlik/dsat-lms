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


class MyAttemptMixin(serializers.Serializer):
    """The requester's last answer to this question, or null if they never gave one.

    Reads the `my_*` annotations from practice.attempt_annotations, so a view
    that forgets to annotate simply reports "never attempted" rather than
    querying per row.

    WITHHELD for a question the requester currently has open in a paper: telling
    a student mid-exam that their last attempt at this very question was correct,
    and what they put, is the answer key by another name. Same lock as the study
    view (question_bank.views._locked_question_ids), because it is the same leak.
    """

    my_attempt = serializers.SerializerMethodField()

    def get_my_attempt(self, obj):
        if obj.id in self.context.get("locked_ids", ()):
            return None
        chosen = getattr(obj, "my_chosen_answer", None)
        if not chosen:
            return None
        return {
            "chosen_answer": chosen,
            "is_correct": getattr(obj, "my_is_correct", None),
            "answered_at": getattr(obj, "my_answered_at", None),
        }


class QuestionListSerializer(MyAttemptMixin, serializers.ModelSerializer):
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
            "my_attempt",
            "created_at",
        ]


class QuestionDetailSerializer(MyAttemptMixin, serializers.ModelSerializer):
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
            "my_attempt",
            "created_at",
        ]
