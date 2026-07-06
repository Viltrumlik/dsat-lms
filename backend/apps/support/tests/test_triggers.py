"""
DSAT LMS v2 — Support S4 proactive-trigger tests
Domain: Support
Covers: the rule registry (thresholds mirror analytics.RISK_*), the grouped
    batch_weak_topics helper, the sweep (creates recs, notifies once per student
    at highest severity, dedupes on re-run, expires stale NEW, only sweeps
    active-enrolled students, N-independent reads), booking-from-recommendation
    (source link + flip to ACTED), and the recommendation list/dismiss endpoints.
"""

from datetime import time as dtime
from datetime import timedelta
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.academy.models import ClassEnrollment
from apps.academy.tests.factories import ClassFactory
from apps.analytics.models import UserCategoryStat
from apps.analytics.services import batch_weak_topics
from apps.identity.tests.factories import UserFactory
from apps.notifications.models import Notification
from apps.question_bank.tests.factories import CategoryFactory
from apps.support.availability import generate_slots
from apps.support.models import SupportRecommendation, TeacherAvailability
from apps.support.rules import evaluate_rules
from apps.support.services import create_booking, run_support_sweep

pytestmark = pytest.mark.django_db

BASE = "/api/v1/support/"
TZ = ZoneInfo(settings.TIME_ZONE)


def authed(role="student", user=None):
    user = user or UserFactory(role=role)
    client = APIClient()
    client.force_authenticate(user)
    client.user = user
    return client


def enrolled_student():
    student = UserFactory(role="student")
    ClassEnrollment.objects.create(
        klass=ClassFactory(), student=student, status=ClassEnrollment.Status.ACTIVE
    )
    return student


def weak_category(student, *, module="math", accuracy=30, name="Algebra", practiced=None):
    cat = CategoryFactory(module=module, name=name)
    UserCategoryStat.objects.create(
        user=student,
        category=cat,
        total_answered=10,
        total_correct=int(round(10 * accuracy / 100)),
        accuracy_pct=accuracy,
        last_practiced_at=practiced or timezone.now(),
    )
    return cat


# ─────────────────────────────────────
# Rules (pure)
# ─────────────────────────────────────


class TestRules:
    def test_category_rule_picks_worst_and_escalates(self):
        weak = [
            {
                "category_id": "c1",
                "category_name": "Geometry",
                "module": "math",
                "accuracy_pct": 52.0,
                "total_answered": 10,
            },
            {
                "category_id": "c2",
                "category_name": "Algebra",
                "module": "math",
                "accuracy_pct": 30.0,
                "total_answered": 8,
            },
        ]
        rec = next(r for r in evaluate_rules({}, weak) if r["rule_key"] == "category_accuracy_low")
        assert rec["topic"] == "Algebra"  # lowest accuracy wins
        assert rec["subject"] == "math"
        assert rec["severity"] == "critical"  # 30 < 40

    def test_category_rule_silent_above_floor(self):
        weak = [
            {
                "category_id": "c",
                "category_name": "X",
                "module": "math",
                "accuracy_pct": 60.0,
                "total_answered": 10,
            }
        ]
        assert evaluate_rules({}, weak) == []

    def test_trend_rule_bands(self):
        assert any(r["severity"] == "critical" for r in evaluate_rules({"delta_pct": -12}, []))
        assert any(r["severity"] == "warning" for r in evaluate_rules({"delta_pct": -6}, []))
        assert evaluate_rules({"delta_pct": -3}, []) == []
        assert evaluate_rules({"delta_pct": None}, []) == []

    def test_inactive_rule_bands(self):
        assert any(
            r["rule_key"] == "inactive_days" and r["severity"] == "critical"
            for r in evaluate_rules({"days_inactive": 20}, [])
        )
        assert any(
            r["rule_key"] == "inactive_days" and r["severity"] == "warning"
            for r in evaluate_rules({"days_inactive": 9}, [])
        )
        assert evaluate_rules({"days_inactive": 3}, []) == []
        assert evaluate_rules({"days_inactive": None}, []) == []  # never-active skipped

    def test_homework_rule_bands(self):
        assert any(
            r["severity"] == "critical"
            for r in evaluate_rules({"has_homework": True, "completion_pct": 40.0}, [])
        )
        assert any(
            r["severity"] == "warning"
            for r in evaluate_rules({"has_homework": True, "completion_pct": 60.0}, [])
        )
        assert evaluate_rules({"has_homework": True, "completion_pct": 80.0}, []) == []
        assert evaluate_rules({"has_homework": False, "completion_pct": 0.0}, []) == []


