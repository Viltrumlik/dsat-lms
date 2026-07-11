"""
DSAT LMS v2 — Analytics admin URLs (Phase 5.1)
Domain: Analytics
Description: Mounted at /api/v1/admin/ (alongside identity/question_bank/…). The
    executive dashboard overview + rebuild.
"""

from django.urls import path

from .views_admin import AdminDashboardRebuildView, AdminDashboardView

app_name = "analytics_admin"

urlpatterns = [
    path("dashboard/", AdminDashboardView.as_view(), name="dashboard"),
    path("dashboard/rebuild/", AdminDashboardRebuildView.as_view(), name="dashboard-rebuild"),
]
