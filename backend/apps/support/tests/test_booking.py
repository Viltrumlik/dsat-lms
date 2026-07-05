"""
DSAT LMS v2 — Support S1 "Book a Teacher" tests
Domain: Support
Covers: generate_slots (materialization, past-skip, taken-skip), teacher
    availability CRUD + validation, bookable-teacher/slot discovery, booking
    create (slot legality + no-double-book), the change_booking_status lifecycle
    (valid/invalid/same/no-show time guard), student cancel + own-only scoping,
    rating (completed-only, once), outcome notes visibility split, staff row
    scoping (own booking vs 404), and booking notifications.
"""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.tests.factories import UserFactory
from apps.notifications.models import Notification
from apps.support.availability import generate_slots
from apps.support.enums import BookingStatus
from apps.support.models import (
    SessionOutcome,
    SessionRating,
    SupportBooking,
    TeacherAvailability,
)
from apps.support.services import change_booking_status, create_booking

pytestmark = pytest.mark.django_db

BASE = "/api/v1/support/"
TZ = ZoneInfo(settings.TIME_ZONE)


def authed(role="student", user=None):
    user = user or UserFactory(role=role)
    client = APIClient()
    client.force_authenticate(user)
    client.user = user
    return client


def teacher_with_hours(subject="math", slot_minutes=30):
    """A teacher available 09:00–17:00 every weekday for `subject`."""
    teacher = UserFactory(role="teacher")
    for weekday in range(7):
        TeacherAvailability.objects.create(
            teacher=teacher,
            subject=subject,
            weekday=weekday,
            start_time=time(9, 0),
            end_time=time(17, 0),
            slot_minutes=slot_minutes,
        )
    return teacher


def first_slot(teacher, subject="math"):
    start = timezone.now().astimezone(TZ).date()
    slots = generate_slots(teacher, subject, start=start, end=start + timedelta(days=3))
    assert slots, "expected at least one bookable slot"
    return slots[0]["scheduled_at"]


# ─────────────────────────────────────
# generate_slots
# ─────────────────────────────────────


class TestGenerateSlots:
    def test_materializes_windows(self):
        teacher = teacher_with_hours(slot_minutes=60)
        start = timezone.now().astimezone(TZ).date()
        slots = generate_slots(teacher, "math", start=start, end=start + timedelta(days=1))
        assert slots
        assert all(s["duration_minutes"] == 60 for s in slots)
        # sorted ascending
        times = [s["scheduled_at"] for s in slots]
        assert times == sorted(times)

    def test_skips_past_slots(self):
        teacher = teacher_with_hours()
        start = timezone.now().astimezone(TZ).date()
        slots = generate_slots(teacher, "math", start=start, end=start + timedelta(days=1))
        assert all(s["scheduled_at"] > timezone.now() for s in slots)

    def test_skips_taken_slots(self):
        teacher = teacher_with_hours()
        student = UserFactory(role="student")
        slot = first_slot(teacher)
        SupportBooking.objects.create(
            student=student,
            teacher=teacher,
            subject="math",
            scheduled_at=slot,
            status=BookingStatus.PENDING,
        )
        start = timezone.now().astimezone(TZ).date()
        remaining = generate_slots(teacher, "math", start=start, end=start + timedelta(days=3))
        assert slot not in [s["scheduled_at"] for s in remaining]

    def test_no_windows_no_slots(self):
        teacher = UserFactory(role="teacher")
        start = timezone.now().astimezone(TZ).date()
        assert generate_slots(teacher, "math", start=start, end=start + timedelta(days=7)) == []

    def test_inactive_window_ignored(self):
        teacher = UserFactory(role="teacher")
        TeacherAvailability.objects.create(
            teacher=teacher,
            subject="math",
            weekday=timezone.now().astimezone(TZ).weekday(),
            start_time=time(9, 0),
            end_time=time(17, 0),
            slot_minutes=30,
            is_active=False,
        )
        start = timezone.now().astimezone(TZ).date()
        assert generate_slots(teacher, "math", start=start, end=start + timedelta(days=1)) == []


# ─────────────────────────────────────
# Availability endpoints
# ─────────────────────────────────────


