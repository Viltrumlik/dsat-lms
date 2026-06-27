"""
DSAT LMS v2 — Notifications URLs
Domain: Notifications
Description: Notification endpoints (mounted at /api/v1/notifications/).
"""

from django.urls import path

from .views import MarkAllReadView, MarkReadView, NotificationListView, UnreadCountView

app_name = "notifications"

urlpatterns = [
    path("", NotificationListView.as_view(), name="notification-list"),
    path("unread-count/", UnreadCountView.as_view(), name="notification-unread-count"),
    path("read-all/", MarkAllReadView.as_view(), name="notification-read-all"),
    path("<uuid:pk>/read/", MarkReadView.as_view(), name="notification-read"),
]
