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
from apps.academy.views_attendance import (
    TeacherClassScheduleRulesView,
    TeacherClassSessionAttendanceView,
    TeacherClassSessionDetailView,
    TeacherClassSessionListCreateView,
    TeacherScheduleRuleDetailView,
)
from apps.academy.views_mentor import MyMenteesView

app_name = "academy_teacher"

urlpatterns = [
    path("dashboard/", TeacherDashboardView.as_view(), name="teacher-dashboard"),
    path("students/", TeacherStudentsView.as_view(), name="teacher-students"),
    path("mentees/", MyMenteesView.as_view(), name="teacher-mentees"),
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
    # Attendance (5.2a)
    path(
        "class-sessions/",
        TeacherClassSessionListCreateView.as_view(),
        name="class-session-list",
    ),
    path(
        "class-sessions/<uuid:pk>/",
        TeacherClassSessionDetailView.as_view(),
        name="class-session-detail",
    ),
    path(
        "class-sessions/<uuid:pk>/attendance/",
        TeacherClassSessionAttendanceView.as_view(),
        name="class-session-attendance",
    ),
    # Schedule rules (5.2b)
    path(
        "classes/<uuid:pk>/schedule-rules/",
        TeacherClassScheduleRulesView.as_view(),
        name="class-schedule-rules",
    ),
    path(
        "schedule-rules/<uuid:pk>/",
        TeacherScheduleRuleDetailView.as_view(),
        name="schedule-rule-detail",
    ),
]
