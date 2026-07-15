"""
DSAT LMS v2 — Notification Model
Domain: Notifications
Description: In-app notifications. `data` is one of the three sanctioned JSONB
            columns (action URL + related IDs).
"""

from django.db import models
from django.utils import timezone

from common.models import BaseModel


class Notification(BaseModel):
    class Type(models.TextChoices):
        EXAM_GRADED = "exam_graded", "Exam Graded"
        EXAM_SCHEDULED = "exam_scheduled", "Exam Scheduled"
        HOMEWORK_ASSIGNED = "homework_assigned", "Homework Assigned"
        HOMEWORK_DUE = "homework_due", "Homework Due"
        ANNOUNCEMENT = "announcement", "Announcement"
        SYSTEM = "system", "System"
        # Support Center (Phase 4) — all values ≤30 chars (max_length stays 30)
        BOOKING_REQUESTED = "booking_requested", "Booking Requested"
        BOOKING_CONFIRMED = "booking_confirmed", "Booking Confirmed"
        BOOKING_CANCELLED = "booking_cancelled", "Booking Cancelled"
        BOOKING_COMPLETED = "booking_completed", "Booking Completed"
        SUPPORT_REPLY = "support_reply", "Support Reply"
        OFFICE_HOURS_REMINDER = "office_hours_reminder", "Office Hours Reminder"
        OFFICE_HOURS_CANCELED = "office_hours_canceled", "Office Hours Canceled"
        SUPPORT_RECOMMENDATION = "support_recommendation", "Support Recommendation"
        MENTOR_ASSIGNED = "mentor_assigned", "Mentor Assigned"
        MENTOR_CHECKIN_DUE = "mentor_checkin_due", "Mentor Check-in Due"
        # Courses (Phase 5.4)
        COURSE_ASSIGNED = "course_assigned", "Course Assigned"
        # CRM (Phase 5.5)
        LEAD_ASSIGNED = "lead_assigned", "Lead Assigned"
        FOLLOW_UP_DUE = "follow_up_due", "Follow-up Due"

    user = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(max_length=30, choices=Type.choices, default=Type.SYSTEM)
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    data = models.JSONField(default=dict)  # action_url, related IDs
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "is_read"])]

    def __str__(self):
        return f"[{self.type}] {self.title} → {self.user_id}"

    def mark_read(self):
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=["is_read", "read_at"])


class Announcement(BaseModel):
    """An admin broadcast to a segment over one or more channels (5.2c). Delivery
    happens through a pluggable channel layer; the in-app channel reuses the
    Notification feed, so students already render announcements."""

    class Audience(models.TextChoices):
        ALL_STUDENTS = "all_students", "All students"
        ALL_STAFF = "all_staff", "All staff"
        ROLE = "role", "By role"
        CLASS = "class", "By class"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"

    author = models.ForeignKey(
        "identity.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    title = models.CharField(max_length=200)
    body = models.TextField()
    audience_type = models.CharField(max_length=20, choices=Audience.choices)
    # role string (Audience.ROLE) or class UUID (Audience.CLASS); unused otherwise.
    audience_ref = models.CharField(max_length=64, blank=True, default="")
    channels = models.JSONField(default=list)  # e.g. ["in_app", "email"]
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "announcements"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class AnnouncementDelivery(BaseModel):
    """One (announcement, user, channel) delivery record — the fan-out idempotency
    key (a re-run skips rows already present)."""

    class Status(models.TextChoices):
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    announcement = models.ForeignKey(
        Announcement, on_delete=models.CASCADE, related_name="deliveries"
    )
    user = models.ForeignKey("identity.User", on_delete=models.CASCADE, related_name="+")
    channel = models.CharField(max_length=20)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SENT)
    error = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "announcement_deliveries"
        unique_together = [("announcement", "user", "channel")]
        indexes = [models.Index(fields=["announcement", "channel"])]

    def __str__(self):
        return f"{self.announcement_id} → {self.user_id} ({self.channel})"


class MessageTemplate(BaseModel):
    """A reusable, author-authored message body (per-locale text lives in the body,
    not i18n keys). Selectable when composing an announcement."""

    name = models.CharField(max_length=150)
    subject = models.CharField(max_length=200, blank=True, default="")
    body = models.TextField()

    class Meta:
        db_table = "message_templates"
        ordering = ["name"]

    def __str__(self):
        return self.name
