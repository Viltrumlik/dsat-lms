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

from datetime import timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from .availability import generate_slots
from .enums import BookingStatus, Priority, RecSeverity, RecStatus, TicketStatus
from .models import (
    SessionRating,
    SupportBooking,
    SupportRecommendation,
    SupportTicket,
    SupportTicketAttachment,
    TicketReply,
)
from .rules import evaluate_rules

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
    *,
    student,
    teacher,
    subject,
    scheduled_at,
    topic="",
    reason="",
    duration_minutes=None,
    recommendation=None,
):
    """Create a PENDING booking for `student` with `teacher` at `scheduled_at`.

    The slot must be a real, free slot per generate_slots (freshness + availability
    + not-already-taken in one check). Raises ValueError('slot_unavailable') if not,
    or ValueError('slot_taken') if the unique constraint trips on a race.

    If `recommendation` (an owned SupportRecommendation) is given, the booking links
    it and — server-authoritatively — flips a NEW recommendation to ACTED.
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
                source_recommendation=recommendation,
            )
            if recommendation is not None and recommendation.status == RecStatus.NEW:
                recommendation.status = RecStatus.ACTED
                recommendation.booking = booking
                recommendation.save(update_fields=["status", "booking", "updated_at"])
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


# ─────────────────────────────────────
# Tickets (S2 — Ask a Question)
# ─────────────────────────────────────

_ALLOWED_TICKET_TRANSITIONS = {
    TicketStatus.OPEN: {TicketStatus.CLOSED},
    TicketStatus.ANSWERED: {TicketStatus.CLOSED},
    TicketStatus.CLOSED: {TicketStatus.OPEN},
}


def create_ticket(*, student, subject, body, priority=Priority.NORMAL, attachment_ids=None):
    """Create an OPEN ticket and link the student's own attachments. Raises
    ValueError('invalid_attachment') if an id isn't a live file owned by the
    student (so a ticket can't reference someone else's private file)."""
    from apps.files.models import Attachment

    attachments = []
    for att_id in attachment_ids or []:
        att = Attachment.objects.filter(pk=att_id, owner=student, deleted_at__isnull=True).first()
        if att is None:
            raise ValueError("invalid_attachment")
        attachments.append(att)

    with transaction.atomic():
        ticket = SupportTicket.objects.create(
            student=student, subject=subject, body=body, priority=priority
        )
        for att in attachments:
            SupportTicketAttachment.objects.create(ticket=ticket, attachment=att)
    return ticket


def add_ticket_reply(ticket, *, author, body, is_staff_answer):
    """Append a message to the thread. The first staff answer stamps `answered_at`
    (immutable) and flips status to ANSWERED; `last_reply_at` always bumps.
    Replying to a CLOSED ticket is rejected. Notifies the counterparty."""
    if ticket.status == TicketStatus.CLOSED:
        raise ValueError("ticket_closed")

    now = timezone.now()
    reply = TicketReply.objects.create(
        ticket=ticket, author=author, body=body, is_staff_answer=is_staff_answer
    )
    update_fields = ["last_reply_at", "updated_at"]
    ticket.last_reply_at = now
    if is_staff_answer and ticket.answered_at is None:
        ticket.answered_at = now
        ticket.status = TicketStatus.ANSWERED
        update_fields += ["answered_at", "status"]
    ticket.save(update_fields=update_fields)

    _notify_ticket_reply(ticket, is_staff_answer=is_staff_answer)
    return reply


def change_ticket_status(ticket, new_status, *, by=None):
    """Close (open/answered → closed) or reopen (closed → open). Raises
    ValueError('same_status' | 'invalid_transition'). ANSWERED is only reachable
    via the first staff answer, never set manually here."""
    if new_status == ticket.status:
        raise ValueError("same_status")
    if new_status not in _ALLOWED_TICKET_TRANSITIONS.get(ticket.status, set()):
        raise ValueError("invalid_transition")
    ticket.status = new_status
    ticket.save(update_fields=["status", "updated_at"])
    return ticket


def assign_ticket(ticket, assignee):
    """Assign the ticket to a staff member (or None to return it to the pool)."""
    ticket.assigned_to = assignee
    ticket.save(update_fields=["assigned_to", "updated_at"])
    return ticket


def _notify_ticket_reply(ticket, *, is_staff_answer):
    from apps.notifications.models import Notification
    from apps.notifications.services import notify

    data = {"ticket_id": str(ticket.id), "subject": ticket.subject}
    if is_staff_answer:
        # Staff answered → notify the student.
        notify(
            ticket.student,
            Notification.Type.SUPPORT_REPLY,
            "New reply to your question",
            data={**data, "url": f"/support/tickets/{ticket.id}"},
        )
    elif ticket.assigned_to_id:
        # Student replied on an assigned ticket → notify the assignee.
        notify(
            ticket.assigned_to,
            Notification.Type.SUPPORT_REPLY,
            "New reply on a support ticket",
            data={
                **data,
                "student_name": ticket.student.get_full_name(),
                "url": "/teacher/support?tab=questions",
            },
        )


# ─────────────────────────────────────
# Proactive trigger sweep (S4)
# ─────────────────────────────────────

RECOMMENDATION_TTL_DAYS = 14
_SEVERITY_RANK = {RecSeverity.INFO: 0, RecSeverity.WARNING: 1, RecSeverity.CRITICAL: 2}


def dismiss_recommendation(recommendation):
    """Student dismisses a NEW recommendation. Raises ValueError('not_active') if
    it isn't dismissible (already acted/expired/dismissed)."""
    if recommendation.status != RecStatus.NEW:
        raise ValueError("not_active")
    recommendation.status = RecStatus.DISMISSED
    recommendation.save(update_fields=["status", "updated_at"])
    return recommendation


