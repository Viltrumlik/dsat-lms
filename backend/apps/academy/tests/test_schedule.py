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
from rest_framework.test import APIClient

from apps.academy.models import ClassScheduleRule, ClassSession
from apps.academy.schedule import materialize_class_sessions
from apps.academy.tests.factories import ClassFactory
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

TZ = ZoneInfo(settings.TIME_ZONE)


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


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


RULES = "/api/v1/teacher/classes/{cid}/schedule-rules/"
RULE = "/api/v1/teacher/schedule-rules/{rid}/"


class TestScheduleRuleEndpoints:
    def test_student_forbidden(self):
        klass = ClassFactory()
        r = client_for(UserFactory(role="student")).get(RULES.format(cid=klass.id))
        assert r.status_code == 403

    def test_teacher_creates_rule_for_own_class(self):
        teacher = UserFactory(role="teacher")
        klass = ClassFactory(teacher=teacher)
        r = client_for(teacher).post(
            RULES.format(cid=klass.id),
            {"weekday": 1, "start_time": "09:00", "end_time": "10:30", "title": "Algebra"},
            format="json",
        )
        assert r.status_code == 201, r.data
        assert ClassScheduleRule.objects.filter(klass=klass, weekday=1).exists()

    def test_teacher_cannot_create_for_other_class_404(self):
        teacher = UserFactory(role="teacher")
        other = ClassFactory(teacher=UserFactory(role="teacher"))
        r = client_for(teacher).post(
            RULES.format(cid=other.id), {"weekday": 1, "start_time": "09:00"}, format="json"
        )
        assert r.status_code == 404

    def test_invalid_weekday_rejected(self):
        teacher = UserFactory(role="teacher")
        klass = ClassFactory(teacher=teacher)
        r = client_for(teacher).post(
            RULES.format(cid=klass.id), {"weekday": 9, "start_time": "09:00"}, format="json"
        )
        assert r.status_code == 400

    def test_out_of_scope_rule_404(self):
        rule = ClassScheduleRule.objects.create(
            klass=ClassFactory(teacher=UserFactory(role="teacher")),
            weekday=0,
            start_time=dt.time(9, 0),
        )
        other = UserFactory(role="teacher")
        assert (
            client_for(other)
            .patch(RULE.format(rid=rule.id), {"title": "x"}, format="json")
            .status_code
            == 404
        )

    def test_delete_is_soft(self):
        teacher = UserFactory(role="teacher")
        rule = ClassScheduleRule.objects.create(
            klass=ClassFactory(teacher=teacher), weekday=0, start_time=dt.time(9, 0)
        )
        assert client_for(teacher).delete(RULE.format(rid=rule.id)).status_code == 204
        assert not ClassScheduleRule.objects.filter(pk=rule.id).exists()
        assert ClassScheduleRule.all_objects.filter(pk=rule.id).exists()

    def test_admin_sees_any_class_rules(self):
        klass = ClassFactory(teacher=UserFactory(role="teacher"))
        ClassScheduleRule.objects.create(klass=klass, weekday=2, start_time=dt.time(9, 0))
        r = client_for(AdminUserFactory()).get(RULES.format(cid=klass.id))
        assert r.status_code == 200 and len(r.data["data"]) == 1
