"""
DSAT LMS v2 — Courses student URLs
Domain: Courses (student player); mounted at /api/v1/courses/.
"""

from django.urls import path

from .views import CourseDetailView, CourseListView, LessonProgressView

app_name = "courses"

urlpatterns = [
    path("", CourseListView.as_view(), name="course-list"),
    path("lessons/<uuid:pk>/progress/", LessonProgressView.as_view(), name="lesson-progress"),
    path("<uuid:pk>/", CourseDetailView.as_view(), name="course-detail"),
]
