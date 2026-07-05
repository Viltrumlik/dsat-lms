"""
DSAT LMS v2 — Academy Teacher URLs
Domain: Academy
Description: Teacher-facing endpoints (mounted at /api/v1/teacher/).
"""

from django.urls import path

from apps.academy.views import (
    TeacherClassEnrollView,
    TeacherClassListCreateView,
    TeacherClassOverviewView,
    TeacherClassRosterView,
    TeacherDashboardView,
    TeacherGradingView,
    TeacherStudentAnalyticsView,
    TeacherStudentsView,
)

app_name = "academy_teacher"

urlpatterns = [
    path("dashboard/", TeacherDashboardView.as_view(), name="teacher-dashboard"),
    path("students/", TeacherStudentsView.as_view(), name="teacher-students"),
    path("grading/", TeacherGradingView.as_view(), name="teacher-grading"),
    path("classes/", TeacherClassListCreateView.as_view(), name="teacher-class-list"),
    path(
        "classes/<uuid:pk>/roster/", TeacherClassRosterView.as_view(), name="teacher-class-roster"
    ),
    path(
        "classes/<uuid:pk>/overview/",
        TeacherClassOverviewView.as_view(),
        name="teacher-class-overview",
    ),
    path(
        "classes/<uuid:pk>/enroll/", TeacherClassEnrollView.as_view(), name="teacher-class-enroll"
    ),
    path(
        "students/<uuid:pk>/analytics/",
        TeacherStudentAnalyticsView.as_view(),
        name="teacher-student-analytics",
    ),
]
