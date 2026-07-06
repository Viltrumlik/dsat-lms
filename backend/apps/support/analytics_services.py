"""
DSAT LMS v2 — Support analytics (S3)
Domain: Support
Description: Read-only support KPIs over S1 bookings + S2 tickets. Staff metrics are
    row-scoped by the teacher FK (own vs. all, via support/scoping.py); students get
    a light self-summary. Time metrics (waiting/response) are averaged in Python for
    DB-agnostic behavior (Avg over a DurationField differs across SQLite/Postgres);
    empty inputs yield null (never 0.0). Utilization reuses generate_slots — never a
    second slot definition.
"""

from datetime import datetime, timedelta
from datetime import time as dtime
from statistics import mean
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import Avg
from django.utils import timezone

from .availability import generate_slots
from .enums import BookingStatus, TicketStatus
from .models import SessionRating, SupportBooking, SupportTicket, TeacherAvailability, TicketReply
from .scoping import scope_teacher_rows


def _avg_minutes(deltas):
    """Average a list of timedeltas in minutes, or None if empty."""
    values = [d.total_seconds() / 60 for d in deltas if d is not None]
    return round(mean(values), 1) if values else None


def booking_metrics(bookings):
    """Aggregate a booking queryset into counts + rates. `avg_rating` is None (not
    0.0) when there are no ratings; `no_show_rate` is None when there's nothing to
    divide."""
    bookings = list(bookings)
    by_status = {status: 0 for status in BookingStatus.values}
    for booking in bookings:
        by_status[booking.status] = by_status.get(booking.status, 0) + 1

    completed = by_status[BookingStatus.COMPLETED]
    no_show = by_status[BookingStatus.NO_SHOW]
    attended = completed + no_show
    no_show_rate = round(no_show / attended, 3) if attended else None

    waits = [b.confirmed_at - b.created_at for b in bookings if b.confirmed_at]
    avg_rating = (
        SessionRating.objects.filter(booking_id__in=[b.id for b in bookings]).aggregate(
            avg=Avg("score")
        )["avg"]
        if bookings
        else None
    )

    return {
        "total": len(bookings),
        "by_status": by_status,
        "completed": completed,
        "no_show_rate": no_show_rate,
        "avg_rating": round(avg_rating, 2) if avg_rating is not None else None,
        "avg_wait_minutes": _avg_minutes(waits),
    }


def ticket_metrics(tickets):
    """Aggregate a ticket queryset. `avg_response_minutes` = Avg(answered_at −
    created_at) over answered tickets, or None."""
    tickets = list(tickets)
    by_status = {status: 0 for status in TicketStatus.values}
    responses = []
    for ticket in tickets:
        by_status[ticket.status] = by_status.get(ticket.status, 0) + 1
        if ticket.answered_at:
            responses.append(ticket.answered_at - ticket.created_at)

    return {
        "total": len(tickets),
        "open": by_status[TicketStatus.OPEN],
        "answered": by_status[TicketStatus.ANSWERED],
        "closed": by_status[TicketStatus.CLOSED],
        "avg_response_minutes": _avg_minutes(responses),
    }


def utilization(teacher, *, days=14):
    """Forward utilization over the next `days`: future booked / (future booked +
    future free) across the teacher's active subjects. None when there's no
    capacity. Reuses generate_slots for the free side (single slot definition)."""
    tz = ZoneInfo(settings.TIME_ZONE)
    now = timezone.now()
    start = now.astimezone(tz).date()
    end = start + timedelta(days=days - 1)

    subjects = (
        TeacherAvailability.objects.filter(teacher=teacher, is_active=True)
        .values_list("subject", flat=True)
        .distinct()
    )
    free = sum(len(generate_slots(teacher, subject, start=start, end=end)) for subject in subjects)

    window_end = datetime.combine(end, dtime.max, tzinfo=tz)
    booked = SupportBooking.objects.filter(
        teacher=teacher,
        status__in=[BookingStatus.PENDING, BookingStatus.CONFIRMED],
        scheduled_at__gt=now,
        scheduled_at__lte=window_end,
    ).count()

    capacity = free + booked
    return round(booked / capacity, 3) if capacity else None


def staff_support_analytics(request):
    """Support KPIs for a staff member. A teacher sees their own bookings (teacher
    FK) + their assigned tickets; full-access staff see all bookings + all tickets.
    Utilization is per-teacher, so it's null for the aggregate (all) scope."""
    user = request.user
    scope = "all" if user.can_read_all_students else "own"

    bookings = booking_metrics(scope_teacher_rows(request, SupportBooking.objects.all()))
    if scope == "own":
        bookings["utilization"] = utilization(user)
        tickets = ticket_metrics(SupportTicket.objects.filter(assigned_to=user))
        tickets["answered_by_me"] = (
            TicketReply.objects.filter(author=user, is_staff_answer=True)
            .values("ticket")
            .distinct()
            .count()
        )
    else:
        bookings["utilization"] = None
        tickets = ticket_metrics(SupportTicket.objects.all())
        tickets["answered_by_me"] = None

    return {"scope": scope, "bookings": bookings, "tickets": tickets}


def student_support_summary(user):
    """A student's own support usage at a glance."""
    now = timezone.now()
    bookings = list(SupportBooking.objects.filter(student=user))
    upcoming = sum(
        1
        for b in bookings
        if b.status in (BookingStatus.PENDING, BookingStatus.CONFIRMED) and b.scheduled_at >= now
    )
    completed = sum(1 for b in bookings if b.status == BookingStatus.COMPLETED)
    avg_rating_given = SessionRating.objects.filter(booking__student=user).aggregate(
        avg=Avg("score")
    )["avg"]

    tickets = list(SupportTicket.objects.filter(student=user))
    ticket_status = {status: 0 for status in TicketStatus.values}
    for ticket in tickets:
        ticket_status[ticket.status] = ticket_status.get(ticket.status, 0) + 1

    return {
        "sessions": {
            "total": len(bookings),
            "completed": completed,
            "upcoming": upcoming,
            "avg_rating_given": (
                round(avg_rating_given, 2) if avg_rating_given is not None else None
            ),
        },
        "tickets": {
            "total": len(tickets),
            "open": ticket_status[TicketStatus.OPEN],
            "answered": ticket_status[TicketStatus.ANSWERED],
            "closed": ticket_status[TicketStatus.CLOSED],
        },
    }
