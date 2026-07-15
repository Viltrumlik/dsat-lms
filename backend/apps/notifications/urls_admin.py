"""
DSAT LMS v2 — Announcement admin URLs (5.2c)
Domain: Notifications
Description: Mounted at /api/v1/admin/ (alongside identity/question_bank/…).
"""

from django.urls import path

from .views_admin import (
    AdminAnnouncementDetailView,
    AdminAnnouncementListCreateView,
    AdminAnnouncementSendView,
    AdminMessageTemplateDetailView,
    AdminMessageTemplateListCreateView,
)

app_name = "notifications_admin"

urlpatterns = [
    path("announcements/", AdminAnnouncementListCreateView.as_view(), name="announcement-list"),
    path(
        "announcements/<uuid:pk>/",
        AdminAnnouncementDetailView.as_view(),
        name="announcement-detail",
    ),
    path(
        "announcements/<uuid:pk>/send/",
        AdminAnnouncementSendView.as_view(),
        name="announcement-send",
    ),
    path("message-templates/", AdminMessageTemplateListCreateView.as_view(), name="template-list"),
    path(
        "message-templates/<uuid:pk>/",
        AdminMessageTemplateDetailView.as_view(),
        name="template-detail",
    ),
]
