"""
DSAT LMS v2 — Vocabulary URLs
Domain: Vocabulary
Description: Student word-list browsing + flashcard runs (mounted at
    /api/v1/vocabulary/).
"""

from django.urls import path

from .views import (
    MyWordsView,
    SectionDetailView,
    SectionListView,
    SessionCreateView,
    SessionFinishView,
    SessionReportView,
    SetDetailView,
)

app_name = "vocabulary"

urlpatterns = [
    path("sections/", SectionListView.as_view(), name="section-list"),
    path("sections/<uuid:pk>/", SectionDetailView.as_view(), name="section-detail"),
    path("sets/<uuid:pk>/", SetDetailView.as_view(), name="set-detail"),
    path("learning/", MyWordsView.as_view(), name="learning"),
    path("sessions/", SessionCreateView.as_view(), name="session-create"),
    path("sessions/<uuid:pk>/report/", SessionReportView.as_view(), name="session-report"),
    path("sessions/<uuid:pk>/finish/", SessionFinishView.as_view(), name="session-finish"),
]
