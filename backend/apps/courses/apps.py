"""
DSAT LMS v2 — Courses App Config
Domain: Courses
Description: A full course system — Course → Unit → Lesson (+ attachments), a
    draft/published/archived publish lifecycle, assignment to a class or student,
    and per-student lesson progress. Admin authoring under /api/v1/admin/; the
    student player under /api/v1/courses/.
"""

from django.apps import AppConfig


class CoursesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.courses"
    label = "courses"
    verbose_name = "Courses"
