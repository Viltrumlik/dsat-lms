"""
DSAT LMS v2 — Support Center admin URLs (S7)
Domain: Support
Description: Mounted at /api/v1/admin/ (alongside identity/question_bank/assessments
    admin). The admin ops dashboard endpoints.
"""

from django.urls import path

from .views_admin import AdminSupportOpsRebuildView, AdminSupportOpsView

app_name = "support_admin"

urlpatterns = [
    path("support-ops/", AdminSupportOpsView.as_view(), name="support-ops"),
    path("support-ops/rebuild/", AdminSupportOpsRebuildView.as_view(), name="support-ops-rebuild"),
]
