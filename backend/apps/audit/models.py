"""
DSAT LMS v2 — Audit models
Domain: Audit
Description: ActivityLog — one append-only row per recorded staff/admin mutation.
    The actor's role and the target's human label are SNAPSHOTTED at write time
    (denormalized) so the viewer never joins to — or resolves — possibly-renamed
    or soft-deleted rows. Rows are never soft-deleted.
"""

from django.db import models

from common.models import BaseModel


class ActivityLog(BaseModel):
    # Who did it. SET_NULL: the log survives the actor's account deletion.
    actor = models.ForeignKey(
        "identity.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="activity_logs",
    )
    # Role snapshot — survives a later role change.
    actor_role = models.CharField(max_length=20, blank=True)

    # Dotted verb, e.g. "user.role_changed", "question.approved".
    action = models.CharField(max_length=50, db_index=True)

    # Target identity, denormalized.
    target_type = models.CharField(max_length=50, blank=True)  # "app_label.Model"
    target_id = models.UUIDField(null=True, blank=True, db_index=True)
    target_label = models.CharField(max_length=255, blank=True)

    summary = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "activity_log"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["actor", "-created_at"]),
            models.Index(fields=["action", "-created_at"]),
            models.Index(fields=["target_type", "target_id"]),
        ]

    def __str__(self):
        return f"{self.actor_role or 'system'} · {self.action} · {self.target_label}"