class TestAvailability:
    def test_teacher_creates_and_lists(self):
        client = authed(role="teacher")
        r = client.post(
            BASE + "availability/",
            {"subject": "math", "weekday": 1, "start_time": "09:00", "end_time": "12:00"},
            format="json",
        )
        assert r.status_code == 201, r.content
        assert r.json()["data"]["slot_minutes"] == 30
        listing = client.get(BASE + "availability/")
        assert len(listing.json()["data"]) == 1

    def test_end_before_start_rejected(self):
        client = authed(role="teacher")
        r = client.post(
            BASE + "availability/",
            {"subject": "math", "weekday": 1, "start_time": "12:00", "end_time": "09:00"},
            format="json",
        )
        assert r.status_code == 400

    def test_bad_weekday_rejected(self):
        client = authed(role="teacher")
        r = client.post(
            BASE + "availability/",
            {"subject": "math", "weekday": 9, "start_time": "09:00", "end_time": "12:00"},
            format="json",
        )
        assert r.status_code == 400

    def test_student_cannot_publish_hours(self):
        assert authed(role="student").get(BASE + "availability/").status_code == 403

    def test_delete_is_soft(self):
        client = authed(role="teacher")
        avail = TeacherAvailability.objects.create(
            teacher=client.user,
            subject="math",
            weekday=1,
            start_time=time(9, 0),
            end_time=time(12, 0),
        )
        r = client.delete(BASE + f"availability/{avail.id}/")
        assert r.status_code == 204
        assert not TeacherAvailability.objects.filter(id=avail.id).exists()
        assert TeacherAvailability.all_objects.filter(id=avail.id).exists()

    def test_cannot_touch_another_teachers_window(self):
        other = teacher_with_hours()
        avail = TeacherAvailability.objects.filter(teacher=other).first()
        r = authed(role="teacher").delete(BASE + f"availability/{avail.id}/")
        assert r.status_code == 404


# ─────────────────────────────────────
# Discovery
# ─────────────────────────────────────


class TestDiscovery:
    def test_bookable_teachers_by_subject(self):
        teacher_with_hours(subject="math")
        teacher_with_hours(subject="reading_writing")
        client = authed(role="student")
        r = client.get(BASE + "bookable-teachers/?subject=math")
        assert r.status_code == 200
        data = r.json()["data"]
        assert len(data) == 1
        assert data[0]["subjects"] == ["math"]

    def test_slots_endpoint(self):
        teacher = teacher_with_hours()
        client = authed(role="student")
        r = client.get(BASE + f"slots/?teacher={teacher.id}&subject=math&days=2")
        assert r.status_code == 200
        assert len(r.json()["data"]) > 0

    def test_slots_requires_params(self):
        client = authed(role="student")
        assert client.get(BASE + "slots/").status_code == 400


# ─────────────────────────────────────
# Booking create
# ─────────────────────────────────────


class TestBookingCreate:
    def test_happy_path_and_notifies_teacher(self):
        teacher = teacher_with_hours()
        client = authed(role="student")
        slot = first_slot(teacher)
        r = client.post(
            BASE + "bookings/",
            {
                "teacher": str(teacher.id),
                "subject": "math",
                "scheduled_at": slot.isoformat(),
                "topic": "Circles",
            },
            format="json",
        )
        assert r.status_code == 201, r.content
        body = r.json()["data"]
        assert body["status"] == "pending"
        assert body["teacher"]["id"] == str(teacher.id)
        assert Notification.objects.filter(
            user=teacher, type=Notification.Type.BOOKING_REQUESTED
        ).exists()

    def test_invalid_slot_rejected(self):
        teacher = teacher_with_hours()
        client = authed(role="student")
        # 03:00 is outside the 09:00–17:00 window
        start = timezone.now().astimezone(TZ).date() + timedelta(days=1)
        bogus = datetime.combine(start, time(3, 0), tzinfo=TZ)
        r = client.post(
            BASE + "bookings/",
            {"teacher": str(teacher.id), "subject": "math", "scheduled_at": bogus.isoformat()},
            format="json",
        )
        assert r.status_code == 400

    def test_second_booking_of_same_slot_rejected_via_api(self):
        teacher = teacher_with_hours()
        slot = first_slot(teacher)
        create_booking(
            student=UserFactory(role="student"), teacher=teacher, subject="math", scheduled_at=slot
        )
        # Slot is now taken → generate_slots omits it → slot_unavailable.
        r = authed(role="student").post(
            BASE + "bookings/",
            {"teacher": str(teacher.id), "subject": "math", "scheduled_at": slot.isoformat()},
            format="json",
        )
        assert r.status_code == 400

    def test_db_constraint_blocks_double_live_booking(self):
        teacher = teacher_with_hours()
        slot = first_slot(teacher)
        SupportBooking.objects.create(
            student=UserFactory(role="student"),
            teacher=teacher,
            subject="math",
            scheduled_at=slot,
            status=BookingStatus.PENDING,
        )
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                SupportBooking.objects.create(
                    student=UserFactory(role="student"),
                    teacher=teacher,
                    subject="math",
                    scheduled_at=slot,
                    status=BookingStatus.CONFIRMED,
                )

    def test_cancelled_slot_frees_up(self):
        teacher = teacher_with_hours()
        slot = first_slot(teacher)
        b = SupportBooking.objects.create(
            student=UserFactory(role="student"),
            teacher=teacher,
            subject="math",
            scheduled_at=slot,
            status=BookingStatus.PENDING,
        )
        change_booking_status(b, BookingStatus.CANCELLED, by=b.student)
        # A cancelled booking is not "live", so the partial unique index frees it.
        SupportBooking.objects.create(
            student=UserFactory(role="student"),
            teacher=teacher,
            subject="math",
            scheduled_at=slot,
            status=BookingStatus.PENDING,
        )


