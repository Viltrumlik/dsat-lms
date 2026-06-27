"""
DSAT LMS v2 — Homework URLs
Domain: Homework
Description: Homework endpoints (mounted at /api/v1/homework/).
"""

from django.urls import path

from .views import (
    HomeworkDetailView,
    HomeworkListCreateView,
    HomeworkSubmissionsView,
    HomeworkSubmitView,
)

app_name = "homework"

urlpatterns = [
    path("", HomeworkListCreateView.as_view(), name="homework-list"),
    path("<uuid:pk>/", HomeworkDetailView.as_view(), name="homework-detail"),
    path("<uuid:pk>/submit/", HomeworkSubmitView.as_view(), name="homework-submit"),
    path("<uuid:pk>/submissions/", HomeworkSubmissionsView.as_view(), name="homework-submissions"),
]
