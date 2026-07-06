"""
DSAT LMS v2 — Support ops rollup + admin overview (S7)
Domain: Support
Description: The admin ops dashboard's data layer. `build_support_ops_daily` upserts
    one SupportOpsDaily row of FLOW metrics for a date — everything counts what
    HAPPENED that day (reconstructable from timestamps), so a rollup is
    deterministic and backfillable. `admin_support_overview` composes the LIVE
    platform-wide KPIs (reusing the S3 booking_metrics/ticket_metrics over the full
    tables) plus a continuous daily series for the trend chart. Admin-only surface.
"""

import datetime as dt
from datetime import datetime
from datetime import time as dtime
from statistics import mean
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import Avg, Count
from django.utils import timezone

from .analytics_services import booking_metrics, ticket_metrics
from .enums import BookingStatus, RecStatus, SessionStatus
from .models import (
    OfficeHourAttendance,
    OfficeHourSession,
    SessionRating,
    SupportBooking,
    SupportOpsDaily,
    SupportRecommendation,
    SupportTicket,
)

# Integer flow fields carried verbatim into the daily series (zeros when absent).
_DAILY_INT_FIELDS = (
    "bookings_created",
    "bookings_completed",
    "bookings_cancelled",
    "bookings_no_show",
    "ratings_count",
    "tickets_created",
    "tickets_answered",
    "office_hours_sessions",
    "office_hours_attended",
    "recommendations_created",
    "recommendations_acted",
)
# Nullable averages — coerced to float so the client gets numbers, not strings.
_DAILY_FLOAT_FIELDS = ("ratings_avg", "tickets_avg_response_minutes")


def _day_bounds(target_date):
    """[start, end) aware datetimes spanning target_date in settings.TIME_ZONE."""
    tz = ZoneInfo(settings.TIME_ZONE)
    start = datetime.combine(target_date, dtime.min, tzinfo=tz)
    return start, start + dt.timedelta(days=1)


def build_support_ops_daily(target_date):
    """Compute + upsert the SupportOpsDaily flow row for `target_date`. Idempotent
    (update_or_create on the unique date). Returns the row."""
    start, end = _day_bounds(target_date)

    def _in_day(manager_or_qs, field):
        return manager_or_qs.filter(**{f"{field}__gte": start, f"{field}__lt": end})

    bookings = SupportBooking.objects
    tickets = SupportTicket.objects

    # Bookings (each by its own event timestamp)
    bookings_created = _in_day(bookings, "created_at").count()
    bookings_completed = _in_day(bookings, "completed_at").count()
    bookings_cancelled = _in_day(bookings, "cancelled_at").count()
    bookings_no_show = _in_day(
        bookings.filter(status=BookingStatus.NO_SHOW), "scheduled_at"
    ).count()

    ratings = _in_day(SessionRating.objects, "created_at")
    ratings_count = ratings.count()
    ratings_avg = ratings.aggregate(avg=Avg("score"))["avg"]

    # Tickets — response time only for the ones ANSWERED that day.
    tickets_created = _in_day(tickets, "created_at").count()
    answered = list(_in_day(tickets, "answered_at").values_list("created_at", "answered_at"))
    tickets_answered = len(answered)
    response_minutes = [(a - c).total_seconds() / 60 for c, a in answered if a and c]
    tickets_avg_response = round(mean(response_minutes), 1) if response_minutes else None

    # Office hours — sessions HELD that day (not cancelled) + attendance marked.
    office_hours_sessions = (
        OfficeHourSession.objects.filter(starts_at__gte=start, starts_at__lt=end)
        .exclude(status=SessionStatus.CANCELED)
        .count()
    )
    office_hours_attended = OfficeHourAttendance.objects.filter(
        session__starts_at__gte=start, session__starts_at__lt=end, attended=True
    ).count()

    # Trigger funnel — recs raised that day vs. recs a booking acted on that day.
    recommendations_created = _in_day(SupportRecommendation.objects, "created_at").count()
    recommendations_acted = _in_day(
        bookings.filter(source_recommendation__isnull=False), "created_at"
    ).count()

    row, _ = SupportOpsDaily.objects.update_or_create(
        date=target_date,
        defaults={
            "bookings_created": bookings_created,
            "bookings_completed": bookings_completed,
            "bookings_cancelled": bookings_cancelled,
            "bookings_no_show": bookings_no_show,
            "ratings_count": ratings_count,
            "ratings_avg": round(ratings_avg, 2) if ratings_avg is not None else None,
            "tickets_created": tickets_created,
            "tickets_answered": tickets_answered,
            "tickets_avg_response_minutes": tickets_avg_response,
            "office_hours_sessions": office_hours_sessions,
            "office_hours_attended": office_hours_attended,
            "recommendations_created": recommendations_created,
            "recommendations_acted": recommendations_acted,
        },
    )
    return row


def run_support_ops_rollup(target_date=None):
    """Roll up a single date (default: today in settings.TIME_ZONE). Returns a
    summary dict for the task/command."""
    target_date = target_date or timezone.localdate()
    row = build_support_ops_daily(target_date)
    return {
        "date": str(target_date),
        "bookings_created": row.bookings_created,
        "tickets_created": row.tickets_created,
    }


def _serialize_day(date, row):
    """One point of the daily series (zeros/None for a day with no rollup row)."""
    if row is None:
        data = {field: 0 for field in _DAILY_INT_FIELDS}
        data.update({field: None for field in _DAILY_FLOAT_FIELDS})
    else:
        data = {field: getattr(row, field) for field in _DAILY_INT_FIELDS}
        for field in _DAILY_FLOAT_FIELDS:
            value = getattr(row, field)
            data[field] = float(value) if value is not None else None
    data["date"] = date.isoformat()
    return data


def admin_support_overview(days=30):
    """Live platform-wide KPIs + a continuous last-`days` daily series."""
    today = timezone.localdate()
    now = timezone.now()

    summary = {
        "bookings": booking_metrics(SupportBooking.objects.all()),
        "tickets": ticket_metrics(SupportTicket.objects.all()),
        "office_hours": {
            "upcoming_sessions": OfficeHourSession.objects.filter(
                status=SessionStatus.SCHEDULED, starts_at__gte=now
            ).count(),
            "total_attended": OfficeHourAttendance.objects.filter(attended=True).count(),
        },
        "recommendations": _recommendation_funnel(),
    }

    start_date = today - dt.timedelta(days=days - 1)
    rows = {
        row.date: row
        for row in SupportOpsDaily.objects.filter(date__gte=start_date, date__lte=today)
    }
    daily = [
        _serialize_day(day, rows.get(day))
        for day in (start_date + dt.timedelta(days=i) for i in range(days))
    ]

    return {"summary": summary, "daily": daily}


def _recommendation_funnel():
    by_status = {status: 0 for status in RecStatus.values}
    for row in SupportRecommendation.objects.values("status").annotate(n=Count("id")):
        by_status[row["status"]] = row["n"]
    return {"total": sum(by_status.values()), "by_status": by_status}
