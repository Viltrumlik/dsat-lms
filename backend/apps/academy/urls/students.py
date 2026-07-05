"""
DSAT LMS v2 — Academy Student-profile URLs
Domain: Academy
Description: The CRM person layer (mounted at /api/v1/students/): a student's own
    profile + a staff surface for demographics, lifecycle status, and guardians.
"""

from django.urls import path

from apps.academy.views_students import (
    GuardianDetailView,
    MyStudentProfileView,
    StaffStudentProfileView,
    StudentGuardiansView,
    StudentStatusView,
)

app_name = "academy_students"

urlpatterns = [
    # Literal segments first so they aren't shadowed by the <uuid:user_id> route.
    path("me/", MyStudentProfileView.as_view(), name="my-profile"),
    path("guardians/<uuid:pk>/", GuardianDetailView.as_view(), name="guardian-detail"),
    path("<uuid:user_id>/", StaffStudentProfileView.as_view(), name="staff-profile"),
    path("<uuid:user_id>/status/", StudentStatusView.as_view(), name="student-status"),
    path("<uuid:user_id>/guardians/", StudentGuardiansView.as_view(), name="student-guardians"),
]
