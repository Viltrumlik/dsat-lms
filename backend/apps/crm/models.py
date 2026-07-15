"""
DSAT LMS v2 — CRM Models
Domain: CRM
Description: Pre-enrollment leads pipeline. A Lead moves through stages
    (new → contacted → trial → registered / lost); converting a registered lead
    atomically creates a student account + profile (see services.convert_lead).
    LeadActivity is the interaction timeline; FollowUpTask is a dated to-do.

Tags (Tag / TaggedItem, GenericForeignKey) live in tags.py.
"""

from django.db import models

from common.models import BaseModel


class Lead(BaseModel):
    """A prospective student in the pre-enrollment pipeline."""

    class Stage(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Contacted"
        TRIAL = "trial", "Trial"
        REGISTERED = "registered", "Registered"
        LOST = "lost", "Lost"

    class Source(models.TextChoices):
        WALK_IN = "walk_in", "Walk-in"
        REFERRAL = "referral", "Referral"
        SOCIAL = "social", "Social media"
        WEB = "web", "Website"
        PHONE = "phone", "Phone"
        OTHER = "other", "Other"

    class Subject(models.TextChoices):
        MATH = "math", "Math"
        READING_WRITING = "reading_writing", "Reading & Writing"
        FULL = "full", "Full SAT"
        OTHER = "other", "Other"

    name = models.CharField(max_length=200)
    email = models.EmailField(blank=True, default="", db_index=True)
    phone = models.CharField(max_length=32, blank=True, default="")
    source = models.CharField(max_length=20, choices=Source.choices, blank=True, default="")
    subject_interest = models.CharField(
        max_length=20, choices=Subject.choices, blank=True, default=""
    )
    stage = models.CharField(max_length=20, choices=Stage.choices, default=Stage.NEW, db_index=True)
    note = models.TextField(blank=True, default="")

    # The front-office person responsible for this lead.
    owner = models.ForeignKey(
        "identity.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_leads",
    )
    # The student account created when the lead converts (set once, then read-only).
    converted_user = models.ForeignKey(
        "identity.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    converted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "crm_leads"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["stage", "-created_at"]),
            models.Index(fields=["owner", "stage"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.stage})"


class LeadActivity(BaseModel):
    """One interaction on a lead's timeline (call / meeting / note / stage change)."""

    class Kind(models.TextChoices):
        NOTE = "note", "Note"
        CALL = "call", "Call"
        MEETING = "meeting", "Meeting"
        EMAIL = "email", "Email"
        STAGE_CHANGE = "stage_change", "Stage change"

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="activities")
    author = models.ForeignKey(
        "identity.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.NOTE)
    body = models.TextField(blank=True, default="")

    class Meta:
        db_table = "crm_lead_activities"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.lead_id} · {self.kind}"


class FollowUpTask(BaseModel):
    """A dated follow-up on a lead, assigned to a staff member."""

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="follow_ups")
    assignee = models.ForeignKey(
        "identity.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="follow_up_tasks",
    )
    title = models.CharField(max_length=255)
    due_at = models.DateTimeField()
    done = models.BooleanField(default=False)
    done_at = models.DateTimeField(null=True, blank=True)
    # Set when a due reminder has fired, so the daily sweep never double-notifies.
    reminder_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "crm_follow_up_tasks"
        ordering = ["due_at"]
        indexes = [models.Index(fields=["assignee", "done", "due_at"])]

    def __str__(self):
        return f"{self.title} → {self.due_at:%Y-%m-%d}"


# Tag / TaggedItem live in tags.py; import so Django discovers them as crm models.
from .tags import Tag, TaggedItem  # noqa: E402,F401