# ─────────────────────────────────────
# batch_weak_topics
# ─────────────────────────────────────


class TestBatchWeakTopics:
    def test_groups_per_user_lowest_first(self):
        s1, s2 = UserFactory(role="student"), UserFactory(role="student")
        weak_category(s1, accuracy=20, name="A")
        weak_category(s1, accuracy=90, name="B")  # above → not in weak (but has enough attempts)
        weak_category(s2, accuracy=45, name="C")
        result = batch_weak_topics([s1.id, s2.id])
        assert result[s1.id][0]["accuracy_pct"] == 20.0
        assert result[s2.id][0]["category_name"] == "C"

    def test_min_attempts_floor(self):
        s = UserFactory(role="student")
        cat = CategoryFactory(module="math", name="Tiny")
        UserCategoryStat.objects.create(
            user=s, category=cat, total_answered=2, total_correct=0, accuracy_pct=0
        )
        assert batch_weak_topics([s.id]).get(s.id, []) == []  # below min_attempts=5


# ─────────────────────────────────────
# Sweep
# ─────────────────────────────────────


class TestSweep:
    def test_creates_recommendation_and_notifies(self):
        student = enrolled_student()
        weak_category(student, accuracy=30)
        result = run_support_sweep()
        assert result["created"] >= 1 and result["notified"] >= 1
        rec = SupportRecommendation.objects.get(student=student, rule_key="category_accuracy_low")
        assert rec.status == "new" and rec.subject == "math" and rec.severity == "critical"
        assert rec.notification is not None
        assert rec.expires_at is not None
        assert (
            Notification.objects.filter(
                user=student, type=Notification.Type.SUPPORT_RECOMMENDATION
            ).count()
            == 1
        )

    def test_notification_deep_link(self):
        student = enrolled_student()
        weak_category(student, accuracy=30, name="Algebra")
        run_support_sweep()
        notif = Notification.objects.get(
            user=student, type=Notification.Type.SUPPORT_RECOMMENDATION
        )
        assert notif.data["url"].startswith("/support/book?")
        assert "subject=math" in notif.data["url"]
        assert "rec=" in notif.data["url"]

    def test_dedupes_and_notifies_once_on_rerun(self):
        student = enrolled_student()
        weak_category(student, accuracy=30)
        run_support_sweep()
        run_support_sweep()  # same signal → no new rec, no second notification
        assert SupportRecommendation.objects.filter(student=student).count() == 1
        assert (
            Notification.objects.filter(
                user=student, type=Notification.Type.SUPPORT_RECOMMENDATION
            ).count()
            == 1
        )

    def test_one_notification_for_multiple_rules(self):
        student = enrolled_student()
        # weak category (critical) AND inactive 20d (both fire) — practiced long ago.
        weak_category(student, accuracy=30, practiced=timezone.now() - timedelta(days=20))
        run_support_sweep()
        recs = SupportRecommendation.objects.filter(student=student)
        assert recs.count() == 2  # category_accuracy_low + inactive_days
        assert recs.filter(notification__isnull=False).count() == 1  # notified once

    def test_expires_stale_new(self):
        student = enrolled_student()
        weak_category(student, accuracy=30)
        run_support_sweep()
        rec = SupportRecommendation.objects.get(student=student)
        rec.expires_at = timezone.now() - timedelta(days=1)
        rec.save(update_fields=["expires_at"])
        run_support_sweep()
        rec.refresh_from_db()
        assert rec.status == "expired"

    def test_only_active_enrolled_swept(self):
        student = UserFactory(role="student")  # not enrolled anywhere
        weak_category(student, accuracy=30)
        run_support_sweep()
        assert not SupportRecommendation.objects.filter(student=student).exists()

    def test_reads_are_n_independent(self):
        # Pre-seed a live rec per student so the sweep dedupes every rule → pure
        # reads, no writes. Query count must not grow with cohort size.
        def deduped_student():
            s = enrolled_student()
            weak_category(s, accuracy=30)
            SupportRecommendation.objects.create(
                student=s, rule_key="category_accuracy_low", severity="warning", status="new"
            )
            return s

        deduped_student()
        with CaptureQueriesContext(connection) as one:
            run_support_sweep()
        for _ in range(4):
            deduped_student()
        with CaptureQueriesContext(connection) as five:
            run_support_sweep()
        assert len(one) == len(five)  # grouped reads → N-independent


