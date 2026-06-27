"""
DSAT LMS v2 — Academy Admin
Domain: Academy
Description: Phase 0 stub admin — only the Class model. (search_fields enables
            autocomplete from assessments.ExamAssignment.assigned_class.)
"""

from django.contrib import admin

from .models import Class


@admin.register(Class)
class ClassAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")
