"""
DSAT LMS v2 — Office Hours logic (S5)
Domain: Support
Description: Materialize recurring OfficeHour templates into dated sessions; RSVP
    join/leave (capacity-guarded via select_for_update — full race safety is
    Postgres-only, SQLite dev/CI can't enforce it); cancel (notifies joined
    students); daily reminders (deduped via reminder_sent_at); attendance marking.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .enums import RSVPStatus, SessionStatus
from .models import OfficeHour, OfficeHourAttendance, OfficeHourSession

MATERIALIZE_DAYS_AHEAD = 14
REMINDER_WINDOW_HOURS = 24


def materialize_office_hours(days_ahead=MATERIALIZE_DAYS_AHEAD):
    """Create OfficeHourSession occurrences for every active template over the next
    `days_ahead` days, snapshotting the template fields. Idempotent —
    get_or_create on (office_hour, starts_at). Returns the count created."""
    tz = ZoneInfo(settings.TIME_ZONE)
    now = timezone.now()
    start = now.astimezone(tz).date()
    created = 0
    for oh in OfficeHour.objects.filter(is_active=True):
        for offset in range(days_ahead + 1):
            day = start + timedelta(days=offset)
            if day.weekday() != oh.weekday:
                continue
            starts_at = datetime.combine(day, oh.start_time, tzinfo=tz)
            if starts_at <= now:
                continue
            ends_at = datetime.combine(day, oh.end_time, tzinfo=tz)
            _, was_created = OfficeHourSession.objects.get_or_create(
                office_hour=oh,
                starts_at=starts_at,
                defaults={
                    "teacher": oh.teacher,
                    "subject": oh.subject,
                    "title": oh.title,
                    "ends_at": ends_at,
                    "capacity": oh.capacity,
                    "location": oh.location,
                    "join_url": oh.join_url,
                },
            )
            created += int(was_created)
    return created


def joined_count(session):
    """Number of students currently JOINED (the capacity denominator)."""
    return session.attendances.filter(rsvp=RSVPStatus.JOINED).count()


def join_office_hour(session, student):
    """RSVP a student into a SCHEDULED session (capacity-guarded, idempotent).
    Raises ValueError('not_open' | 'full')."""
    with transaction.atomic():
        locked = OfficeHourSession.objects.select_for_update().get(pk=session.pk)
        if locked.status != SessionStatus.SCHEDULED:
            raise ValueError("not_open")
        existing = OfficeHourAttendance.objects.filter(session=locked, student=student).first()
        if existing and existing.rsvp == RSVPStatus.JOINED:
            return existing
        current = OfficeHourAttendance.objects.filter(
            session=locked, rsvp=RSVPStatus.JOINED
        ).count()
        if current >= locked.capacity:
            raise ValueError("full")
        if existing:
            existing.rsvp = RSVPStatus.JOINED
            existing.save(update_fields=["rsvp", "updated_at"])
            return existing
        return OfficeHourAttendance.objects.create(
            session=locked, student=student, rsvp=RSVPStatus.JOINED
        )


def leave_office_hour(session, student):
    """Flip a student's RSVP to LEFT (frees a seat). No-op if not joined."""
    att = OfficeHourAttendance.objects.filter(session=session, student=student).first()
    if att and att.rsvp == RSVPStatus.JOINED:
        att.rsvp = RSVPStatus.LEFT
        att.save(update_fields=["rsvp", "updated_at"])
    return att


def cancel_office_hour_session(session):
    """Cancel a SCHEDULED session and notify every joined student. Raises
    ValueError('not_scheduled') if it isn't cancellable."""
    if session.status != SessionStatus.SCHEDULED:
        raise ValueError("not_scheduled")
    session.status = SessionStatus.CANCELED
    session.save(update_fields=["status", "updated_at"])
    _notify_joined(session, "OFFICE_HOURS_CANCELED", "Office hours canceled")
    return session


def send_office_hour_reminders(window_hours=REMINDER_WINDOW_HOURS):
    """Remind joined students of scheduled sessions starting within `window_hours`,
    once (deduped via reminder_sent_at). Returns the count reminded."""
    now = timezone.now()
    horizon = now + timedelta(hours=window_hours)
    sessions = OfficeHourSession.objects.filter(
        status=SessionStatus.SCHEDULED,
        reminder_sent_at__isnull=True,
        starts_at__gt=now,
        starts_at__lte=horizon,
    )
    reminded = 0
    for session in sessions:
        _notify_joined(session, "OFFICE_HOURS_REMINDER", "Office hours reminder")
        session.reminder_sent_at = now
        session.save(update_fields=["reminder_sent_at", "updated_at"])
        reminded += 1
    return reminded


def mark_attendance(session, student, attended):
    """Teacher marks whether a joined student attended. Raises
    ValueError('not_joined')."""
    att = OfficeHourAttendance.objects.filter(session=session, student=student).first()
    if att is None:
        raise ValueError("not_joined")
    att.attended = attended
    att.save(update_fields=["attended", "updated_at"])
    return att


def _session_data(session, *, url):
    return {
        "url": url,
        "session_id": str(session.id),
        "title": session.title,
        "subject": session.subject,
        "starts_at": session.starts_at.isoformat(),
    }


def _notify_joined(session, type_name, title):
    from apps.notifications.models import Notification
    from apps.notifications.services import notify

    ntype = getattr(Notification.Type, type_name)
    for att in session.attendances.filter(rsvp=RSVPStatus.JOINED).select_related("student"):
        notify(att.student, ntype, title, data=_session_data(session, url="/support/office-hours"))