# ─────────────────────────────────────
# Status lifecycle
# ─────────────────────────────────────


def _booking(status=BookingStatus.PENDING, scheduled_at=None):
    return SupportBooking.objects.create(
        student=UserFactory(role="student"),
        teacher=UserFactory(role="teacher"),
        subject="math",
        scheduled_at=scheduled_at or (timezone.now() + timedelta(days=1)),
        status=status,
    )


class TestStatusLifecycle:
    def test_valid_chain(self):
        b = _booking(scheduled_at=timezone.now() - timedelta(hours=1))
        change_booking_status(b, BookingStatus.CONFIRMED)
        assert b.confirmed_at is not None
        change_booking_status(b, BookingStatus.COMPLETED)
        assert b.completed_at is not None
        assert b.status == "completed"

    def test_invalid_transition(self):
        b = _booking()
        with pytest.raises(ValueError, match="invalid_transition"):
            change_booking_status(b, BookingStatus.COMPLETED)

    def test_same_status(self):
        b = _booking()
        with pytest.raises(ValueError, match="same_status"):
            change_booking_status(b, BookingStatus.PENDING)

    def test_no_show_time_guard(self):
        b = _booking(
            status=BookingStatus.CONFIRMED, scheduled_at=timezone.now() + timedelta(hours=2)
        )
        with pytest.raises(ValueError, match="too_early"):
            change_booking_status(b, BookingStatus.NO_SHOW)

    def test_no_show_allowed_after_time(self):
        b = _booking(
            status=BookingStatus.CONFIRMED, scheduled_at=timezone.now() - timedelta(hours=1)
        )
        change_booking_status(b, BookingStatus.NO_SHOW)
        assert b.status == "no_show"

    def test_confirm_notifies_student(self):
        b = _booking()
        change_booking_status(b, BookingStatus.CONFIRMED)
        assert Notification.objects.filter(
            user=b.student, type=Notification.Type.BOOKING_CONFIRMED
        ).exists()

    def test_no_show_sends_no_notification(self):
        b = _booking(
            status=BookingStatus.CONFIRMED, scheduled_at=timezone.now() - timedelta(hours=1)
        )
        before = Notification.objects.count()
        change_booking_status(b, BookingStatus.NO_SHOW)
        assert Notification.objects.count() == before


# ─────────────────────────────────────
# Student booking endpoints
# ─────────────────────────────────────


class TestStudentBookingViews:
    def test_cancel_own(self):
        client = authed(role="student")
        b = SupportBooking.objects.create(
            student=client.user,
            teacher=UserFactory(role="teacher"),
            subject="math",
            scheduled_at=timezone.now() + timedelta(days=1),
        )
        r = client.post(BASE + f"bookings/{b.id}/cancel/")
        assert r.status_code == 200
        assert r.json()["data"]["status"] == "cancelled"

    def test_cannot_see_others_booking(self):
        b = SupportBooking.objects.create(
            student=UserFactory(role="student"),
            teacher=UserFactory(role="teacher"),
            subject="math",
            scheduled_at=timezone.now() + timedelta(days=1),
        )
        assert authed(role="student").get(BASE + f"bookings/{b.id}/").status_code == 404

    def test_list_only_own(self):
        client = authed(role="student")
        SupportBooking.objects.create(
            student=client.user,
            teacher=UserFactory(role="teacher"),
            subject="math",
            scheduled_at=timezone.now() + timedelta(days=1),
        )
        SupportBooking.objects.create(
            student=UserFactory(role="student"),
            teacher=UserFactory(role="teacher"),
            subject="math",
            scheduled_at=timezone.now() + timedelta(days=1),
        )
        r = client.get(BASE + "bookings/")
        assert len(r.json()["data"]) == 1


# ─────────────────────────────────────
# Rating
# ─────────────────────────────────────


