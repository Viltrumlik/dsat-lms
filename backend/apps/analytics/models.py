"""
DSAT LMS v2 — Analytics Models
Domain: Analytics
Description: Denormalized per-user, per-category performance. Recomputed by the
            update_category_stats Celery task when a session is submitted.
"""

from django.db import models

from common.models import BaseModel


class UserCategoryStat(BaseModel):
    """One row per (user, category) — rolled up from graded ExamResponses."""

    user = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="category_stats",
    )
    category = models.ForeignKey(
        "question_bank.QuestionCategory",
        on_delete=models.CASCADE,
        related_name="user_stats",
    )
    total_answered = models.IntegerField(default=0)
    total_correct = models.IntegerField(default=0)
    accuracy_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    last_practiced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "user_category_stats"
        unique_together = [("user", "category")]
        indexes = [models.Index(fields=["user", "category"])]

    def __str__(self):
        return f"{self.user_id} · {self.category_id}: {self.total_correct}/{self.total_answered}"


class PlatformOpsDaily(BaseModel):
    """One row per day of platform-wide FLOW counters. Everything counts what
    HAPPENED that day (reconstructable from timestamps), so the rollup is
    deterministic + backfillable. Powers the admin dashboard's trend chart;
    current-state KPIs stay live in admin_ops.admin_dashboard_overview. Never
    soft-deleted (hard upsert on the unique date)."""

    date = models.DateField(unique=True)
    new_registrations = models.PositiveIntegerField(default=0)
    exams_taken = models.PositiveIntegerField(default=0)
    homework_submitted = models.PositiveIntegerField(default=0)
    bookings_created = models.PositiveIntegerField(default=0)
    tickets_created = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "platform_ops_daily"
        ordering = ["-date"]

    def __str__(self):
        return f"PlatformOpsDaily {self.date}"
