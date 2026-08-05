"""
DSAT LMS v2 — Classroom stream URLs
Domain: Academy
Description: Membership-scoped class endpoints (mounted at /api/v1/classes/).
            Distinct from /teacher/classes/, which is the teacher's management
            surface — these are reachable by anyone IN the class.
"""

from django.urls import path

from ..views_stream import (
    ClassCommentDetailView,
    ClassCommentListView,
    ClassPostDetailView,
    ClassStreamView,
    MyClassesView,
)

app_name = "classes"

urlpatterns = [
    path("", MyClassesView.as_view(), name="my-classes"),
    path("<uuid:pk>/stream/", ClassStreamView.as_view(), name="class-stream"),
    path("<uuid:pk>/stream/<uuid:post_pk>/", ClassPostDetailView.as_view(), name="class-post"),
    path(
        "<uuid:pk>/stream/<uuid:post_pk>/comments/",
        ClassCommentListView.as_view(),
        name="class-comments",
    ),
    path(
        "<uuid:pk>/stream/<uuid:post_pk>/comments/<uuid:comment_pk>/",
        ClassCommentDetailView.as_view(),
        name="class-comment",
    ),
]