class TestRating:
    def _completed(self, student):
        return SupportBooking.objects.create(
            student=student,
            teacher=UserFactory(role="teacher"),
            subject="math",
            scheduled_at=timezone.now() - timedelta(hours=1),
            status=BookingStatus.COMPLETED,
        )

    def test_rate_completed(self):
        client = authed(role="student")
        b = self._completed(client.user)
        r = client.post(
            BASE + f"bookings/{b.id}/rate/", {"score": 5, "comment": "Great"}, format="json"
        )
        assert r.status_code == 201
        assert SessionRating.objects.filter(booking=b, score=5).exists()

    def test_cannot_rate_pending(self):
        client = authed(role="student")
        b = SupportBooking.objects.create(
            student=client.user,
            teacher=UserFactory(role="teacher"),
            subject="math",
            scheduled_at=timezone.now() + timedelta(days=1),
        )
        assert (
            client.post(BASE + f"bookings/{b.id}/rate/", {"score": 5}, format="json").status_code
            == 400
        )

    def test_cannot_rate_twice(self):
        client = authed(role="student")
        b = self._completed(client.user)
        client.post(BASE + f"bookings/{b.id}/rate/", {"score": 4}, format="json")
        assert (
            client.post(BASE + f"bookings/{b.id}/rate/", {"score": 3}, format="json").status_code
            == 400
        )

    def test_score_out_of_range_rejected(self):
        client = authed(role="student")
        b = self._completed(client.user)
        assert (
            client.post(BASE + f"bookings/{b.id}/rate/", {"score": 6}, format="json").status_code
            == 400
        )


# ─────────────────────────────────────
# Staff booking management + scoping + outcome notes
# ─────────────────────────────────────


def _live_booking(teacher, status=BookingStatus.PENDING):
    return SupportBooking.objects.create(
        student=UserFactory(role="student"),
        teacher=teacher,
        subject="math",
        scheduled_at=timezone.now() + timedelta(days=1),
        status=status,
    )


class TestStaffViews:
    def test_teacher_sees_only_own_bookings(self):
        mine = teacher_with_hours()
        _live_booking(mine)
        _live_booking(teacher_with_hours())  # someone else's
        client = authed(role="teacher", user=mine)
        r = client.get(BASE + "staff/bookings/")
        assert len(r.json()["data"]) == 1

    def test_teacher_cannot_act_on_another_teachers_booking(self):
        other_booking = _live_booking(teacher_with_hours())
        client = authed(role="teacher")  # a different teacher
        r = client.post(
            BASE + f"staff/bookings/{other_booking.id}/status/",
            {"status": "confirmed"},
            format="json",
        )
        assert r.status_code == 404

    def test_admin_sees_all_and_confirms(self):
        booking = _live_booking(teacher_with_hours())
        client = authed(role="admin")
        r = client.post(
            BASE + f"staff/bookings/{booking.id}/status/",
            {"status": "confirmed"},
            format="json",
        )
        assert r.status_code == 200
        assert r.json()["data"]["status"] == "confirmed"

    def test_complete_sets_actual_duration(self):
        teacher = teacher_with_hours()
        booking = _live_booking(teacher, status=BookingStatus.CONFIRMED)
        client = authed(role="teacher", user=teacher)
        r = client.post(
            BASE + f"staff/bookings/{booking.id}/status/",
            {"status": "completed", "actual_duration_minutes": 45},
            format="json",
        )
        assert r.status_code == 200
        booking.refresh_from_db()
        assert booking.actual_duration_minutes == 45

    def test_outcome_notes_hidden_from_student_shown_to_staff(self):
        teacher = teacher_with_hours()
        student = UserFactory(role="student")
        booking = SupportBooking.objects.create(
            student=student,
            teacher=teacher,
            subject="math",
            scheduled_at=timezone.now() - timedelta(hours=1),
            status=BookingStatus.COMPLETED,
        )
        # Teacher writes the outcome incl. staff-only notes
        staff = authed(role="teacher", user=teacher)
        r = staff.post(
            BASE + f"staff/bookings/{booking.id}/outcome/",
            {"topics_covered": "Circles", "notes": "Private note"},
            format="json",
        )
        assert r.status_code == 200
        assert "notes" in r.json()["data"]
        # Student read omits notes
        sclient = APIClient()
        sclient.force_authenticate(student)
        detail = sclient.get(BASE + f"bookings/{booking.id}/")
        outcome = detail.json()["data"]["outcome"]
        assert outcome["topics_covered"] == "Circles"
        assert "notes" not in outcome

    def test_outcome_upsert(self):
        teacher = teacher_with_hours()
        booking = _live_booking(teacher, status=BookingStatus.CONFIRMED)
        client = authed(role="teacher", user=teacher)
        client.post(
            BASE + f"staff/bookings/{booking.id}/outcome/", {"topics_covered": "A"}, format="json"
        )
        client.post(
            BASE + f"staff/bookings/{booking.id}/outcome/", {"topics_covered": "B"}, format="json"
        )
        assert SessionOutcome.objects.filter(booking=booking).count() == 1
        assert SessionOutcome.objects.get(booking=booking).topics_covered == "B"
