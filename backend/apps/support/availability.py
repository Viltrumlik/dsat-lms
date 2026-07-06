"""
DSAT LMS v2 — Support slot generation
Domain: Support
Description: The ONE definition of what a bookable slot is. generate_slots()
    materializes a teacher's active weekly TeacherAvailability windows into
    concrete datetime slots for a subject over a date range, in settings.TIME_ZONE
    (NOT per-user User.timezone, which stays display-only). It skips past slots and
    slots already held by a live booking. Both the student slots endpoint and
    (later) utilization analytics import this — there must never be two slot
    definitions.
"""

from datetime import datetime, timedelta
from datetime import time as dtime
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone

from .enums import BookingStatus
from .models import SupportBooking, TeacherAvailability


def generate_slots(teacher, subject, *, start, end):
    """Bookable slots for `teacher` + `subject` over the inclusive date range
    [start, end] (both `datetime.date`), in settings.TIME_ZONE.

    Returns a time-sorted list of ``{"scheduled_at": <aware datetime>,
    "duration_minutes": int}``. Slots in the past (<= now) and slots already held
    by a live (pending/confirmed) booking are omitted.
    """
    tz = ZoneInfo(settings.TIME_ZONE)
    now = timezone.now()

    windows = list(
        TeacherAvailability.objects.filter(teacher=teacher, subject=subject, is_active=True)
    )
    if not windows:
        return []

    # Live bookings in the range whose exact scheduled_at should be excluded.
    # Aware-datetime hash/equality is instant-based, so membership works even
    # though the DB returns these in UTC while slots are built in settings.TIME_ZONE.
    taken = set(
        SupportBooking.objects.filter(
            teacher=teacher,
            status__in=[BookingStatus.PENDING, BookingStatus.CONFIRMED],
            scheduled_at__gte=datetime.combine(start, dtime.min, tzinfo=tz),
            scheduled_at__lte=datetime.combine(end, dtime.max, tzinfo=tz),
        ).values_list("scheduled_at", flat=True)
    )

    slots = []
    day = start
    while day <= end:
        for window in windows:
            if window.weekday != day.weekday():
                continue
            step = timedelta(minutes=window.slot_minutes)
            cursor = datetime.combine(day, window.start_time, tzinfo=tz)
            window_end = datetime.combine(day, window.end_time, tzinfo=tz)
            while cursor + step <= window_end:
                if cursor > now and cursor not in taken:
                    slots.append({"scheduled_at": cursor, "duration_minutes": window.slot_minutes})
                cursor += step
        day += timedelta(days=1)

    slots.sort(key=lambda s: s["scheduled_at"])
    return slots
