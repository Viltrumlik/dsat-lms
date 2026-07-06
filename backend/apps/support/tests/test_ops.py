"""
DSAT LMS v2 — Support S7 admin ops dashboard tests
Domain: Support
Covers: build_support_ops_daily flow metrics (bookings created/completed/cancelled/
    no-show, ratings, tickets created/answered + avg response, office-hours sessions/
    attendance, recommendation funnel); rollup idempotency; the admin overview
    endpoint (IsAdmin gate → teacher 403; summary reuses S3 metrics; continuous
    daily series of length `days`); the rebuild endpoint.
"""

from datetime import time, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.tests.factories import AdminUserFactory, UserFactory
from apps.support.enums import BookingStatus
from apps.support.models import (
    OfficeHour,
    OfficeHourAttendance,
    OfficeHourSession,
    SessionRating,
    SupportBooking,
    SupportOpsDaily,
    SupportRecommendation,
    SupportTicket,
    TicketReply,
)
from apps.support.ops import build_support_ops_daily, run_support_ops_rollup

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/support-ops/"


def authed(role="student", user=None):
    user = user or (AdminUserFactory() if role == "admin" else UserFactory(role=role))
    client = APIClient()
    client.force_authenticate(user)
    client.user = user
    return client


def _booking(teacher, student, status, **kwargs):
    return SupportBooking.objects.create(
        teacher=teacher,
        student=student,
        subject="math",
        scheduled_at=kwargs.pop("scheduled_at", timezone.now()),
        status=status,
        **kwargs,
    )


def _office_session(teacher, **kwargs):
    now = timezone.now()
    oh = OfficeHour.objects.create(
        teacher=teacher,
        subject="math",
        title="Drop-in",
        weekday=now.weekday(),
        start_time=time(15, 0),
        end_time=time(16, 0),
    )
    return OfficeHourSession.objects.create(
        office_hour=oh,
        teacher=teacher,
        subject="math",
        title="Drop-in",
        starts_at=kwargs.pop("starts_at", now),
        ends_at=now + timedelta(hours=1),
        capacity=25,
        **kwargs,
    )


class TestBuildRollup:
    def test_flow_metrics(self):
        teacher = UserFactory(role="teacher")
        student = UserFactory(role="student")
        now = timezone.now()

        _booking(teacher, student, BookingStatus.PENDING)  # created today
        completed = _booking(teacher, student, BookingStatus.COMPLETED, completed_at=now)
        _booking(teacher, student, BookingStatus.CANCELLED, cancelled_at=now)
        _booking(teacher, student, BookingStatus.NO_SHOW, scheduled_at=now)
        SessionRating.objects.create(booking=completed, score=4)

        rec = SupportRecommendation.objects.create(student=student, rule_key="inactive_days")
        _booking(teacher, student, BookingStatus.PENDING, source_recommendation=rec)

        ticket = SupportTicket.objects.create(student=student, subject="math", body="Help")
        SupportTicket.objects.create(
            student=student, subject="math", body="Answered", answered_at=now
        )
        TicketReply.objects.create(ticket=ticket, author=teacher, body="Hi", is_staff_answer=True)

        session = _office_session(teacher)
        OfficeHourAttendance.objects.create(session=session, student=student, attended=True)

        row = build_support_ops_daily(timezone.localdate())
        assert row.bookings_created == 5  # 4 + the rec-sourced one
        assert row.bookings_completed == 1
        assert row.bookings_cancelled == 1
        assert row.bookings_no_show == 1
        assert row.ratings_count == 1 and float(row.ratings_avg) == 4.0
        assert row.tickets_created == 2
        assert row.tickets_answered == 1
        assert row.office_hours_sessions == 1
        assert row.office_hours_attended == 1
        assert row.recommendations_created == 1
        assert row.recommendations_acted == 1

    def test_idempotent_upsert(self):
        teacher = UserFactory(role="teacher")
        _booking(teacher, UserFactory(role="student"), BookingStatus.PENDING)
        today = timezone.localdate()
        build_support_ops_daily(today)
        build_support_ops_daily(today)
        assert SupportOpsDaily.objects.filter(date=today).count() == 1
        assert SupportOpsDaily.objects.get(date=today).bookings_created == 1

    def test_empty_day_is_zeros_not_null_counts(self):
        row = build_support_ops_daily(timezone.localdate())
        assert row.bookings_created == 0
        assert row.ratings_avg is None  # averages stay null on no data
        assert row.tickets_avg_response_minutes is None

    def test_run_rollup_defaults_to_today(self):
        summary = run_support_ops_rollup()
        assert summary["date"] == timezone.localdate().isoformat()


class TestOverviewEndpoint:
    def test_requires_admin(self):
        assert authed(role="teacher").get(BASE).status_code == 403
        assert authed(role="academic_manager").get(BASE).status_code == 403
        assert authed(role="admin").get(BASE).status_code == 200

    def test_summary_and_series_shape(self):
        teacher = UserFactory(role="teacher")
        _booking(teacher, UserFactory(role="student"), BookingStatus.COMPLETED)
        data = authed(role="admin").get(BASE + "?days=7").json()["data"]
        assert data["summary"]["bookings"]["by_status"]["completed"] == 1
        assert "tickets" in data["summary"] and "office_hours" in data["summary"]
        assert "recommendations" in data["summary"]
        assert len(data["daily"]) == 7
        assert data["daily"][-1]["date"] == timezone.localdate().isoformat()

    def test_days_param_clamped(self):
        data = authed(role="admin").get(BASE + "?days=9999").json()["data"]
        assert len(data["daily"]) == 90  # _MAX_DAYS

    def test_rebuild_populates_today(self):
        teacher = UserFactory(role="teacher")
        _booking(teacher, UserFactory(role="student"), BookingStatus.PENDING)
        data = authed(role="admin").post(BASE + "rebuild/").json()["data"]
        assert data["daily"][-1]["bookings_created"] == 1
        assert SupportOpsDaily.objects.filter(date=timezone.localdate()).exists()
