"""
DSAT LMS v2 — Support services (S1 booking)
Domain: Support
Description: Server-authoritative booking logic. create_booking validates the slot
    against generate_slots (the single slot definition) and blocks double-booking;
    change_booking_status guards the status lifecycle (copying the academy
    change_student_status pattern: _ALLOWED_TRANSITIONS + ValueError codes that
    views translate to 400s) and stamps the matching *_at timestamp; rate_booking
    enforces "completed only, once". Booking transitions fire the booking_*
    notifications (no_show intentionally sends none — there is no such type).
"""

from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from .availability import generate_slots
from .enums import BookingStatus
from .models import SessionRating, SupportBooking

# Allowed status moves. completed / cancelled / no_show are terminal.
_ALLOWED_TRANSITIONS = {
    BookingStatus.PENDING: {BookingStatus.CONFIRMED, BookingStatus.CANCELLED},
    BookingStatus.CONFIRMED: {
        BookingStatus.COMPLETED,
        BookingStatus.NO_SHOW,
        BookingStatus.CANCELLED,
    },
    BookingStatus.COMPLETED: set(),
    BookingStatus.CANCELLED: set(),
    BookingStatus.NO_SHOW: set(),
}

_STATUS_STAMP = {
    BookingStatus.CONFIRMED: "confirmed_at",
    BookingStatus.COMPLETED: "completed_at",
    BookingStatus.CANCELLED: "cancelled_at",
}


def create_booking(
    *, student, teacher, subject, scheduled_at, topic="", reason="", duration_minutes=None
):
    """Create a PENDING booking for `student` with `teacher` at `scheduled_at`.

    The slot must be a real, free slot per generate_slots (freshness + availability
    + not-already-taken in one check). Raises ValueError('slot_unavailable') if not,
    or ValueError('slot_taken') if the unique constraint trips on a race.
    """
    tz = ZoneInfo(settings.TIME_ZONE)
    day = scheduled_at.astimezone(tz).date()
    match = next(
        (
            s
            for s in generate_slots(teacher, subject, start=day, end=day)
            if s["scheduled_at"] == scheduled_at
        ),
        None,
    )
    if match is None:
        raise ValueError("slot_unavailable")

    try:
        with transaction.atomic():
            booking = SupportBooking.objects.create(
                student=student,
                teacher=teacher,
                subject=subject,
                scheduled_at=scheduled_at,
                duration_minutes=match["duration_minutes"],
                topic=topic,
                reason=reason,
            )
    except IntegrityError:
        raise ValueError("slot_taken") from None

    _notify(
        booking.teacher,
        "BOOKING_REQUESTED",
        "New session request",
        booking,
        url="/teacher/support",
    )
    return booking


def change_booking_status(booking, new_status, *, by=None):
    """Move `booking` to `new_status` (guarded), stamping the matching *_at field
    and firing the counterparty notification. `confirmed → no_show` requires the
    slot to be in the past. Raises ValueError('same_status' | 'invalid_transition'
    | 'too_early') on a rejected move."""
    current = booking.status
    if new_status == current:
        raise ValueError("same_status")
    if new_status not in _ALLOWED_TRANSITIONS.get(current, set()):
        raise ValueError("invalid_transition")
    if new_status == BookingStatus.NO_SHOW and booking.scheduled_at >= timezone.now():
        raise ValueError("too_early")

    now = timezone.now()
    update_fields = ["status", "updated_at"]
    booking.status = new_status
    stamp = _STATUS_STAMP.get(new_status)
    if stamp:
        setattr(booking, stamp, now)
        update_fields.append(stamp)
    booking.save(update_fields=update_fields)

    _notify_transition(booking, new_status, by=by)
    return booking


def rate_booking(booking, *, score, comment=""):
    """Record the student's 1–5 rating for a COMPLETED booking (once).
    Raises ValueError('not_completed' | 'already_rated')."""
    if booking.status != BookingStatus.COMPLETED:
        raise ValueError("not_completed")
    if SessionRating.objects.filter(booking=booking).exists():
        raise ValueError("already_rated")
    return SessionRating.objects.create(booking=booking, score=score, comment=comment)


# ─────────────────────────────────────
# Notifications (lazy imports — support → notifications is a one-way dep)
# ─────────────────────────────────────


def _booking_data(booking, *, url):
    return {
        "url": url,
        "booking_id": str(booking.id),
        "subject": booking.subject,
        "scheduled_at": booking.scheduled_at.isoformat(),
        "topic": booking.topic,
        "teacher_name": booking.teacher.get_full_name(),
        "student_name": booking.student.get_full_name(),
    }


def _notify(recipient, type_name, title, booking, *, url):
    from apps.notifications.models import Notification
    from apps.notifications.services import notify

    notify(
        recipient,
        getattr(Notification.Type, type_name),
        title,
        data=_booking_data(booking, url=url),
    )


def _notify_transition(booking, new_status, *, by):
    if new_status == BookingStatus.CONFIRMED:
        _notify(
            booking.student,
            "BOOKING_CONFIRMED",
            "Session confirmed",
            booking,
            url="/support/sessions",
        )
    elif new_status == BookingStatus.COMPLETED:
        _notify(
            booking.student,
            "BOOKING_COMPLETED",
            "Session completed",
            booking,
            url="/support/sessions",
        )
    elif new_status == BookingStatus.CANCELLED:
        actor_is_student = by is not None and by.id == booking.student_id
        if actor_is_student:
            _notify(
                booking.teacher,
                "BOOKING_CANCELLED",
                "Session cancelled",
                booking,
                url="/teacher/support",
            )
        else:
            _notify(
                booking.student,
                "BOOKING_CANCELLED",
                "Session cancelled",
                booking,
                url="/support/sessions",
            )
    # NO_SHOW sends no notification (no such Notification.Type by design).
