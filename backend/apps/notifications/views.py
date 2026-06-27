"""
DSAT LMS v2 — Notification Views
Domain: Notifications
Description: List (cursor-paginated, ?unread=1 filter), unread count, mark one /
            mark all read. All owner-scoped.
Permissions: IsAuthenticated (global).
"""

from django.utils import timezone
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from common.pagination import CursorPagination
from common.responses import success_response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(APIView):
    def get(self, request):
        queryset = Notification.objects.filter(user=request.user)
        if request.query_params.get("unread") in ("1", "true", "True"):
            queryset = queryset.filter(is_read=False)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(NotificationSerializer(page, many=True).data)


class UnreadCountView(APIView):
    def get(self, request):
        count = Notification.objects.filter(user=request.user, is_read=False).count()
        return success_response({"unread": count})


class MarkReadView(APIView):
    def post(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk, user=request.user)
        except Notification.DoesNotExist:
            raise NotFound("Notification not found.") from None
        notification.mark_read()
        return success_response(NotificationSerializer(notification).data)


class MarkAllReadView(APIView):
    def post(self, request):
        updated = Notification.objects.filter(user=request.user, is_read=False).update(
            is_read=True, read_at=timezone.now()
        )
        return success_response({"marked_read": updated})
