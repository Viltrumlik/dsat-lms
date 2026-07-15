"""
DSAT LMS v2 — Academy admin URLs (5.3a)
Domain: Academy
Description: Mounted at /api/v1/admin/ (alongside identity/question_bank/…).
    Admin-wide gradebook (any class). IsAdmin.
"""

from django.urls import path

from .views_gradebook import AdminGradebookView
from .views_notes import (
    StudentNoteDetailView,
    StudentNotesView,
    StudentTimelineView,
)

app_name = "academy_admin"

urlpatterns = [
    path("gradebook/", AdminGradebookView.as_view(), name="gradebook"),
    # Student-360 notes + unified timeline (5.5b)
    path("students/<uuid:pk>/notes/", StudentNotesView.as_view(), name="student-notes"),
    path(
        "students/<uuid:pk>/notes/<uuid:note_id>/",
        StudentNoteDetailView.as_view(),
        name="student-note-detail",
    ),
    path("students/<uuid:pk>/timeline/", StudentTimelineView.as_view(), name="student-timeline"),
]
