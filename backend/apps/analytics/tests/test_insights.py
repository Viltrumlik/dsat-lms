"""
DSAT LMS v2 — Analytics insight-service tests
Domain: Analytics
Covers: homework_stats completion math (incl. the lazy-submission trap),
        the risk heuristic at each threshold boundary, improvement_trend /
        recent_score_estimate, and batch == single-student equivalence + the
        batch query-count guarantee (O(1) in cohort size).
"""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.academy.models import ClassEnrollment
from apps.academy.tests.factories import ClassEnrollmentFactory, ClassFactory
from apps.analytics.services import (
    _compose_risk,
    _sig_accuracy,
    _sig_hw_completion,
    _sig_recency,
    _sig_trend,
    batch_risk_assessments,
    homework_stats,
    improvement_trend,
    recent_score_estimate,
    risk_assessment,
    weak_topics,
)
from apps.assessments.models import ExamResult
from apps.assessments.tests.factories import ExamResultFactory, ExamTemplateFactory
from apps.homework.models import HomeworkSubmission
from apps.homework.tests.factories import HomeworkFactory, HomeworkSubmissionFactory
from apps.identity.tests.factories import UserFactory
from apps.question_bank.tests.factories import CategoryFactory

pytestmark = pytest.mark.django_db

SUBMITTED = HomeworkSubmission.Status.SUBMITTED
GRADED = HomeworkSubmission.Status.GRADED


def _enrolled(student=None, klass=None):
    klass = klass or ClassFactory()
    student = student or UserFactory(role="student")
    ClassEnrollmentFactory(klass=klass, student=student)
    return klass, student


def _make_result(user, accuracy=50, computed_at=None, **kwargs):
    """ExamResult with a controllable computed_at (auto_now_add otherwise)."""
    r = ExamResultFactory(user=user, accuracy_pct=Decimal(str(accuracy)), **kwargs)
    if computed_at is not None:
        ExamResult.objects.filter(pk=r.pk).update(computed_at=computed_at)
    return r


# ── homework_stats ───────────────────────────────────────────────────────────
class TestHomeworkStats:
    def test_zero_when_nothing_assigned(self):
        assert homework_stats(UserFactory(role="student")) == {
            "assigned": 0,
            "submitted": 0,
            "graded": 0,
            "completion_pct": 0.0,
            "overdue_incomplete": 0,
        }

    def test_lazy_submission_denominator(self):
        # A published homework with NO submission row still counts as assigned —
        # submission rows are created lazily, so we can't count rows for the denom.
        klass, student = _enrolled()
        HomeworkFactory(assigned_class=klass, is_published=True)
        hs = homework_stats(student)
        assert hs["assigned"] == 1
        assert hs["submitted"] == 0
        assert hs["completion_pct"] == 0.0

    def test_submitted_and_graded_both_count(self):
        klass, student = _enrolled()
        hws = [HomeworkFactory(assigned_class=klass, is_published=True) for _ in range(4)]
        HomeworkSubmissionFactory(homework=hws[0], student=student, status=SUBMITTED)
        HomeworkSubmissionFactory(homework=hws[1], student=student, status=GRADED)
        hs = homework_stats(student)
        assert hs["assigned"] == 4
        assert hs["submitted"] == 2  # submitted + graded
        assert hs["graded"] == 1
        assert hs["completion_pct"] == 50.0

    def test_unpublished_excluded(self):
        klass, student = _enrolled()
        HomeworkFactory(assigned_class=klass, is_published=True)
        HomeworkFactory(assigned_class=klass, is_published=False)
        assert homework_stats(student)["assigned"] == 1

    def test_inactive_enrollment_excluded(self):
        klass = ClassFactory()
        student = UserFactory(role="student")
        ClassEnrollmentFactory(klass=klass, student=student, status=ClassEnrollment.Status.REMOVED)
        HomeworkFactory(assigned_class=klass, is_published=True)
        assert homework_stats(student)["assigned"] == 0

    def test_overdue_incomplete(self):
        klass, student = _enrolled()
        past = timezone.now() - timedelta(days=1)
        HomeworkFactory(assigned_class=klass, is_published=True, due_at=past)  # undone
        done = HomeworkFactory(assigned_class=klass, is_published=True, due_at=past)
        HomeworkSubmissionFactory(homework=done, student=student, status=GRADED)
        assert homework_stats(student)["overdue_incomplete"] == 1


# ── risk heuristic boundaries (pure, no DB) ──────────────────────────────────
GREEN = {
    "completion_pct": 90.0,
    "has_homework": True,
    "overall_accuracy": 80.0,
    "has_accuracy": True,
    "delta_pct": 2.0,
    "days_inactive": 1,
}


