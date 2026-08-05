"""
DSAT LMS v2 — Classroom stream serializers
Domain: Academy
"""

from rest_framework import serializers

from .models import ClassComment, ClassPost


class StreamAuthorSerializer(serializers.Serializer):
    """Who wrote it, and in what capacity — a student reply reads differently
    from a teacher's, and the stream shows that."""

    id = serializers.UUIDField()
    full_name = serializers.SerializerMethodField()
    role = serializers.CharField()

    def get_full_name(self, obj):
        return obj.get_full_name()


class StreamAttachmentSerializer(serializers.Serializer):
    id = serializers.UUIDField(source="attachment.id")
    original_name = serializers.CharField(source="attachment.original_name")
    content_type = serializers.CharField(source="attachment.content_type")
    size = serializers.IntegerField(source="attachment.size")


class ClassCommentSerializer(serializers.ModelSerializer):
    author = StreamAuthorSerializer(read_only=True)

    class Meta:
        model = ClassComment
        fields = ["id", "author", "body", "created_at"]


class ClassPostSerializer(serializers.ModelSerializer):
    author = StreamAuthorSerializer(read_only=True)
    attachments = StreamAttachmentSerializer(many=True, read_only=True)
    comments = serializers.SerializerMethodField()

    class Meta:
        model = ClassPost
        fields = [
            "id",
            "kind",
            "author",
            "body",
            "is_pinned",
            "allow_comments",
            "attachments",
            "comments",
            "created_at",
        ]

    def get_comments(self, obj):
        # Soft-deleted replies stop rendering. Filtered in Python because the
        # view prefetches `comments`, and re-filtering in the DB would discard
        # that and reintroduce an N+1 across the page.
        live = [c for c in obj.comments.all() if c.deleted_at is None]
        return ClassCommentSerializer(live, many=True).data


class ClassPostWriteSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=ClassPost.Kind.choices, default=ClassPost.Kind.POST)
    body = serializers.CharField(max_length=10_000)
    is_pinned = serializers.BooleanField(default=False)
    allow_comments = serializers.BooleanField(default=True)
    attachment_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )


class ClassCommentWriteSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=5_000)
