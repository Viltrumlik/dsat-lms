"""
DSAT LMS v2 — Analytics task tests
Domain: Analytics
Covers: calculate_percentile (single result, peer ranking) and that submitting a
        session computes a percentile end-to-end (eager dispatch).
"""

from decimal import Decimal

import pytest

from apps.analytics.tasks import calculate_percentile
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