class TestRiskBoundaries:
    def test_green_baseline_has_no_reasons(self):
        r = _compose_risk(**GREEN)
        assert r["level"] == "green"
        assert r["reasons"] == []

    def test_single_red_signal_escalates_to_red(self):
        r = _compose_risk(**{**GREEN, "completion_pct": 49.0})
        assert r["level"] == "red"
        assert [x["signal"] for x in r["reasons"]] == ["homework_completion"]

    def test_completion_edges(self):
        assert _sig_hw_completion(49.99)["level"] == "red"
        assert _sig_hw_completion(50.0)["level"] == "yellow"
        assert _sig_hw_completion(74.99)["level"] == "yellow"
        assert _sig_hw_completion(75.0)["level"] == "green"

    def test_accuracy_edges(self):
        assert _sig_accuracy(49.0)["level"] == "red"
        assert _sig_accuracy(50.0)["level"] == "yellow"
        assert _sig_accuracy(65.0)["level"] == "green"

    def test_inactivity_edges(self):
        assert _sig_recency(14)["level"] == "red"
        assert _sig_recency(13)["level"] == "yellow"
        assert _sig_recency(7)["level"] == "yellow"
        assert _sig_recency(6)["level"] == "green"

    def test_trend_edges(self):
        assert _sig_trend(-10)["level"] == "red"
        assert _sig_trend(-9)["level"] == "yellow"
        assert _sig_trend(-5)["level"] == "yellow"
        assert _sig_trend(-4)["level"] == "green"

    def test_trend_message_signs_the_delta(self):
        assert _sig_trend(-12.0)["message"] == "accuracy trend -12%"
        assert _sig_trend(3.0)["message"] == "accuracy trend +3%"

    def test_brand_new_student_is_green(self):
        # No homework, no exams, no stats → not falsely flagged.
        r = _compose_risk(
            completion_pct=0.0,
            has_homework=False,
            overall_accuracy=0.0,
            has_accuracy=False,
            delta_pct=None,
            days_inactive=None,
        )
        assert r["level"] == "green"
        assert r["reasons"] == []

    def test_enrolled_but_never_active_flags_activity(self):
        r = _compose_risk(
            completion_pct=0.0,
            has_homework=True,
            overall_accuracy=0.0,
            has_accuracy=False,
            delta_pct=None,
            days_inactive=None,
        )
        assert r["level"] == "red"
        assert any(x["signal"] == "activity_recency" for x in r["reasons"])

    def test_score_ranks_two_reds_above_one(self):
        two = _compose_risk(**{**GREEN, "completion_pct": 10.0, "overall_accuracy": 10.0})
        one = _compose_risk(**{**GREEN, "completion_pct": 10.0})
        assert two["score"] > one["score"]


# ── trend / score estimate ───────────────────────────────────────────────────
class TestTrendAndEstimate:
    def test_improvement_trend_down(self):
        student = UserFactory(role="student")
        now = timezone.now()
        _make_result(student, 60, now)
        _make_result(student, 70, now - timedelta(days=10))
        tr = improvement_trend(student)
        assert tr["delta_pct"] == -10.0
        assert tr["trend"] == "down"

    def test_improvement_trend_insufficient(self):
        student = UserFactory(role="student")
        _make_result(student, 60, timezone.now())
        tr = improvement_trend(student)
        assert tr["delta_pct"] is None
        assert tr["trend"] == "insufficient_data"

    def test_recent_score_estimate_full_mocks_only(self):
        student = UserFactory(role="student")
        mock = ExamTemplateFactory(type="mock", module="full")
        practice = ExamTemplateFactory(type="practice", module="full")
        _make_result(
            student, 50, timezone.now(), exam=mock, total_score=1200, math_score=600, rw_score=600
        )
        _make_result(student, 50, timezone.now(), exam=practice, total_score=800)
        est = recent_score_estimate(student)
        assert est["based_on"] == 1
        assert est["estimate"] == 1200
        assert est["method"] == "recent_average"

    def test_recent_score_estimate_none_without_mocks(self):
        est = recent_score_estimate(UserFactory(role="student"))
        assert est["estimate"] is None
        assert est["based_on"] == 0

    def test_weak_topics_respects_min_attempts(self):
        from apps.analytics.models import UserCategoryStat

        student = UserFactory(role="student")
        weak = CategoryFactory(name="Algebra")
        thin = CategoryFactory(name="Geometry")
        UserCategoryStat.objects.create(
            user=student,
            category=weak,
            total_answered=10,
            total_correct=3,
            accuracy_pct=Decimal("30"),
        )
        UserCategoryStat.objects.create(
            user=student,
            category=thin,
            total_answered=2,
            total_correct=0,
            accuracy_pct=Decimal("0"),
        )
        topics = weak_topics(student)
        assert [t["category_name"] for t in topics] == ["Algebra"]  # thin one filtered out


# ── batch equivalence + query count ──────────────────────────────────────────
class TestBatch:
    def test_batch_matches_single(self):
        klass = ClassFactory()
        students = [UserFactory(role="student") for _ in range(3)]
        for s in students:
            ClassEnrollmentFactory(klass=klass, student=s)
        # Make one clearly at-risk (past-due homework, no submission).
        HomeworkFactory(
            assigned_class=klass, is_published=True, due_at=timezone.now() - timedelta(days=2)
        )
        batch = batch_risk_assessments([s.id for s in students])
        for s in students:
            assert batch[s.id]["level"] == risk_assessment(s)["level"]

    def test_batch_is_constant_query_count(self, django_assert_max_num_queries):
        klass = ClassFactory()
        students = [UserFactory(role="student") for _ in range(10)]
        for s in students:
            ClassEnrollmentFactory(klass=klass, student=s)
        HomeworkFactory(assigned_class=klass, is_published=True)
        ids = [s.id for s in students]
        with django_assert_max_num_queries(10):  # ~7 grouped queries, independent of N
            batch_risk_assessments(ids)
