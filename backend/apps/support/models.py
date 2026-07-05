"""
DSAT LMS v2 — Support Center models
Domain: Support
Description: S1 "Book a Teacher" — 1:1 support scheduling. TeacherAvailability
    (a teacher opts into being bookable by publishing weekly hours per subject),
    SupportBooking (a student's booked slot with a server-authoritative status
    lifecycle), SessionOutcome (the teacher's post-session write-up; `notes` is
    staff-only — see the two outcome serializers), and SessionRating (the student
    rates a completed session). Shared choice sets live in apps/support/enums.py.

    Later slices add their own models here: SupportTicket/TicketReply (S2),
    SupportRecommendation (S4 — the `source_recommendation` FK on SupportBooking
    lands then), OfficeHour* (S5), SupportOpsDaily (S7). The mentor layer lives in
    apps/academy, not here (avoids a support→academy→support model dependency).
"""

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from common.models import BaseModel

from .enums import BookingStatus, Subject


class TeacherAvailability(BaseModel):
    """A recurring weekly window in which a teacher offers 1:1 support for a
    subject. Publishing an active window is how a teacher opts into being bookable
    — there is no separate teacher directory. `weekday` uses Python's convention
    (0 = Monday … 6 = Sunday, matching date.weekday()); slots are materialized in
    settings.TIME_ZONE by support/availability.py::generate_slots."""

    teacher = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="support_availabilities",
    )
    subject = models.CharField(max_length=20, choices=Subject.choices)
    weekday = models.PositiveSmallIntegerField()  # 0=Mon … 6=Sun (date.weekday())
    start_time = models.TimeField()
    end_time = models.TimeField()
    slot_minutes = models.PositiveSmallIntegerField(default=30)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "support_teacher_availability"
        ordering = ["weekday", "start_time"]
        indexes = [
            models.Index(fields=["subject", "is_active"]),
            models.Index(fields=["teacher", "is_active"]),
        ]

    def __str__(self):
        return (
            f"{self.teacher_id} {self.subject} wd={self.weekday} {self.start_time}-{self.end_time}"
        )


class SupportBooking(BaseModel):
    """A student's 1:1 support session with a teacher. Format is in-person with an
    optional `join_url` (no meeting integration). Status is server-authoritative —
    only support/services.py::change_booking_status may move it, stamping the
    matching *_at timestamp. `actual_duration_minutes` is filled at completion.
    A partial unique index blocks double-booking a teacher's slot while a live
    booking (pending/confirmed) holds it."""

    student = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="support_bookings",
    )
    teacher = models.ForeignKey(
        "identity.User",
        on_delete=models.PROTECT,
        related_name="support_teaching_bookings",
    )
    subject = models.CharField(max_length=20, choices=Subject.choices)
    topic = models.CharField(max_length=200, blank=True, default="")
    reason = models.TextField(blank=True, default="")
    scheduled_at = models.DateTimeField()
    duration_minutes = models.PositiveSmallIntegerField(default=30)
    actual_duration_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=BookingStatus.choices,
        default=BookingStatus.PENDING,
        db_index=True,
    )
    # Stamped by change_booking_status — analytics reads these directly, so they
    # live on the row rather than being reconstructed from an audit log.
    confirmed_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    join_url = models.URLField(blank=True, default="")

    class Meta:
        db_table = "support_bookings"
        ordering = ["-scheduled_at"]
        indexes = [
            models.Index(fields=["student", "status"]),
            models.Index(fields=["teacher", "status"]),
            models.Index(fields=["teacher", "scheduled_at"]),
        ]
        constraints = [
            # No-double-book: at most one LIVE (pending/confirmed) booking may hold
            # a given teacher slot. Full race-safety is Postgres-only (needs
            # select_for_update); the partial unique index is the durable backstop.
            models.UniqueConstraint(
                fields=["teacher", "scheduled_at"],
                condition=models.Q(status__in=["pending", "confirmed"], deleted_at__isnull=True),
                name="uniq_support_teacher_slot_live",
            ),
        ]

    def __str__(self):
        return f"Booking<{self.student_id}→{self.teacher_id}> {self.scheduled_at} ({self.status})"


class SessionOutcome(BaseModel):
    """A teacher's write-up after a completed session. `topics_covered`,
    `homework`, and `next_recommendation` are student-visible; `notes` is
    staff-only — visibility is enforced by serializing student reads with
    StudentOutcomeSerializer (which omits `notes`), NOT by any field comment."""

    booking = models.OneToOneField(SupportBooking, on_delete=models.CASCADE, related_name="outcome")
    topics_covered = models.TextField(blank=True, default="")
    homework = models.TextField(blank=True, default="")
    next_recommendation = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")  # staff-only

    class Meta:
        db_table = "support_session_outcomes"

    def __str__(self):
        return f"Outcome<{self.booking_id}>"


class SessionRating(BaseModel):
    """A student's 1–5 rating of a completed session (rates the teacher). Only a
    completed booking may be rated; one rating per booking."""

    booking = models.OneToOneField(SupportBooking, on_delete=models.CASCADE, related_name="rating")
    score = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment = models.TextField(blank=True, default="")

    class Meta:
        db_table = "support_session_ratings"

    def __str__(self):
        return f"Rating<{self.booking_id}> {self.score}★"
