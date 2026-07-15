"""
DSAT LMS v2 — Academy admin URLs (5.3a)
Domain: Academy
Description: Mounted at /api/v1/admin/ (alongside identity/question_bank/…).
    Admin-wide gradebook (any class). IsAdmin.
"""

from django.urls import path

from .views_gradebook import AdminGradebookView

app_name = "academy_admin"

urlpatterns = [
    path("gradebook/", AdminGradebookView.as_view(), name="gradebook"),
]
