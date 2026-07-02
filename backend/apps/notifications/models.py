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
