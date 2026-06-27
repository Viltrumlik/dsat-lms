"""
DSAT LMS v2 — Analytics vertical tests
Domain: Analytics
Covers: update_category_stats aggregation + idempotency, submit populates stats
        end-to-end, and the progress/summary/rankings endpoints.
"""

from decimal import Decimal

import pytest

from apps.analytics.models import UserCategoryStat
from apps.analytics.tasks import update_category_stats
from apps.assessments.models import ExamResponse, ExamSession
from apps.assessments.tests.factories import (
    ExamQuestionFactory,
    ExamSectionFactory,
    ExamSessionFactory,
    ExamTemplateFactory,
)
from apps.identity.tests.factories import UserFactory
from apps.question_bank.tests.factories import CategoryFactory, QuestionFactory

pytestmark = pytest.mark.django_db

PROGRESS = "/api/v1/analytics/progress/"
SUMMARY = "/api/v1/analytics/summary/"
RANKINGS = "/api/v1/analytics/rankings/"


def _graded_session(user, category, correctness):
    """Completed session with graded responses; correctness is a list of bools."""
    session = ExamSessionFactory(user=user, status=ExamSession.Status.COMPLETED)
    for correct in correctness:
        question = QuestionFactory(category=category, correct_answer="A")
        ExamResponse.objects.create(
            session=session,
            question=question,
            chosen_answer="A" if correct else "B",
            is_correct=correct,
        )
    return session


class TestUpdateCategoryStats:
    def test_aggregates_per_category(self):
        user = UserFactory()
        category = CategoryFactory()
        _graded_session(user, category, [True, True, False])
        update_category_stats(user.id)
        stat = UserCategoryStat.objects.get(user=user, category=category)
        assert stat.total_answered == 3
        assert stat.total_correct == 2
        assert float(stat.accuracy_pct) == pytest.approx(66.67)

    def test_recompute_is_idempotent(self):
        user = UserFactory()
        category = CategoryFactory()
        _graded_session(user, category, [True])
        update_category_stats(user.id)
        update_category_stats(user.id)
        assert UserCategoryStat.objects.filter(user=user, category=category).count() == 1


class TestSubmitPopulatesStats:
    def test_submit_updates_category_stats(self, auth_client):
        category = CategoryFactory()
        exam = ExamTemplateFactory(access_level="public", time_limit=30)
        section = ExamSectionFactory(exam=exam, section_number=1)
        question = QuestionFactory(category=category, correct_answer="A")
        ExamQuestionFactory(section=section, question=question, position=1)

        sid = auth_client.post("/api/v1/sessions/", {"exam": str(exam.id)}, format="json").data[
            "data"
        ]["id"]
        auth_client.post(
            f"/api/v1/sessions/{sid}/answer/",
            {"question": str(question.id), "chosen_answer": "A"},
            format="json",
        )
        auth_client.post(f"/api/v1/sessions/{sid}/submit/", {}, format="json")

        stat = UserCategoryStat.objects.get(user=auth_client.user, category=category)
        assert stat.total_answered == 1
        assert stat.total_correct == 1


class TestProgressEndpoint:
    def test_requires_auth(self, api_client):
        assert api_client.get(PROGRESS).status_code == 401

    def test_returns_user_stats(self, auth_client):
        category = CategoryFactory(name="Algebra")
        UserCategoryStat.objects.create(
            user=auth_client.user,
            category=category,
            total_answered=10,
            total_correct=7,
            accuracy_pct=Decimal("70.00"),
        )
        r = auth_client.get(PROGRESS)
        assert r.status_code == 200
        assert r.data["success"] is True
        assert r.data["data"][0]["category_name"] == "Algebra"
        assert r.data["data"][0]["total_correct"] == 7


class TestSummaryEndpoint:
    def test_overall_rollup(self, auth_client):
        c1 = CategoryFactory()
        c2 = CategoryFactory()
        UserCategoryStat.objects.create(
            user=auth_client.user, category=c1, total_answered=10, total_correct=8
        )
        UserCategoryStat.objects.create(
            user=auth_client.user, category=c2, total_answered=10, total_correct=4
        )
        d = auth_client.get(SUMMARY).data["data"]
        assert d["total_answered"] == 20
        assert d["total_correct"] == 12
        assert d["overall_accuracy"] == 60.0


class TestRankingsEndpoint:
    def test_public_user_forbidden(self, auth_client):
        # auth_client is a public-role user → no academy access
        assert auth_client.get(RANKINGS).status_code == 403

    def test_student_sees_ranking(self, api_client):
        student = UserFactory(role="student", first_name="Alice")
        other = UserFactory(first_name="Bob")
        category = CategoryFactory()
        UserCategoryStat.objects.create(
            user=student, category=category, total_answered=10, total_correct=9
        )
        UserCategoryStat.objects.create(
            user=other, category=category, total_answered=10, total_correct=5
        )
        api_client.force_authenticate(student)
        data = api_client.get(RANKINGS).data["data"]
        assert data[0]["rank"] == 1
        assert data[0]["name"] == "Alice"  # 90% tops 50%
        assert data[0]["is_me"] is True
