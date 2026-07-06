"""
DSAT LMS v2 — Support S3 analytics tests
Domain: Support
Covers: student self-summary; staff KPIs (teacher own-scope vs. full-access all);
    no-show rate / avg rating / avg wait / avg response computed correctly; empty
    data → null (never 0.0); utilization reuses generate_slots; teacher stats are
    row-scoped (don't leak another teacher's bookings).
"""

from datetime import time, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.tests.factories import UserFactory
from apps.support.enums import BookingStatus
from apps.support.models import (
    SessionRating,
    SupportBooking,
    SupportTicket,
    TeacherAvailability,
    TicketReply,
)

pytestmark = pytest.mark.django_db

BASE = "/api/v1/support/"


def authed(role="student", user=None):
    user = user or UserFactory(role=role)
    client = APIClient()
    client.force_authenticate(user)
    client.user = user
    return client


def booking(teacher, student, status, **kwargs):
    return SupportBooking.objects.create(
        teacher=teacher,
        student=student,
        subject="math",
        scheduled_at=kwargs.pop("scheduled_at", timezone.now() + timedelta(days=1)),
        status=status,
        **kwargs,
    )


class TestStaffAnalytics:
    def test_no_show_rate_and_status_counts(self):
        teacher = UserFactory(role="teacher")
        student = UserFactory(role="student")
        booking(teacher, student, BookingStatus.COMPLETED)
        booking(teacher, student, BookingStatus.NO_SHOW)
        data = authed(role="teacher", user=teacher).get(BASE + "staff/analytics/").json()["data"]
        assert data["scope"] == "own"
        assert data["bookings"]["by_status"]["completed"] == 1
        assert data["bookings"]["by_status"]["no_show"] == 1
        assert data["bookings"]["no_show_rate"] == 0.5

    def test_avg_wait_minutes(self):
        teacher = UserFactory(role="teacher")
        b = booking(teacher, UserFactory(role="student"), BookingStatus.CONFIRMED)
        b.confirmed_at = b.created_at + timedelta(minutes=20)
        b.save(update_fields=["confirmed_at"])
        data = authed(role="teacher", user=teacher).get(BASE + "staff/analytics/").json()["data"]
        assert data["bookings"]["avg_wait_minutes"] == 20.0

    def test_avg_rating(self):
        teacher = UserFactory(role="teacher")
        b = booking(teacher, UserFactory(role="student"), BookingStatus.COMPLETED)
        SessionRating.objects.create(booking=b, score=4)
        data = authed(role="teacher", user=teacher).get(BASE + "staff/analytics/").json()["data"]
        assert data["bookings"]["avg_rating"] == 4.0

    def test_empty_metrics_are_null_not_zero(self):
        teacher = UserFactory(role="teacher")
        data = authed(role="teacher", user=teacher).get(BASE + "staff/analytics/").json()["data"]
        assert data["bookings"]["no_show_rate"] is None
        assert data["bookings"]["avg_rating"] is None
        assert data["bookings"]["avg_wait_minutes"] is None

    def test_teacher_scope_excludes_other_teachers(self):
        mine = UserFactory(role="teacher")
        booking(mine, UserFactory(role="student"), BookingStatus.COMPLETED)
        booking(UserFactory(role="teacher"), UserFactory(role="student"), BookingStatus.COMPLETED)
        data = authed(role="teacher", user=mine).get(BASE + "staff/analytics/").json()["data"]
        assert data["bookings"]["total"] == 1

    def test_utilization_from_availability(self):
        teacher = UserFactory(role="teacher")
        for weekday in range(7):
            TeacherAvailability.objects.create(
                teacher=teacher,
                subject="math",
                weekday=weekday,
                start_time=time(9, 0),
                end_time=time(17, 0),
                slot_minutes=30,
            )
        booking(teacher, UserFactory(role="student"), BookingStatus.CONFIRMED)
        data = authed(role="teacher", user=teacher).get(BASE + "staff/analytics/").json()["data"]
        util = data["bookings"]["utilization"]
        assert util is not None and 0 < util <= 1

    def test_utilization_null_without_capacity(self):
        teacher = UserFactory(role="teacher")
        data = authed(role="teacher", user=teacher).get(BASE + "staff/analytics/").json()["data"]
        assert data["bookings"]["utilization"] is None

    def test_admin_sees_all_scope(self):
        booking(UserFactory(role="teacher"), UserFactory(role="student"), BookingStatus.COMPLETED)
        booking(UserFactory(role="teacher"), UserFactory(role="student"), BookingStatus.COMPLETED)
        data = authed(role="admin").get(BASE + "staff/analytics/").json()["data"]
        assert data["scope"] == "all"
        assert data["bookings"]["total"] == 2
        assert data["bookings"]["utilization"] is None  # per-teacher metric, N/A for aggregate

    def test_ticket_metrics_and_answered_by_me(self):
        teacher = UserFactory(role="teacher")
        student = UserFactory(role="student")
        ticket = SupportTicket.objects.create(
            student=student, subject="math", body="q", assigned_to=teacher
        )
        TicketReply.objects.create(ticket=ticket, author=teacher, body="a", is_staff_answer=True)
        data = authed(role="teacher", user=teacher).get(BASE + "staff/analytics/").json()["data"]
        assert data["tickets"]["total"] == 1
        assert data["tickets"]["answered_by_me"] == 1

    def test_student_forbidden(self):
        assert authed(role="student").get(BASE + "staff/analytics/").status_code == 403


class TestStudentSummary:
    def test_summary_counts(self):
        client = authed(role="student")
        teacher = UserFactory(role="teacher")
        booking(teacher, client.user, BookingStatus.COMPLETED)
        booking(teacher, client.user, BookingStatus.CONFIRMED)  # upcoming (future)
        SupportTicket.objects.create(student=client.user, subject="math", body="q")
        data = client.get(BASE + "analytics/").json()["data"]
        assert data["sessions"]["total"] == 2
        assert data["sessions"]["completed"] == 1
        assert data["sessions"]["upcoming"] == 1
        assert data["tickets"]["total"] == 1
        assert data["tickets"]["open"] == 1

    def test_avg_rating_given_null_when_none(self):
        client = authed(role="student")
        data = client.get(BASE + "analytics/").json()["data"]
        assert data["sessions"]["avg_rating_given"] is None

    def test_staff_forbidden_on_student_summary(self):
        assert authed(role="teacher").get(BASE + "analytics/").status_code == 403
