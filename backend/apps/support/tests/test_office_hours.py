"""
DSAT LMS v2 — Support S5 Office Hours tests
Domain: Support
Covers: materialize (matching weekday, idempotent, skips past); RSVP join/leave
    (sequential capacity guard — the concurrent race is Postgres-only; idempotent;
    seat freed on leave; not_open on canceled); cancel (notifies joined,
    office_hours_canceled); reminders (window + dedupe via reminder_sent_at);
    attendance marking; browse/join/leave endpoints; teacher template CRUD; roster
    row-scoping (own vs 404).
"""

from datetime import time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.tests.factories import UserFactory
from apps.notifications.models import Notification
from apps.support.models import OfficeHour, OfficeHourAttendance, OfficeHourSession
from apps.support.office_hours import (
    cancel_office_hour_session,
    join_office_hour,
    joined_count,
    leave_office_hour,
    materialize_office_hours,
    send_office_hour_reminders,
)

pytestmark = pytest.mark.django_db

BASE = "/api/v1/support/"
TZ = ZoneInfo(settings.TIME_ZONE)


def authed(role="student", user=None):
    user = user or UserFactory(role=role)
    client = APIClient()
    client.force_authenticate(user)
    client.user = user
    return client


def make_session(*, teacher=None, capacity=2, starts_in_hours=48, status="scheduled"):
    teacher = teacher or UserFactory(role="teacher")
    oh = OfficeHour.objects.create(
        teacher=teacher,
        subject="math",
        title="Drop-in",
        weekday=0,
        start_time=time(9, 0),
        end_time=time(10, 0),
        capacity=capacity,
    )
    starts = timezone.now() + timedelta(hours=starts_in_hours)
    return OfficeHourSession.objects.create(
        office_hour=oh,
        teacher=teacher,
        subject="math",
        title="Drop-in",
        starts_at=starts,
        ends_at=starts + timedelta(hours=1),
        capacity=capacity,
        status=status,
    )


class TestMaterialize:
    def test_materializes_matching_weekday(self):
        teacher = UserFactory(role="teacher")
        tomorrow = timezone.now().astimezone(TZ).date() + timedelta(days=1)
        oh = OfficeHour.objects.create(
            teacher=teacher,
            subject="math",
            title="X",
            weekday=tomorrow.weekday(),
            start_time=time(9, 0),
            end_time=time(10, 0),
        )
        assert materialize_office_hours(days_ahead=7) >= 1
        assert OfficeHourSession.objects.filter(office_hour=oh).exists()

    def test_idempotent(self):
        teacher = UserFactory(role="teacher")
        tomorrow = timezone.now().astimezone(TZ).date() + timedelta(days=1)
        OfficeHour.objects.create(
            teacher=teacher,
            subject="math",
            title="X",
            weekday=tomorrow.weekday(),
            start_time=time(9, 0),
            end_time=time(10, 0),
        )
        materialize_office_hours(days_ahead=7)
        count = OfficeHourSession.objects.count()
        materialize_office_hours(days_ahead=7)
        assert OfficeHourSession.objects.count() == count

    def test_inactive_template_skipped(self):
        teacher = UserFactory(role="teacher")
        tomorrow = timezone.now().astimezone(TZ).date() + timedelta(days=1)
        OfficeHour.objects.create(
            teacher=teacher,
            subject="math",
            title="X",
            weekday=tomorrow.weekday(),
            start_time=time(9, 0),
            end_time=time(10, 0),
            is_active=False,
        )
        assert materialize_office_hours(days_ahead=7) == 0


class TestJoinLeave:
    def test_capacity_guard(self):
        session = make_session(capacity=1)
        join_office_hour(session, UserFactory(role="student"))
        assert joined_count(session) == 1
        with pytest.raises(ValueError, match="full"):
            join_office_hour(session, UserFactory(role="student"))

    def test_join_idempotent(self):
        session = make_session(capacity=2)
        student = UserFactory(role="student")
        join_office_hour(session, student)
        join_office_hour(session, student)
        assert joined_count(session) == 1

    def test_leave_frees_seat(self):
        session = make_session(capacity=1)
        first = UserFactory(role="student")
        join_office_hour(session, first)
        leave_office_hour(session, first)
        assert joined_count(session) == 0
        join_office_hour(session, UserFactory(role="student"))  # seat reused
        assert joined_count(session) == 1

    def test_join_canceled_rejected(self):
        session = make_session(status="canceled")
        with pytest.raises(ValueError, match="not_open"):
            join_office_hour(session, UserFactory(role="student"))