# ─────────────────────────────────────
# Booking from a recommendation
# ─────────────────────────────────────


class TestBookingFromRecommendation:
    def _slot(self, teacher):
        for weekday in range(7):
            TeacherAvailability.objects.create(
                teacher=teacher,
                subject="math",
                weekday=weekday,
                start_time=dtime(9, 0),
                end_time=dtime(17, 0),
                slot_minutes=30,
            )
        start = timezone.now().astimezone(TZ).date()
        return generate_slots(teacher, "math", start=start, end=start + timedelta(days=3))[0][
            "scheduled_at"
        ]

    def test_create_booking_acts_recommendation(self):
        student = UserFactory(role="student")
        teacher = UserFactory(role="teacher")
        slot = self._slot(teacher)
        rec = SupportRecommendation.objects.create(
            student=student,
            rule_key="category_accuracy_low",
            severity="warning",
            status="new",
            subject="math",
            topic="Algebra",
        )
        booking = create_booking(
            student=student, teacher=teacher, subject="math", scheduled_at=slot, recommendation=rec
        )
        assert booking.source_recommendation_id == rec.id
        rec.refresh_from_db()
        assert rec.status == "acted" and rec.booking_id == booking.id

    def test_api_booking_with_rec(self):
        client = authed(role="student")
        teacher = UserFactory(role="teacher")
        slot = self._slot(teacher)
        rec = SupportRecommendation.objects.create(
            student=client.user, rule_key="inactive_days", severity="warning", status="new"
        )
        r = client.post(
            BASE + "bookings/",
            {
                "teacher": str(teacher.id),
                "subject": "math",
                "scheduled_at": slot.isoformat(),
                "recommendation": str(rec.id),
            },
            format="json",
        )
        assert r.status_code == 201
        rec.refresh_from_db()
        assert rec.status == "acted"


# ─────────────────────────────────────
# Endpoints
# ─────────────────────────────────────


class TestRecommendationEndpoints:
    def test_list_returns_new_only(self):
        client = authed(role="student")
        SupportRecommendation.objects.create(
            student=client.user, rule_key="inactive_days", severity="warning", status="new"
        )
        SupportRecommendation.objects.create(
            student=client.user, rule_key="x", severity="info", status="dismissed"
        )
        r = client.get(BASE + "recommendations/")
        assert len(r.json()["data"]) == 1

    def test_dismiss(self):
        client = authed(role="student")
        rec = SupportRecommendation.objects.create(
            student=client.user, rule_key="inactive_days", severity="warning", status="new"
        )
        assert client.post(BASE + f"recommendations/{rec.id}/dismiss/").status_code == 200
        rec.refresh_from_db()
        assert rec.status == "dismissed"

    def test_cannot_dismiss_others(self):
        other = SupportRecommendation.objects.create(
            student=UserFactory(role="student"), rule_key="x", severity="info", status="new"
        )
        assert (
            authed(role="student").post(BASE + f"recommendations/{other.id}/dismiss/").status_code
            == 404
        )

    def test_dismiss_non_new_rejected(self):
        client = authed(role="student")
        rec = SupportRecommendation.objects.create(
            student=client.user, rule_key="x", severity="info", status="acted"
        )
        assert client.post(BASE + f"recommendations/{rec.id}/dismiss/").status_code == 400
