"""
DSAT LMS v2 — Academy Admin
Domain: Academy
"""

from django.contrib import admin

from .models import Class, ClassEnrollment


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
