"""
DSAT LMS v2 — Assessments URLs
Domain: Assessments
Description: Exam session (test engine) endpoints, mounted at /api/v1/sessions/.
"""

from django.urls import path

from .views import (
    SessionAnswerView,
    SessionDetailView,
    SessionResultView,
    SessionStartView,
    SessionSubmitView,
)

app_name = "assessments"

urlpatterns = [
    path("", SessionStartView.as_view(), name="session-start"),
    path("<uuid:pk>/", SessionDetailView.as_view(), name="session-detail"),
    path("<uuid:pk>/answer/", SessionAnswerView.as_view(), name="session-answer"),
    path("<uuid:pk>/submit/", SessionSubmitView.as_view(), name="session-submit"),
    path("<uuid:pk>/result/", SessionResultView.as_view(), name="session-result"),
]
