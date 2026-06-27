"""
DSAT LMS v2 — Academy Teacher URLs
Domain: Academy
Description: Teacher-facing endpoints (mounted at /api/v1/teacher/).
"""

from django.urls import path

from apps.academy.views import (
    TeacherClassEnrollView,
    TeacherClassListCreateView,
    TeacherClassRosterView,
)

app_name = "academy_teacher"

urlpatterns = [
    path("classes/", TeacherClassListCreateView.as_view(), name="teacher-class-list"),
    path(
        "classes/<uuid:pk>/roster/", TeacherClassRosterView.as_view(), name="teacher-class-roster"
    ),
    path(
        "classes/<uuid:pk>/enroll/", TeacherClassEnrollView.as_view(), name="teacher-class-enroll"
    ),
]