class TestCancelAndReminders:
    def test_cancel_notifies_joined(self):
        session = make_session(capacity=5)
        student = UserFactory(role="student")
        join_office_hour(session, student)
        cancel_office_hour_session(session)
        session.refresh_from_db()
        assert session.status == "canceled"
        assert Notification.objects.filter(
            user=student, type=Notification.Type.OFFICE_HOURS_CANCELED
        ).exists()

    def test_reminders_window_and_dedupe(self):
        session = make_session(capacity=5, starts_in_hours=10)  # within 24h
        student = UserFactory(role="student")
        join_office_hour(session, student)
        assert send_office_hour_reminders() == 1
        assert send_office_hour_reminders() == 0  # deduped via reminder_sent_at
        assert (
            Notification.objects.filter(
                user=student, type=Notification.Type.OFFICE_HOURS_REMINDER
            ).count()
            == 1
        )

    def test_reminders_skip_far_future(self):
        session = make_session(capacity=5, starts_in_hours=48)  # > 24h
        join_office_hour(session, UserFactory(role="student"))
        assert send_office_hour_reminders() == 0


class TestEndpoints:
    def test_browse_shows_upcoming(self):
        make_session(capacity=5)
        r = authed(role="student").get(BASE + "office-hours/")
        assert r.status_code == 200
        assert len(r.json()["data"]) == 1

    def test_join_leave_via_api(self):
        session = make_session(capacity=5)
        client = authed(role="student")
        r = client.post(BASE + f"office-hours/{session.id}/join/")
        assert r.status_code == 200
        assert r.json()["data"]["my_rsvp"] == "joined"
        assert r.json()["data"]["joined_count"] == 1
        left = client.post(BASE + f"office-hours/{session.id}/leave/")
        assert left.json()["data"]["my_rsvp"] == "left"

    def test_full_via_api(self):
        session = make_session(capacity=1)
        join_office_hour(session, UserFactory(role="student"))
        r = authed(role="student").post(BASE + f"office-hours/{session.id}/join/")
        assert r.status_code == 400

    def test_public_forbidden(self):
        assert authed(role="public").get(BASE + "office-hours/").status_code == 403

    def test_teacher_template_create(self):
        r = authed(role="teacher").post(
            BASE + "office-hour-templates/",
            {
                "subject": "math",
                "title": "Drop-in",
                "weekday": 1,
                "start_time": "09:00",
                "end_time": "10:00",
            },
            format="json",
        )
        assert r.status_code == 201

    def test_teacher_roster_scoped(self):
        teacher = UserFactory(role="teacher")
        session = make_session(teacher=teacher, capacity=5)
        join_office_hour(session, UserFactory(role="student"))
        r = authed(role="teacher", user=teacher).get(
            BASE + f"staff/office-hours/{session.id}/roster/"
        )
        assert r.status_code == 200
        assert len(r.json()["data"]["attendees"]) == 1

    def test_cross_teacher_roster_404(self):
        session = make_session(capacity=5)  # a different teacher's session
        r = authed(role="teacher").get(BASE + f"staff/office-hours/{session.id}/roster/")
        assert r.status_code == 404

    def test_cancel_via_api(self):
        teacher = UserFactory(role="teacher")
        session = make_session(teacher=teacher, capacity=5)
        r = authed(role="teacher", user=teacher).post(
            BASE + f"staff/office-hours/{session.id}/cancel/"
        )
        assert r.status_code == 200
        session.refresh_from_db()
        assert session.status == "canceled"

    def test_mark_attendance(self):
        teacher = UserFactory(role="teacher")
        session = make_session(teacher=teacher, capacity=5)
        student = UserFactory(role="student")
        join_office_hour(session, student)
        r = authed(role="teacher", user=teacher).post(
            BASE + f"staff/office-hours/{session.id}/attendance/",
            {"student": str(student.id), "attended": True},
            format="json",
        )
        assert r.status_code == 200
        assert OfficeHourAttendance.objects.get(session=session, student=student).attended is True
