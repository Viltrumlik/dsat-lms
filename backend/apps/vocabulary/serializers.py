"""
DSAT LMS v2 — Vocabulary serializers
Domain: Vocabulary
Description: Student read shapes + admin write shapes.
Permissions: the admin shapes are only ever reached from IsAdmin views.
"""

from django.utils.text import slugify
from rest_framework import serializers

from .models import VocabSection, VocabSet, VocabStudySession, VocabWord, VocabWordProgress


class WordSerializer(serializers.ModelSerializer):
    """A card. `my_status` is the student's own standing on it, never anyone else's."""

    my_status = serializers.SerializerMethodField()

    class Meta:
        model = VocabWord
        fields = [
            "id",
            "word",
            "definition",
            "part_of_speech",
            "example",
            "synonyms",
            "sort_order",
            "my_status",
        ]

    def get_my_status(self, obj):
        statuses = self.context.get("statuses") or {}
        return statuses.get(obj.id, VocabWordProgress.Status.NEW)


class SetSerializer(serializers.ModelSerializer):
    """A deck in a list — counts only, for the section page."""

    word_count = serializers.IntegerField(read_only=True)
    mastered_count = serializers.IntegerField(read_only=True)
    is_completed = serializers.BooleanField(read_only=True)

    class Meta:
        model = VocabSet
        fields = ["id", "title", "sort_order", "word_count", "mastered_count", "is_completed"]


class SetDetailSerializer(SetSerializer):
    words = WordSerializer(many=True, read_only=True)
    section_title = serializers.CharField(source="section.title", read_only=True)

    class Meta(SetSerializer.Meta):
        fields = [*SetSerializer.Meta.fields, "section_title", "words"]


class SectionSerializer(serializers.ModelSerializer):
    set_count = serializers.IntegerField(read_only=True)
    word_count = serializers.IntegerField(read_only=True)
    mastered_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = VocabSection
        fields = [
            "id",
            "title",
            "slug",
            "description",
            "sort_order",
            "set_count",
            "word_count",
            "mastered_count",
        ]


class SectionDetailSerializer(SectionSerializer):
    sets = SetSerializer(many=True, read_only=True)

    class Meta(SectionSerializer.Meta):
        fields = [*SectionSerializer.Meta.fields, "sets"]


class StudySessionSerializer(serializers.ModelSerializer):
    accuracy_pct = serializers.FloatField(read_only=True)

    class Meta:
        model = VocabStudySession
        fields = [
            "id",
            "vocab_set",
            "correct_count",
            "total_count",
            "accuracy_pct",
            "completed_at",
            "created_at",
        ]


class ResultSerializer(serializers.Serializer):
    word = serializers.UUIDField()
    correct = serializers.BooleanField()


class ReportSerializer(serializers.Serializer):
    """A batch of verdicts. Capped so one request cannot be an import."""

    results = ResultSerializer(many=True, allow_empty=False, max_length=200)


# ─────────────────────────────────────
# Admin (content studio)
# ─────────────────────────────────────


class AdminSectionSerializer(serializers.ModelSerializer):
    set_count = serializers.IntegerField(read_only=True)
    word_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = VocabSection
        fields = [
            "id",
            "title",
            "slug",
            "description",
            "status",
            "sort_order",
            "set_count",
            "word_count",
            "created_at",
        ]
        extra_kwargs = {"slug": {"required": False}}

    def validate(self, attrs):
        # Authors title a list; nobody wants to invent a slug as well.
        if not attrs.get("slug") and attrs.get("title"):
            attrs["slug"] = _unique_slug(attrs["title"], instance=self.instance)
        return attrs


def _unique_slug(title, *, instance=None):
    base = slugify(title)[:200] or "section"
    candidate = base
    n = 2
    taken = VocabSection.all_objects.exclude(pk=getattr(instance, "pk", None))
    while taken.filter(slug=candidate).exists():
        candidate = f"{base}-{n}"
        n += 1
    return candidate


class AdminSetSerializer(serializers.ModelSerializer):
    word_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = VocabSet
        fields = ["id", "section", "title", "sort_order", "word_count", "created_at"]
        read_only_fields = ["section"]


class AdminWordSerializer(serializers.ModelSerializer):
    class Meta:
        model = VocabWord
        fields = [
            "id",
            "vocab_set",
            "word",
            "definition",
            "part_of_speech",
            "example",
            "synonyms",
            "sort_order",
        ]
        read_only_fields = ["vocab_set"]

    def validate_word(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("A word is required.")
        return value


class ImportSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=200_000)
