"""
DSAT LMS v2 — Analytics URLs
Domain: Analytics
Description: Analytics endpoints (mounted at /api/v1/analytics/).
"""

from django.urls import path

from .views import ProgressView, RankingsView, SummaryView

app_name = "analytics"

urlpatterns = [
    path("progress/", ProgressView.as_view(), name="progress"),
    path("summary/", SummaryView.as_view(), name="summary"),
    path("rankings/", RankingsView.as_view(), name="rankings"),
]
