"""
DSAT LMS v2 — Class schedule logic (5.2b)
Domain: Academy
Description: Materialize recurring ClassScheduleRule templates into dated
    ClassSessions (mirrors support/office_hours.py). Idempotent — get_or_create on
    (class, starts_at); past occurrences and inactive classes are skipped.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone

from .models import ClassScheduleRule, ClassSession

MATERIALIZE_DAYS_AHEAD = 14


def materialize_class_sessions(days_ahead=MATERIALIZE_DAYS_AHEAD):
    """Create ClassSession occurrences for every active rule (on an active class)
    over the next `days_ahead` days, snapshotting the rule + class teacher.
    Idempotent. Returns the count created."""
    tz = ZoneInfo(settings.TIME_ZONE)
    now = timezone.now()
    start = now.astimezone(tz).date()
    created = 0
    for rule in ClassScheduleRule.objects.filter(is_active=True).select_related("klass"):
        if not rule.klass.is_active:
            continue
        for offset in range(days_ahead + 1):
            day = start + timedelta(days=offset)
            if day.weekday() != rule.weekday:
                continue
            starts_at = datetime.combine(day, rule.start_time, tzinfo=tz)
            if starts_at <= now:
                continue
            ends_at = datetime.combine(day, rule.end_time, tzinfo=tz) if rule.end_time else None
            _, was_created = ClassSession.objects.get_or_create(
                klass=rule.klass,
                starts_at=starts_at,
                defaults={
                    "teacher": rule.klass.teacher,
                    "title": rule.title,
                    "ends_at": ends_at,
                    "location": rule.location,
                },
            )
            created += int(was_created)
    return created
