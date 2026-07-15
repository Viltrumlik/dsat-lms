"""
DSAT LMS v2 — Courses admin URLs
Domain: Courses (admin authoring); mounted at /api/v1/admin/. IsAdmin on every view.
"""

from django.urls import path

from .views_admin import (
    AdminCourseDetailView,
    AdminCourseListCreateView,
    AdminCoursePublishView,
    AdminLessonAttachmentDeleteView,
    AdminLessonAttachmentsView,
    AdminLessonDetailView,
    AdminLessonListCreateView,
    AdminLessonReorderView,
    AdminUnitDetailView,
    AdminUnitListCreateView,
    AdminUnitReorderView,
)

app_name = "courses_admin"

urlpatterns = [
    # Courses
    path("courses/", AdminCourseListCreateView.as_view(), name="course-list"),
    path("courses/<uuid:pk>/", AdminCourseDetailView.as_view(), name="course-detail"),
    path("courses/<uuid:pk>/publish/", AdminCoursePublishView.as_view(), name="course-publish"),
    # Units
    path(
        "courses/<uuid:course_id>/units/",
        AdminUnitListCreateView.as_view(),
        name="unit-list",
    ),
    path(
        "courses/<uuid:course_id>/units/reorder/",
        AdminUnitReorderView.as_view(),
        name="unit-reorder",
    ),
    path(
        "courses/<uuid:course_id>/units/<uuid:unit_id>/",
        AdminUnitDetailView.as_view(),
        name="unit-detail",
    ),
    # Lessons (nested create/reorder; flat detail/edit)
    path(
        "courses/<uuid:course_id>/units/<uuid:unit_id>/lessons/",
        AdminLessonListCreateView.as_view(),
        name="lesson-create",
    ),
    path(
        "courses/<uuid:course_id>/units/<uuid:unit_id>/lessons/reorder/",
        AdminLessonReorderView.as_view(),
        name="lesson-reorder",
    ),
    path("lessons/<uuid:pk>/", AdminLessonDetailView.as_view(), name="lesson-detail"),
    path(
        "lessons/<uuid:pk>/attachments/",
        AdminLessonAttachmentsView.as_view(),
        name="lesson-attachments",
    ),
    path(
        "lessons/<uuid:pk>/attachments/<uuid:att_id>/",
        AdminLessonAttachmentDeleteView.as_view(),
        name="lesson-attachment-delete",
    ),
]
