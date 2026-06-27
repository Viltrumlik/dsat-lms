"""
DSAT LMS v2 — Homework Admin
Domain: Homework
"""

from django.contrib import admin

from .models import Homework, HomeworkSubmission


@admin.register(Homework)
class HomeworkAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "assigned_class",
        "assigned_by",
        "due_at",
        "is_published",
        "created_at",
    )
    list_filter = ("is_published",)
    search_fields = ("title", "assigned_class__name")
    autocomplete_fields = ("assigned_class", "assigned_by", "exam")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(HomeworkSubmission)
class HomeworkSubmissionAdmin(admin.ModelAdmin):
    list_display = ("homework", "student", "status", "submitted_at", "created_at")
    list_filter = ("status",)
    search_fields = ("homework__title", "student__email")
    autocomplete_fields = ("homework", "student", "session")
    readonly_fields = ("id", "created_at", "updated_at")
