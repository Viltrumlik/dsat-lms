"""
DSAT LMS v2 — Mailer admin
Domain: Mailer
Description: Read the outbox, manage the suppression list.

Messages are read-only on purpose: the body is what was sent, and editing it
after the fact would make the outbox a worse record than no record at all.
Codes are not registered — they are credentials, and there is nothing an admin
can usefully do with a hash.
"""

from django.contrib import admin

from .models import EmailMessage, EmailSuppression


@admin.register(EmailMessage)
class EmailMessageAdmin(admin.ModelAdmin):
    list_display = ("to_email", "kind", "status", "attempts", "sent_at", "created_at")
    list_filter = ("status", "kind", "created_at")
    search_fields = ("to_email", "subject")
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(EmailSuppression)
class EmailSuppressionAdmin(admin.ModelAdmin):
    list_display = ("email", "reason", "created_at")
    list_filter = ("reason",)
    search_fields = ("email", "note")
