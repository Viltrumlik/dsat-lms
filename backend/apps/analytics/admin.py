"""
DSAT LMS v2 — Analytics Admin
Domain: Analytics
"""

from django.contrib import admin

from .models import UserCategoryStat


@admin.register(UserCategoryStat)
class UserCategoryStatAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "category",
        "total_answered",
        "total_correct",
        "accuracy_pct",
        "last_practiced_at",
    )
    search_fields = ("user__email", "category__name")
    autocomplete_fields = ("user", "category")
    readonly_fields = ("id", "created_at", "updated_at")
