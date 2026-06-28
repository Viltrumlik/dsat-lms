"""
DSAT LMS v2 — Exam catalog URLs
Domain: Assessments
Description: Read-only list of startable exam templates, mounted at /api/v1/exams/.
"""

from django.urls import path

from .views import ExamListView

urlpatterns = [
    path("", ExamListView.as_view(), name="exam-list"),
]
