"""
DSAT LMS v2 — CRM Django admin
Domain: CRM
"""

from django.contrib import admin

from .models import FollowUpTask, Lead, LeadActivity


class LeadActivityInline(admin.TabularInline):
    model = LeadActivity
    extra = 0


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "stage", "owner", "converted_user", "created_at")
    list_filter = ("stage", "source")
    search_fields = ("name", "email", "phone")
    inlines = [LeadActivityInline]


@admin.register(FollowUpTask)
class FollowUpTaskAdmin(admin.ModelAdmin):
    list_display = ("title", "lead", "assignee", "due_at", "done")
    list_filter = ("done",)