def _recommendation_data(rec):
    from urllib.parse import urlencode

    params = {}
    if rec.subject:
        params["subject"] = rec.subject
    if rec.topic:
        params["topic"] = rec.topic
    params["rec"] = str(rec.id)
    return {
        "url": "/support/book?" + urlencode(params),
        "recommendation_id": str(rec.id),
        "rule_key": rec.rule_key,
        "severity": rec.severity,
        "subject": rec.subject,
        "topic": rec.topic,
    }


def run_support_sweep():
    """Daily proactive trigger. Reads the whole active-enrolled cohort's signals in
    a fixed number of grouped queries (N-independent), fires the rules, dedupes on
    (student, rule_key) against live recommendations, and notifies each student at
    most once — for the highest-severity NEW recommendation. Expiry of stale NEW
    recommendations is folded in. Returns a summary dict."""
    from apps.academy.models import ClassEnrollment
    from apps.analytics.services import _batch_signals, batch_weak_topics
    from apps.identity.models import User
    from apps.notifications.models import Notification
    from apps.notifications.services import notify

    now = timezone.now()
    expired = SupportRecommendation.objects.filter(status=RecStatus.NEW, expires_at__lt=now).update(
        status=RecStatus.EXPIRED, updated_at=now
    )

    student_ids = list(
        ClassEnrollment.objects.filter(status=ClassEnrollment.Status.ACTIVE)
        .values_list("student_id", flat=True)
        .distinct()
    )
    if not student_ids:
        return {"students": 0, "created": 0, "notified": 0, "expired": expired}

    signals = _batch_signals(student_ids)
    weak = batch_weak_topics(student_ids)
    # Live (new/acted) recommendations already held, so we never duplicate a rule.
    existing = set(
        SupportRecommendation.objects.filter(
            student_id__in=student_ids, status__in=[RecStatus.NEW, RecStatus.ACTED]
        ).values_list("student_id", "rule_key")
    )
    users = User.objects.in_bulk(student_ids)
    expires_at = now + timedelta(days=RECOMMENDATION_TTL_DAYS)

    created = 0
    notified = 0
    for sid in student_ids:
        fired = evaluate_rules(signals.get(sid, {}), weak.get(sid, []))
        fresh = []
        for rec_dict in fired:
            if (sid, rec_dict["rule_key"]) in existing:
                continue
            rec = SupportRecommendation.objects.create(
                student_id=sid, expires_at=expires_at, **rec_dict
            )
            existing.add((sid, rec_dict["rule_key"]))
            fresh.append(rec)
            created += 1
        if fresh:
            top = max(fresh, key=lambda r: _SEVERITY_RANK.get(r.severity, 0))
            notif = notify(
                users[sid],
                Notification.Type.SUPPORT_RECOMMENDATION,
                "A support session could help",
                data=_recommendation_data(top),
            )
            top.notification = notif
            top.save(update_fields=["notification", "updated_at"])
            notified += 1

    return {
        "students": len(student_ids),
        "created": created,
        "notified": notified,
        "expired": expired,
    }
