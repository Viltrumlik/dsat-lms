"""
DSAT LMS v2 — CRM admin views (tags)
Domain: CRM; mounted at /api/v1/admin/. IsAdmin.
    Cross-entity tags: a shared vocabulary applied to students / leads via a
    GenericForeignKey. Assign/unassign resolve the entity by (type, uuid).
"""

from django.db import IntegrityError, transaction
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from common.exceptions import ValidationError
from common.permissions import IsAdmin
from common.responses import created_response, no_content_response, success_response

from . import services
from .serializers_admin import AssignTagSerializer, TagCreateSerializer, TagSerializer
from .tags import Tag, TaggedItem


class AdminTagListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return success_response(TagSerializer(Tag.objects.all(), many=True).data)

    def post(self, request):
        serializer = TagCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                tag = serializer.save()
        except IntegrityError:
            return ValidationError(
                "A tag with that name already exists.", field="name"
            ).to_response()
        return created_response(TagSerializer(tag).data)


class AdminTagDeleteView(APIView):
    permission_classes = [IsAdmin]

    def delete(self, request, pk):
        tag = Tag.objects.filter(pk=pk).first()
        if tag is None:
            raise NotFound("Tag not found.")
        # Soft-delete the tag AND its live links so nothing references a gone tag.
        for link in TaggedItem.objects.filter(tag=tag):
            link.soft_delete()
        tag.soft_delete()
        return no_content_response()


class EntityTagsView(APIView):
    """Tags on one entity — GET lists them, POST assigns one. entity_type ∈ {student, lead}."""

    permission_classes = [IsAdmin]

    def get(self, request, entity_type, entity_id):
        try:
            tags = services.tags_for(entity_type, entity_id)
        except services.EntityError:
            raise NotFound("Entity not found.") from None
        return success_response(TagSerializer(tags, many=True).data)

    def post(self, request, entity_type, entity_id):
        serializer = AssignTagSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tag = Tag.objects.filter(pk=serializer.validated_data["tag"]).first()
        if tag is None:
            return ValidationError("Tag not found.", field="tag").to_response()
        try:
            services.assign_tag(tag, entity_type, entity_id)
        except services.EntityError:
            raise NotFound("Entity not found.") from None
        return success_response(
            TagSerializer(services.tags_for(entity_type, entity_id), many=True).data
        )


class EntityTagDeleteView(APIView):
    permission_classes = [IsAdmin]

    def delete(self, request, entity_type, entity_id, tag_id):
        tag = Tag.objects.filter(pk=tag_id).first()
        if tag is None:
            raise NotFound("Tag not found.")
        try:
            services.unassign_tag(tag, entity_type, entity_id)
        except services.EntityError:
            raise NotFound("Entity not found.") from None
        return no_content_response()
