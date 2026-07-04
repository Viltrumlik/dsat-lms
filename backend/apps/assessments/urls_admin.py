"""
DSAT LMS v2 — Assessments Admin URLs
Domain: Assessments
Description: Admin exam-builder + assignment endpoints (mounted at /api/v1/admin/).
Permissions: IsAdmin on every view (see views_admin.py).
"""

from django.urls import path

from .views_admin import (
    AdminAssignmentDetailView,
    AdminAssignmentListCreateView,
    AdminAssignmentSessionsView,
    AdminExamDetailView,
    AdminExamListCreateView,
    AdminSectionDetailView,
    AdminSectionListCreateView,
    AdminSectionQuestionDeleteView,
    AdminSectionQuestionsView,
    AdminSectionReorderView,
)

app_name = "assessments_admin"

urlpatterns = [
    # Exams
    path("exams/", AdminExamListCreateView.as_view(), name="exam-list"),
    path("exams/<uuid:pk>/", AdminExamDetailView.as_view(), name="exam-detail"),
    # Sections
    path(
        "exams/<uuid:exam_id>/sections/", AdminSectionListCreateView.as_view(), name="section-list"
    ),
    path(
        "exams/<uuid:exam_id>/sections/<int:section_id>/",
        AdminSectionDetailView.as_view(),
        name="section-detail",
    ),
    # Section questions
    path(
        "exams/<uuid:exam_id>/sections/<int:section_id>/questions/",
        AdminSectionQuestionsView.as_view(),
        name="section-questions",
    ),
    path(
        "exams/<uuid:exam_id>/sections/<int:section_id>/questions/reorder/",
        AdminSectionReorderView.as_view(),
        name="section-reorder",
    ),
    path(
        "exams/<uuid:exam_id>/sections/<int:section_id>/questions/<int:eq_id>/",
        AdminSectionQuestionDeleteView.as_view(),
        name="section-question-delete",
    ),
    # Assignments
    path("assignments/", AdminAssignmentListCreateView.as_view(), name="assignment-list"),
    path("assignments/<uuid:pk>/", AdminAssignmentDetailView.as_view(), name="assignment-detail"),
    path(
        "assignments/<uuid:pk>/sessions/",
        AdminAssignmentSessionsView.as_view(),
        name="assignment-sessions",
    ),
]
