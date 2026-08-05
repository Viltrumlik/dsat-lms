"""
DSAT LMS v2 — Homework URLs
Domain: Homework
Description: Homework endpoints (mounted at /api/v1/homework/).
"""

from django.urls import path

from .views import (
    HomeworkDetailView,
    HomeworkGradeView,
    HomeworkListCreateView,
    HomeworkReturnView,
    HomeworkStartView,
    HomeworkSubmissionsView,
    HomeworkSubmitView,
)

app_name = "homework"

urlpatterns = [
    path("", HomeworkListCreateView.as_view(), name="homework-list"),
    path("<uuid:pk>/", HomeworkDetailView.as_view(), name="homework-detail"),
    path("<uuid:pk>/start/", HomeworkStartView.as_view(), name="homework-start"),
    path("<uuid:pk>/submit/", HomeworkSubmitView.as_view(), name="homework-submit"),
    path("<uuid:pk>/submissions/", HomeworkSubmissionsView.as_view(), name="homework-submissions"),
    path(
        "<uuid:pk>/submissions/<uuid:submission_pk>/grade/",
        HomeworkGradeView.as_view(),
        name="homework-grade",
    ),
    path(
        "<uuid:pk>/submissions/<uuid:submission_pk>/return/",
        HomeworkReturnView.as_view(),
        name="homework-return",
    ),
]
