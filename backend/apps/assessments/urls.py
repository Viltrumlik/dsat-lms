"""
DSAT LMS v2 — Assessments URLs
Domain: Assessments
Description: Exam session (test engine) endpoints, mounted at /api/v1/sessions/.
"""

from django.urls import path

from .views import (
    SessionAnswerView,
    SessionDetailView,
    SessionListCreateView,
    SessionPauseView,
    SessionResultView,
    SessionResumeView,
    SessionSubmitView,
)

app_name = "assessments"

urlpatterns = [
    path("", SessionListCreateView.as_view(), name="session-list-create"),
    path("<uuid:pk>/", SessionDetailView.as_view(), name="session-detail"),
    path("<uuid:pk>/answer/", SessionAnswerView.as_view(), name="session-answer"),
    path("<uuid:pk>/pause/", SessionPauseView.as_view(), name="session-pause"),
    path("<uuid:pk>/resume/", SessionResumeView.as_view(), name="session-resume"),
    path("<uuid:pk>/submit/", SessionSubmitView.as_view(), name="session-submit"),
    path("<uuid:pk>/result/", SessionResultView.as_view(), name="session-result"),
]
