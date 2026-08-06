"""
DSAT LMS v2 — Analytics task tests
Domain: Analytics
Covers: calculate_percentile (single result, peer ranking) and that submitting a
        session computes a percentile end-to-end (eager dispatch).
"""

from decimal import Decimal

import pytest

from apps.analytics.tasks import calculate_percentile, refresh_exam_percentiles, rerank_exam
from apps.assessments.models import ExamResult
from apps.assessments.tests.factories import (
    ExamQuestionFactory,
    ExamResultFactory,
    ExamSectionFactory,
    ExamSessionFactory,
    ExamTemplateFactory,
)
from apps.question_bank.tests.factories import QuestionFactory

pytestmark = pytest.mark.django_db


def _result(exam, accuracy):
    session = ExamSessionFactory(exam=exam)
    return ExamResultFactory(
        session=session, user=session.user, exam=exam, accuracy_pct=Decimal(str(accuracy))
    )


class TestCalculatePercentile:
    def test_single_result_is_100(self):
        exam = ExamTemplateFactory()
        result = _result(exam, 80)
        calculate_percentile(result.id)
        result.refresh_from_db()
        assert float(result.percentile) == 100.0

    def test_percentile_among_peers(self):
        exam = ExamTemplateFactory()
        _result(exam, 90)
        middle = _result(exam, 70)
        _result(exam, 50)
        calculate_percentile(middle.id)
        middle.refresh_from_db()
        # {50, 70} are <= 70 → 2 of 3
        assert float(middle.percentile) == pytest.approx(66.67)


class TestRerank:
    def test_the_first_result_stops_being_100th_when_peers_arrive(self):
        """The bug this exists for: submitted first, ranked against nobody, and
        left at 100.00 forever while better students piled in behind it."""
        exam = ExamTemplateFactory()
        first = _result(exam, 40)
        calculate_percentile(first.id)
        first.refresh_from_db()
        assert float(first.percentile) == 100.0

        _result(exam, 90)
        _result(exam, 80)
        rerank_exam(exam.id)

        first.refresh_from_db()
        assert float(first.percentile) == pytest.approx(33.33)  # 1 of 3

    def test_ties_share_a_percentile(self):
        exam = ExamTemplateFactory()
        a, b = _result(exam, 70), _result(exam, 70)
        _result(exam, 90)
        rerank_exam(exam.id)
        a.refresh_from_db()
        b.refresh_from_db()
        # Both are "at or below 70" → both rank 2 of 3, not 1 and 2.
        assert float(a.percentile) == float(b.percentile) == pytest.approx(66.67)

    def test_it_writes_only_what_changed(self):
        exam = ExamTemplateFactory()
        _result(exam, 90)
        _result(exam, 50)
        assert rerank_exam(exam.id) == 2
        assert rerank_exam(exam.id) == 0  # idempotent — a second pass is a no-op

    def test_results_without_accuracy_are_left_alone(self):
        exam = ExamTemplateFactory()
        ungraded = _result(exam, 60)
        ExamResult.objects.filter(pk=ungraded.pk).update(accuracy_pct=None)
        assert rerank_exam(exam.id) == 0

    def test_the_sweep_skips_generated_drills(self):
        """A drill belongs to one student; ranking them against themselves is noise."""
        drill = ExamTemplateFactory(is_generated=True)
        result = _result(drill, 60)
        paper = ExamTemplateFactory()
        _result(paper, 60)
        _result(paper, 90)

        assert refresh_exam_percentiles() == 2  # the paper's two rows, not the drill
        result.refresh_from_db()
        assert result.percentile is None

    def test_the_sweep_covers_every_exam(self):
        first, second = ExamTemplateFactory(), ExamTemplateFactory()
        _result(first, 30)
        _result(first, 70)
        _result(second, 55)
        assert refresh_exam_percentiles() == 3


class TestSubmitComputesPercentile:
    def test_submit_triggers_percentile(self, auth_client):
        exam = ExamTemplateFactory(access_level="public", time_limit=30)
        section = ExamSectionFactory(exam=exam, section_number=1)
        question = QuestionFactory(correct_answer="A")
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

        # The percentile task ran inline (eager) during submit.
        result = ExamResult.objects.get(session_id=sid)
        assert result.percentile is not None
