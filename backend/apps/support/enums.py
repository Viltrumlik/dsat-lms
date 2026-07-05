"""
DSAT LMS v2 — Support Center shared enums
Domain: Support
Description: The single source of truth for every choice set used across the
    support domain (booking, tickets, office hours, recommendations). Defined
    once here and imported by models/serializers/services so no two modules ever
    disagree on a value.

Spelling note (intentional — do NOT "fix"): the booking/ticket lifecycle uses
    British `cancelled`, while the office-hours / session-occurrence lifecycle
    uses American `canceled`. They live on different models, and the matching
    Notification.Type values mirror the split (booking_cancelled vs
    office_hours_canceled).
"""

from django.db import models


class Subject(models.TextChoices):
    """SAT subject a support interaction is about (mirrors the two SAT modules)."""

    MATH = "math", "Math"
    READING_WRITING = "reading_writing", "Reading & Writing"


class BookingStatus(models.TextChoices):
    """Lifecycle of a 1:1 SupportBooking."""

    PENDING = "pending", "Pending"
    CONFIRMED = "confirmed", "Confirmed"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    NO_SHOW = "no_show", "No-show"


class TicketStatus(models.TextChoices):
    """Lifecycle of an async SupportTicket."""

    OPEN = "open", "Open"
    ANSWERED = "answered", "Answered"
    CLOSED = "closed", "Closed"


class Priority(models.TextChoices):
    """Triage priority for a SupportTicket."""

    LOW = "low", "Low"
    NORMAL = "normal", "Normal"
    HIGH = "high", "High"


class RSVPStatus(models.TextChoices):
    """A student's RSVP state for an OfficeHourSession occurrence."""

    JOINED = "joined", "Joined"
    LEFT = "left", "Left"


class SessionStatus(models.TextChoices):
    """Lifecycle of a dated OfficeHourSession occurrence."""

    SCHEDULED = "scheduled", "Scheduled"
    CANCELED = "canceled", "Canceled"
    COMPLETED = "completed", "Completed"


class RecSeverity(models.TextChoices):
    """Severity of a proactive SupportRecommendation (aligned to analytics risk)."""

    INFO = "info", "Info"
    WARNING = "warning", "Warning"
    CRITICAL = "critical", "Critical"


class RecStatus(models.TextChoices):
    """Lifecycle of a proactive SupportRecommendation."""

    NEW = "new", "New"
    ACTED = "acted", "Acted"
    DISMISSED = "dismissed", "Dismissed"
    EXPIRED = "expired", "Expired"
    SUPERSEDED = "superseded", "Superseded"
