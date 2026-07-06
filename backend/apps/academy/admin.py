"""
DSAT LMS v2 — Academy Admin
Domain: Academy
"""

from django.contrib import admin

from .models import (
    Class,
    ClassEnrollment,
    MentorAssignment,
    MentorCheckIn,
    ParentContactLog,
)


@admin.register(Class)
class ClassAdmin(admin.ModelAdmin):
    list_display = ("name", "teacher", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "teacher__email")
    autocomplete_fields = ("teacher",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ClassEnrollment)
class ClassEnrollmentAdmin(admin.ModelAdmin):
    list_display = ("klass", "student", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("klass__name", "student__email")
    autocomplete_fields = ("klass", "student")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(MentorAssignment)
class MentorAssignmentAdmin(admin.ModelAdmin):
    list_display = ("profile", "mentor", "assigned_by", "ended_at", "created_at")
    list_filter = ("ended_at",)
    raw_id_fields = ("profile", "mentor", "assigned_by", "ended_by")


@admin.register(MentorCheckIn)
class MentorCheckInAdmin(admin.ModelAdmin):
    list_display = ("profile", "mentor", "created_at")
    raw_id_fields = ("profile", "mentor")


@admin.register(ParentContactLog)
class ParentContactLogAdmin(admin.ModelAdmin):
    list_display = ("profile", "guardian", "method", "author", "created_at")
    list_filter = ("method",)
    raw_id_fields = ("profile", "guardian", "author")
