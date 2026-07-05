"""
DSAT LMS v2 — Staff URLs
Domain: Identity
Description: Cross-role staff endpoints, mounted at /api/v1/staff/.
"""

from django.urls import path

from .views_staff import StaffAccessMatrixView

app_name = "identity_staff"

urlpatterns = [
    path("access-matrix/", StaffAccessMatrixView.as_view(), name="staff-access-matrix"),
]
