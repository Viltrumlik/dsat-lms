"""
DSAT LMS v2 — Support Center admin
Domain: Support
Description: Django-admin registrations for the S1 booking models (ops visibility;
    the REST API is the real management surface).
"""

from django.contrib import admin

from .models import (
    OfficeHour,
    OfficeHourAttendance,
    OfficeHourSession,
    SessionOutcome,
    SessionRating,
    SupportBooking,
    SupportRecommendation,
    SupportTicket,
    SupportTicketAttachment,
    TeacherAvailability,
    TicketReply,
)


@admin.register(TeacherAvailability)
class TeacherAvailabilityAdmin(admin.ModelAdmin):
    list_display = (
        "teacher",
        "subject",
        "weekday",
        "start_time",
        "end_time",
        "slot_minutes",
        "is_active",
    )
    list_filter = ("subject", "is_active", "weekday")
    raw_id_fields = ("teacher",)


@admin.register(SupportBooking)
class SupportBookingAdmin(admin.ModelAdmin):
    list_display = ("student", "teacher", "subject", "scheduled_at", "status")
    list_filter = ("status", "subject")
    raw_id_fields = ("student", "teacher")
    date_hierarchy = "scheduled_at"


@admin.register(SessionOutcome)
class SessionOutcomeAdmin(admin.ModelAdmin):
    list_display = ("booking",)
    raw_id_fields = ("booking",)


@admin.register(SessionRating)
class SessionRatingAdmin(admin.ModelAdmin):
    list_display = ("booking", "score")
    list_filter = ("score",)
    raw_id_fields = ("booking",)


class TicketReplyInline(admin.TabularInline):
    model = TicketReply
    extra = 0
    raw_id_fields = ("author",)


class SupportTicketAttachmentInline(admin.TabularInline):
    model = SupportTicketAttachment
    extra = 0
    raw_id_fields = ("attachment",)


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = ("student", "subject", "priority", "status", "assigned_to", "last_reply_at")
    list_filter = ("status", "priority", "subject")
    raw_id_fields = ("student", "assigned_to")
    inlines = [TicketReplyInline, SupportTicketAttachmentInline]


@admin.register(SupportRecommendation)
class SupportRecommendationAdmin(admin.ModelAdmin):
    list_display = ("student", "rule_key", "severity", "status", "subject", "topic", "expires_at")
    list_filter = ("status", "severity", "rule_key")
    raw_id_fields = ("student", "notification", "booking")


@admin.register(OfficeHour)
class OfficeHourAdmin(admin.ModelAdmin):
    list_display = ("teacher", "title", "subject", "weekday", "start_time", "capacity", "is_active")
    list_filter = ("subject", "is_active", "weekday")
    raw_id_fields = ("teacher",)


class OfficeHourAttendanceInline(admin.TabularInline):
    model = OfficeHourAttendance
    extra = 0
    raw_id_fields = ("student",)


@admin.register(OfficeHourSession)
class OfficeHourSessionAdmin(admin.ModelAdmin):
    list_display = ("title", "teacher", "subject", "starts_at", "capacity", "status")
    list_filter = ("status", "subject")
    raw_id_fields = ("office_hour", "teacher")
    date_hierarchy = "starts_at"
    inlines = [OfficeHourAttendanceInline]
