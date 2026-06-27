"""
DSAT LMS v2 — Question Bank Admin
Domain: Question Bank
Description: Content studio admin — categories, tags, questions (+ choices inline), reviews.
"""

from django.contrib import admin

from .models import Question, QuestionCategory, QuestionChoice, QuestionReview, QuestionTag


class QuestionChoiceInline(admin.TabularInline):
    model = QuestionChoice
    extra = 4
    max_num = 6


@admin.register(QuestionCategory)
class QuestionCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "module", "parent", "sort_order")
    list_filter = ("module",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ("parent",)


@admin.register(QuestionTag)
class QuestionTagAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "color")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = (
        "short_stem",
        "module",
        "category",
        "difficulty",
        "status",
        "answer_type",
        "version",
        "created_at",
    )
    list_filter = ("status", "module", "difficulty", "answer_type", "source", "has_math")
    search_fields = ("stem", "source_ref")
    autocomplete_fields = ("category", "parent", "created_by", "reviewed_by")
    filter_horizontal = ("tags",)
    readonly_fields = ("id", "published_at", "created_at", "updated_at")
    inlines = [QuestionChoiceInline]
    list_select_related = ("category",)

    @admin.display(description="Stem")
    def short_stem(self, obj):
        return (obj.stem[:60] + "…") if len(obj.stem) > 60 else obj.stem


@admin.register(QuestionReview)
class QuestionReviewAdmin(admin.ModelAdmin):
    list_display = ("question", "reviewer", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("question__stem", "reviewer__email")
    autocomplete_fields = ("question", "reviewer")
    readonly_fields = ("created_at",)
