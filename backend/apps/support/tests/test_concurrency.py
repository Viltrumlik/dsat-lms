"""
DSAT LMS v2 — Support concurrency tests
Domain: Support
Covers: the two places where two students racing each other is the whole point —
        booking the same teacher slot, and taking the last seat in an office hour.

These were designed as Postgres-only from the start (a partial unique index and
`select_for_update`) and then never written, because dev and CI are SQLite. So
the guards shipped unexercised: the code that stops a teacher being
double-booked had no test that two people pressing "book" at the same instant
produces one booking, which is the only scenario it exists for.

They run for real now: the `backend-postgres` CI job, and locally via

    docker compose up -d postgres
    DATABASE_URL=postgres://dsat:dsat@localhost:5432/dsat_db pytest

On SQLite the concurrency cases skip — its writer lock serialises the threads, so
a green run there would prove nothing about Postgres — while the constraint cases
still run, since SQLite has partial unique indexes too.

Threads, not mocks: a lock that is only asserted through a patched call is a lock
you have tested the patch of. Each thread opens its OWN connection — which is why
these need `transaction=True`, and why every thread must close its connection or
the test database cannot be torn down.
"""

import threading
from datetime import time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
from django.db import IntegrityError, connection, connections
from django.utils import timezone

from apps.identity.tests.factories import UserFactory
from apps.support.enums import BookingStatus, RSVPStatus
from apps.support.models import (
    OfficeHour,
    OfficeHourSession,
    SupportBooking,
    TeacherAvailability,
)
from apps.support.office_hours import join_office_hour
from apps.support.services import create_booking

postgres_only = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="Races only mean something on a backend with real concurrent writers; "
    "SQLite serialises them behind one writer lock.",
)


