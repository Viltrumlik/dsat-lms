"""
DSAT LMS v2 — Announcement admin views (5.2c)
Domain: Notifications
Description: Compose / manage / send broadcasts + manage reusable message
    templates. Mounted at /api/v1/admin/. Admin-only.
Permissions: IsAdmin.
"""

from django.db.models import Count
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from apps.audit.services import record_activity
from common.exceptions import ValidationError
from common.pagination import CursorPagination
from common.permissions import IsAdmin
from common.responses import created_response, no_content_response, success_response

from .announcements import send_announcement
from .models import Announcement, MessageTemplate
from .serializers_admin import (
    AnnouncementSerializer,
    AnnouncementWriteSerializer,
    MessageTemplateSerializer,
)


def _get_announcement(pk):
    obj = Announcement.objects.filter(pk=pk).first()
    if obj is None:
        raise NotFound("Announcement not found.")
    return obj


class AdminAnnouncementListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = Announcement.objects.annotate(delivery_count_annotated=Count("deliveries")).order_by(
            "-created_at"
        )
        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(AnnouncementSerializer(page, many=True).data)

    def post(self, request):
        serializer = AnnouncementWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        announcement = serializer.save(author=request.user)
        return created_response(AnnouncementSerializer(announcement).data)


class AdminAnnouncementDetailView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return success_response(AnnouncementSerializer(_get_announcement(pk)).data)

    def patch(self, request, pk):
        announcement = _get_announcement(pk)
        if announcement.status != Announcement.Status.DRAFT:
            return ValidationError("Only draft announcements can be edited.").to_response()
        serializer = AnnouncementWriteSerializer(announcement, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(AnnouncementSerializer(announcement).data)

    def delete(self, request, pk):
        _get_announcement(pk).soft_delete()
        return no_content_response()


class AdminAnnouncementSendView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        announcement = _get_announcement(pk)
        if announcement.status == Announcement.Status.SENT:
            return ValidationError("This announcement was already sent.").to_response()
        result = send_announcement(announcement)
        record_activity(
            actor=request.user,
            action="announcement.sent",
            target=announcement,
            summary=f"Sent “{announcement.title}” to {announcement.audience_type}",
            request=request,
            **result,
        )
        return success_response({**AnnouncementSerializer(announcement).data, **result})


class AdminMessageTemplateListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return success_response(
            MessageTemplateSerializer(MessageTemplate.objects.all(), many=True).data
        )

    def post(self, request):
        serializer = MessageTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return created_response(serializer.data)


class AdminMessageTemplateDetailView(APIView):
    permission_classes = [IsAdmin]

    def _get(self, pk):
        obj = MessageTemplate.objects.filter(pk=pk).first()
        if obj is None:
            raise NotFound("Template not found.")
        return obj

    def patch(self, request, pk):
        obj = self._get(pk)
        serializer = MessageTemplateSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(serializer.data)

    def delete(self, request, pk):
        self._get(pk).soft_delete()
        return no_content_response()
