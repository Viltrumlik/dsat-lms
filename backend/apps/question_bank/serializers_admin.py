# apps/question_bank/serializers_admin.py
# Domain: Question Bank
# Description: Admin content-studio serializers — question authoring (write, with
#             inline choices + validation), full admin read shape, review history,
#             and category/tag management. Admin-only (see views_admin.py).
# Permissions: consumed only by IsAdmin views.

from rest_framework import serializers

from apps.identity.models import User

from .models import Question, QuestionCategory, QuestionChoice, QuestionReview, QuestionTag
from .serializers import CategoryMiniSerializer, ChoiceSerializer, TagSerializer


class AuthorSerializer(serializers.ModelSerializer):
    """Compact user shape for created_by / reviewed_by / reviewer."""

    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "full_name", "email"]


class AdminChoiceWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionChoice
        fields = ["label", "text", "image_url", "sort_order"]
        extra_kwargs = {"image_url": {"required": False}, "sort_order": {"required": False}}


class AdminQuestionListSerializer(serializers.ModelSerializer):
    """Lightweight admin list row — all statuses."""

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
            "status",
            "stem",
            "tags",
            "created_at",
            "updated_at",
        ]


class AdminQuestionDetailSerializer(serializers.ModelSerializer):
    """Full admin read shape — everything the editor + review queue need."""

    category = CategoryMiniSerializer(read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    choices = ChoiceSerializer(many=True, read_only=True)
    created_by = AuthorSerializer(read_only=True)
    reviewed_by = AuthorSerializer(read_only=True)

    class Meta:
        model = Question
        fields = [
            "id",
            "module",
            "category",
            "difficulty",
            "status",
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
            "created_by",
            "reviewed_by",
            "published_at",
            "created_at",
            "updated_at",
        ]


class AdminQuestionWriteSerializer(serializers.ModelSerializer):
    """Create / update a DRAFT question with inline choices. Status is driven by the
    lifecycle endpoints, not written here."""

    choices = AdminChoiceWriteSerializer(many=True, required=False)
    category = serializers.PrimaryKeyRelatedField(queryset=QuestionCategory.objects.all())
    tags = serializers.PrimaryKeyRelatedField(
        many=True, queryset=QuestionTag.objects.all(), required=False
    )

    class Meta:
        model = Question
        fields = [
            "module",
            "category",
            "difficulty",
            "answer_type",
            "has_math",
            "stem",
            "stem_image_url",
            "passage",
            "passage_image_url",
            "correct_answer",
            "explanation",
            "explanation_image_url",
            "source",
            "source_ref",
            "tags",
            "choices",
        ]

    def validate(self, attrs):
        # On partial update, fall back to the instance for omitted fields.
        answer_type = attrs.get("answer_type") or getattr(self.instance, "answer_type", None)
        choices = attrs.get("choices")
        correct = attrs.get("correct_answer") or getattr(self.instance, "correct_answer", None)

        if answer_type == Question.AnswerType.MCQ:
            if choices is None and self.instance is None:
                raise serializers.ValidationError({"choices": "MCQ questions require choices."})
            if choices is not None:
                labels = [c["label"] for c in choices]
                if len(labels) < 2:
                    raise serializers.ValidationError({"choices": "Provide at least two choices."})
                if len(set(labels)) != len(labels):
                    raise serializers.ValidationError({"choices": "Choice labels must be unique."})
                if any(lab not in ("A", "B", "C", "D") for lab in labels):
                    raise serializers.ValidationError({"choices": "Labels must be A–D."})
                if correct not in labels:
                    raise serializers.ValidationError(
                        {"correct_answer": "Correct answer must match a choice label."}
                    )
        elif answer_type == Question.AnswerType.GRID_IN:
            if choices:
                raise serializers.ValidationError({"choices": "Grid-in questions have no choices."})
            if not correct:
                raise serializers.ValidationError(
                    {"correct_answer": "Grid-in questions require a correct answer."}
                )
        return attrs

    def create(self, validated_data):
        choices = validated_data.pop("choices", [])
        tags = validated_data.pop("tags", None)
        request = self.context["request"]
        question = Question.objects.create(
            created_by=request.user, status=Question.Status.DRAFT, **validated_data
        )
        if tags is not None:
            question.tags.set(tags)
        for choice in choices:
            QuestionChoice.objects.create(question=question, **choice)
        return question

    def update(self, instance, validated_data):
        choices = validated_data.pop("choices", None)
        tags = validated_data.pop("tags", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if tags is not None:
            instance.tags.set(tags)
        if choices is not None:
            instance.choices.all().delete()
            for choice in choices:
                QuestionChoice.objects.create(question=instance, **choice)
        return instance


class QuestionReviewSerializer(serializers.ModelSerializer):
    reviewer = AuthorSerializer(read_only=True)

    class Meta:
        model = QuestionReview
        fields = ["id", "reviewer", "status", "note", "created_at"]


class RejectSerializer(serializers.Serializer):
    note = serializers.CharField()


class AdminCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionCategory
        fields = ["id", "module", "name", "slug", "parent", "sort_order", "created_at"]


class AdminTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionTag
        fields = ["id", "name", "slug", "color", "created_at"]
