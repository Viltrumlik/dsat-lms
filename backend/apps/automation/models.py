"""
DSAT LMS v2 — Automation models
Domain: Automation
Description: AutomationRule (a saved trigger + condition tree + action list) and
    AutomationLog (append-only, one row per rule×subject×day — the idempotency
    key that stops a rule from re-firing on repeated events or sweeps).
"""

from django.db import models

from apps.identity.models import User
from common.models import BaseModel


class AutomationRule(BaseModel):
    """An admin-authored rule. `conditions` is a validated DSL tree (conditions.py);
    `actions` is a validated list of {type, params} (actions.py). Fires daily
    (scheduled_daily) or on an event dispatch (event + event_key)."""

    class Trigger(models.TextChoices):
        SCHEDULED_DAILY = "scheduled_daily", "Daily (scheduled)"
        EVENT = "event", "On event"

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    enabled = models.BooleanField(default=True)
    trigger_type = models.CharField(max_length=20, choices=Trigger.choices)
    # Only meaningful when trigger_type == EVENT (a catalog EVENTS key).
    event_key = models.CharField(max_length=64, blank=True, default="")
    subject_type = models.CharField(max_length=20, default="student")
    conditions = models.JSONField(default=dict)
    actions = models.JSONField(default=list)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    last_run_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "automation_rules"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class AutomationLog(BaseModel):
    """One row per (rule, subject, run_date). Append-only: never soft-deleted, and
    the unique key makes rule execution idempotent per subject per day — the first
    matching evaluation of the day runs the actions; later ones no-op."""

    class Status(models.TextChoices):
        OK = "ok", "Acted"
        SKIPPED = "skipped", "Skipped"
        ERROR = "error", "Error"

    rule = models.ForeignKey(AutomationRule, on_delete=models.CASCADE, related_name="logs")
    subject_type = models.CharField(max_length=20)
    subject_id = models.UUIDField()
    subject_label = models.CharField(max_length=255, blank=True, default="")
    run_date = models.DateField()
    matched = models.BooleanField(default=False)
    actions_taken = models.JSONField(default=list)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OK)
    error = models.TextField(blank=True, default="")

    class Meta:
        db_table = "automation_logs"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["rule", "subject_type", "subject_id", "run_date"],
                name="uniq_rule_subject_day",
            )
        ]
        indexes = [
            models.Index(fields=["rule", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.rule_id} · {self.subject_label} · {self.run_date} · {self.status}"
