"""
DSAT LMS v2 — Assessments Admin
Domain: Assessments
Description: Exam templates (+ sections/questions inline), sessions, responses,
            results, assignments.
"""

from django.contrib import admin

from .models import (
    ExamAssignment,
    ExamQuestion,
    ExamResponse,
    ExamResult,
    ExamSection,
    ExamSession,
    ExamTemplate,
)


class ExamSectionInline(admin.TabularInline):
    model = ExamSection
    extra = 0


class ExamQuestionInline(admin.TabularInline):
    model = ExamQuestion
    extra = 0
    autocomplete_fields = ("question",)


@admin.register(ExamTemplate)
class ExamTemplateAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "type",
        "module",
        "access_level",
        "time_limit",
        "is_adaptive",
        "created_at",
    )
    list_filter = ("type", "module", "access_level", "is_adaptive")
    search_fields = ("title", "description")
    autocomplete_fields = ("created_by",)
    inlines = [ExamSectionInline]
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ExamSection)
class ExamSectionAdmin(admin.ModelAdmin):
    list_display = ("exam", "section_number", "module", "title", "time_limit", "sort_order")
    list_filter = ("module",)
    search_fields = ("title", "exam__title")
    autocomplete_fields = ("exam",)
    inlines = [ExamQuestionInline]


@admin.register(ExamSession)
class ExamSessionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "exam",
        "status",
        "current_section",
        "current_question",
        "started_at",
        "submitted_at",
    )
    list_filter = ("status",)
    search_fields = ("user__email", "exam__title")
    autocomplete_fields = ("user", "exam", "assignment")
    readonly_fields = ("id", "started_at", "created_at", "updated_at")


@admin.register(ExamResponse)
class ExamResponseAdmin(admin.ModelAdmin):
    list_display = (
        "session",
        "question",
        "chosen_answer",
        "is_correct",
        "time_spent",
        "answered_at",
    )
    list_filter = ("is_correct",)
    autocomplete_fields = ("session", "question")
    readonly_fields = ("answered_at",)


@admin.register(ExamResult)
class ExamResultAdmin(admin.ModelAdmin):
    list_display = (
        "session",
        "user",
        "exam",
        "total_score",
        "accuracy_pct",
        "percentile",
        "computed_at",
    )
    search_fields = ("user__email", "exam__title")
    autocomplete_fields = ("session", "user", "exam")
    readonly_fields = ("computed_at",)


@admin.register(ExamAssignment)
class ExamAssignmentAdmin(admin.ModelAdmin):
    list_display = (
        "exam",
        "assigned_by",
        "assigned_class",
        "assigned_student",
        "opens_at",
        "closes_at",
        "max_attempts",
    )
    search_fields = ("exam__title", "assigned_student__email", "assigned_class__name")
    autocomplete_fields = ("exam", "assigned_by", "assigned_class", "assigned_student")
    readonly_fields = ("id", "created_at", "updated_at")
