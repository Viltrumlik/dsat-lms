"""
DSAT LMS v2 — Analytics admin URLs (Phase 5.1)
Domain: Analytics
Description: Mounted at /api/v1/admin/ (alongside identity/question_bank/…). The
    executive dashboard overview + rebuild.
"""

from django.urls import path

from .views_admin import AdminAnalyticsView, AdminDashboardRebuildView, AdminDashboardView
from .views_reports import AdminReportView

app_name = "analytics_admin"

urlpatterns = [
    path("dashboard/", AdminDashboardView.as_view(), name="dashboard"),
    path("dashboard/rebuild/", AdminDashboardRebuildView.as_view(), name="dashboard-rebuild"),
    path("analytics/", AdminAnalyticsView.as_view(), name="analytics"),
    path("reports/<str:kind>/", AdminReportView.as_view(), name="report"),
]
