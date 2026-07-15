"""
DSAT LMS v2 — Audit admin URLs
Domain: Audit
Description: Mounted at /api/v1/admin/ (alongside identity/question_bank/…).
"""

from django.urls import path

from .views_admin import AdminAuditActionsView, AdminAuditListView

app_name = "audit_admin"

urlpatterns = [
    path("audit/", AdminAuditListView.as_view(), name="audit-list"),
    path("audit/actions/", AdminAuditActionsView.as_view(), name="audit-actions"),
]