def run_together(work, count):
    """Run `work(i)` in `count` threads released at the same instant.

    A barrier rather than a plain start: threads spawned in a loop tend to run one
    after another, which is exactly the interleaving that would NOT catch the bug.
    Returns the per-thread result or the exception it raised, in thread order.
    """
    barrier = threading.Barrier(count)
    results = [None] * count

    def runner(index):
        try:
            barrier.wait(timeout=10)
            results[index] = work(index)
        except Exception as exc:  # noqa: BLE001 — the raise IS the result here
            results[index] = exc
        finally:
            # Each thread got its own connection; the test DB cannot be dropped
            # while any of them is still open.
            connections.close_all()

    threads = [threading.Thread(target=runner, args=(i,)) for i in range(count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)
    return results


def teacher_with_hours(subject="math"):
    teacher = UserFactory(role="teacher")
    for weekday in range(7):
        TeacherAvailability.objects.create(
            teacher=teacher,
            subject=subject,
            weekday=weekday,
            start_time=time(9, 0),
            end_time=time(17, 0),
            slot_minutes=30,
        )
    return teacher


def free_slot(teacher, subject="math"):
    from apps.support.availability import generate_slots

    start = timezone.now().astimezone(ZoneInfo(settings.TIME_ZONE)).date()
    slots = generate_slots(teacher, subject, start=start, end=start + timedelta(days=3))
    assert slots
    return slots[0]["scheduled_at"]


# ─────────────────────────────────────
# No-double-book
# ─────────────────────────────────────


@pytest.mark.django_db
class TestTheSlotConstraint:
    """The durable backstop, tested without threads: whatever the application
    code does, the DATABASE must refuse a second live booking on a taken slot."""

    def test_a_second_live_booking_on_the_same_slot_is_refused(self):
        teacher = teacher_with_hours()
        slot = free_slot(teacher)
        create_booking(
            student=UserFactory(role="student"),
            teacher=teacher,
            subject="math",
            scheduled_at=slot,
        )
        with pytest.raises(IntegrityError):
            SupportBooking.objects.create(
                student=UserFactory(role="student"),
                teacher=teacher,
                subject="math",
                scheduled_at=slot,
                duration_minutes=30,
                status=BookingStatus.PENDING,
            )

    def test_a_cancelled_booking_frees_the_slot(self):
        """The constraint is partial for a reason — a cancelled booking is not a
        held slot, and if it kept blocking, a student who cancelled would have
        taken that teacher's hour away from everyone for good."""
        teacher = teacher_with_hours()
        slot = free_slot(teacher)
        first = create_booking(
            student=UserFactory(role="student"),
            teacher=teacher,
            subject="math",
            scheduled_at=slot,
        )
        first.status = BookingStatus.CANCELLED
        first.cancelled_at = timezone.now()
        first.save(update_fields=["status", "cancelled_at"])

        second = create_booking(
            student=UserFactory(role="student"),
            teacher=teacher,
            subject="math",
            scheduled_at=slot,
        )
        assert second.pk != first.pk


@pytest.mark.django_db(transaction=True)
@postgres_only
class TestTwoStudentsBookingAtOnce:
    def test_exactly_one_of_them_gets_the_slot(self):
        teacher = teacher_with_hours()
        slot = free_slot(teacher)
        students = [UserFactory(role="student") for _ in range(5)]

        def book(index):
            return create_booking(
                student=students[index],
                teacher=teacher,
                subject="math",
                scheduled_at=slot,
            )

        results = run_together(book, len(students))

        booked = [r for r in results if isinstance(r, SupportBooking)]
        refused = [r for r in results if isinstance(r, ValueError)]
        assert len(booked) == 1, f"expected one winner, got {results}"
        assert len(refused) == len(students) - 1
        # Refused with the code the API turns into a 400 the student can read —
        # not an IntegrityError leaking out as a 500.
        assert {str(r) for r in refused} == {"slot_taken"}
        assert (
            SupportBooking.objects.filter(
                teacher=teacher,
                scheduled_at=slot,
                status__in=[BookingStatus.PENDING, BookingStatus.CONFIRMED],
            ).count()
            == 1
        )


# ─────────────────────────────────────
# Office-hour capacity
# ─────────────────────────────────────


def office_hour_session(capacity):
    teacher = UserFactory(role="teacher")
    template = OfficeHour.objects.create(
        teacher=teacher,
        subject="math",
        title="Algebra clinic",
        weekday=timezone.now().weekday(),
        start_time=time(15, 0),
        end_time=time(16, 0),
        capacity=capacity,
    )
    return OfficeHourSession.objects.create(
        office_hour=template,
        teacher=teacher,
        subject="math",
        title=template.title,
        starts_at=timezone.now() + timedelta(days=1),
        ends_at=timezone.now() + timedelta(days=1, hours=1),
        capacity=capacity,
    )


@pytest.mark.django_db(transaction=True)
@postgres_only
class TestTheLastSeat:
    def test_only_capacity_students_get_in(self):
        """Ten students, three seats. Without the row lock the count-then-insert
        in `join_office_hour` is a textbook check-then-act: everyone reads 0 and
        everyone writes."""
        session = office_hour_session(capacity=3)
        students = [UserFactory(role="student") for _ in range(10)]

        def join(index):
            return join_office_hour(session, students[index])

        results = run_together(join, len(students))

        joined = [r for r in results if not isinstance(r, Exception)]
        full = [r for r in results if isinstance(r, ValueError) and str(r) == "full"]
        assert len(joined) == 3, f"oversold: {results}"
        assert len(full) == 7
        assert session.attendances.filter(rsvp=RSVPStatus.JOINED).count() == 3

    def test_the_same_student_twice_takes_one_seat(self):
        """Idempotence under a race too: a double-tap on the join button must not
        cost two of the three seats."""
        session = office_hour_session(capacity=3)
        student = UserFactory(role="student")

        results = run_together(lambda _i: join_office_hour(session, student), 4)

        assert not [r for r in results if isinstance(r, Exception)], results
        assert session.attendances.filter(rsvp=RSVPStatus.JOINED).count() == 1
