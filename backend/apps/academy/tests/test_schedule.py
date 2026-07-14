"""
DSAT LMS v2 — Class schedule materialize tests (5.2b)
Domain: Academy
Covers: materialize creates future sessions on the right weekday, is idempotent,
        and skips inactive rules / inactive classes.
"""

import datetime as dt
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings

from apps.academy.models import ClassScheduleRule, ClassSession
from apps.academy.schedule import materialize_class_sessions
from apps.academy.tests.factories import ClassFactory

pytestmark = pytest.mark.django_db

TZ = ZoneInfo(settings.TIME_ZONE)


def _rule(klass, weekday, active=True):
    return ClassScheduleRule.objects.create(
        klass=klass,
        weekday=weekday,
        start_time=dt.time(9, 0),
        end_time=dt.time(10, 30),
        title="Algebra",
        is_active=active,
    )


class TestMaterialize:
    def test_creates_future_sessions_on_weekday(self):
        klass = ClassFactory()
        # Pick a weekday that is NOT today so every occurrence is strictly future.
        from django.utils import timezone

        today_wd = timezone.now().astimezone(TZ).date().weekday()
        weekday = (today_wd + 1) % 7
        _rule(klass, weekday)

        created = materialize_class_sessions()
        assert created >= 1
        sessions = ClassSession.objects.filter(klass=klass)
        assert sessions.exists()
        for s in sessions:
            assert s.starts_at.astimezone(TZ).date().weekday() == weekday
            assert s.title == "Algebra"

    def test_idempotent(self):
        klass = ClassFactory()
        from django.utils import timezone

        weekday = (timezone.now().astimezone(TZ).date().weekday() + 2) % 7
        _rule(klass, weekday)
        first = materialize_class_sessions()
        before = ClassSession.objects.count()
        second = materialize_class_sessions()
        assert second == 0
        assert ClassSession.objects.count() == before and first >= 1

    def test_inactive_rule_skipped(self):
        klass = ClassFactory()
        _rule(klass, 0, active=False)
        materialize_class_sessions()
        assert not ClassSession.objects.filter(klass=klass).exists()

    def test_inactive_class_skipped(self):
        klass = ClassFactory(is_active=False)
        _rule(klass, 0)
        materialize_class_sessions()
        assert not ClassSession.objects.filter(klass=klass).exists()
