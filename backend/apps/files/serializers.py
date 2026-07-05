"""
DSAT LMS v2 — Files serializers
Domain: Files
Description: Read representation of an Attachment. Uploads come in as multipart
    (request.FILES), validated in services.create_attachment — not here.
"""

from rest_framework import serializers

from .models import Attachment
from .services import attachment_download_url


class AttachmentSerializer(serializers.ModelSerializer):
    owner_id = serializers.UUIDField(source="owner.id", read_only=True)
    uploaded_by_id = serializers.UUIDField(source="uploaded_by.id", read_only=True)
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = [
            "id",
            "kind",
            "original_name",
            "content_type",
            "size",
            "owner_id",
            "uploaded_by_id",
            "download_url",
            "created_at",
        ]
        read_only_fields = fields

    def get_download_url(self, obj):
        return attachment_download_url(obj)
