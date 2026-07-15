"""
DSAT LMS v2 — Courses Django admin
Domain: Courses
"""

from django.contrib import admin

from .models import (
    Course,
    CourseAssignment,
    Lesson,
    LessonAttachment,
    LessonProgress,
    Unit,
)


class UnitInline(admin.TabularInline):
    model = Unit
    extra = 0


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ("title", "subject", "status", "created_by", "published_at", "created_at")
    list_filter = ("status", "subject")
    search_fields = ("title", "slug")
    inlines = [UnitInline]


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ("title", "course", "position")
    list_filter = ("course",)


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ("title", "unit", "position")
    search_fields = ("title",)


admin.site.register(LessonAttachment)
admin.site.register(CourseAssignment)
admin.site.register(LessonProgress)
