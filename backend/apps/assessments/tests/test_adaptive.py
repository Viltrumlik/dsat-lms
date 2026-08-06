"""
DSAT LMS v2 — Adaptive module routing tests
Domain: Assessments
Covers: what `is_adaptive` now does — the routing decision itself (both
        directions, the boundary, the no-previous-module default), that it is
        made ONCE and survives a later answer, that a student is served and
        GRADED on the form they were given and only that one, and that a
        non-adaptive paper is untouched by any of it.

The grading case is the one that would hurt most if wrong: counting both forms
would mark a student as having omitted a whole module that was never selected
for them, roughly halving the score of anyone who sat the paper as designed.
"""

import pytest
from rest_framework.test import APIClient

from apps.assessments.adaptive import (
    UPPER_THRESHOLD,
    Routing,
    module_accuracy,
    routing_for,
)
from apps.assessments.models import ExamResult, ExamSession, SessionModuleRouting
from apps.assessments.services import grade_session
from apps.assessments.tests.factories import (
    ExamQuestionFactory,
    ExamSectionFactory,
    ExamTemplateFactory,
)
from apps.identity.tests.factories import AdminUserFactory, UserFactory
from apps.question_bank.tests.factories import QuestionFactory

pytestmark = pytest.mark.django_db

SESSIONS = "/api/v1/sessions/"


@pytest.fixture
def admin_client():
    client = APIClient()
    client.force_authenticate(AdminUserFactory())
    return client


def adaptive_exam(*, module_one=5, per_form=4, is_adaptive=True):
    """Module 1 (everyone) → module 2 (a lower form and an upper form).

    Both forms are the same length, as two forms of one module must be.
    """
    exam = ExamTemplateFactory(access_level="public", time_limit=None, is_adaptive=is_adaptive)
    first = ExamSectionFactory(exam=exam, section_number=1, module="math", time_limit=None)
    second = ExamSectionFactory(exam=exam, section_number=2, module="math", time_limit=None)

    for position in range(1, module_one + 1):
        ExamQuestionFactory(
            section=first,
            question=QuestionFactory(module="math", correct_answer="A"),
            position=position,
        )
    position = 1
    for variant in (Routing.LOWER, Routing.UPPER):
        for _ in range(per_form):
            ExamQuestionFactory(
                section=second,
                question=QuestionFactory(module="math", correct_answer="A"),
                position=position,
                routing=variant,
            )
            position += 1
    return exam, first, second


def start(client, exam):
    response = client.post(SESSIONS, {"exam": str(exam.id)}, format="json")
    assert response.status_code == 201, response.data
    return response.data["data"]["id"]


def answer_module_one(client, session_id, section, correct):
    """Answer the first `correct` questions of `section` right, the rest wrong."""
    for index, eq in enumerate(section.exam_questions.order_by("position")):
        client.post(
            f"{SESSIONS}{session_id}/answer/",
            {"question": str(eq.question_id), "chosen_answer": "A" if index < correct else "B"},
            format="json",
        )


def advance(client, session_id, section_number=2):
    return client.patch(
        f"{SESSIONS}{session_id}/",
        {"current_section": section_number, "current_question": 1},
        format="json",
    )


class TestTheDecision:
    def test_a_strong_module_one_routes_up(self, auth_client):
        exam, first, _ = adaptive_exam(module_one=5)
        sid = start(auth_client, exam)
        answer_module_one(auth_client, sid, first, correct=5)  # 100%
        advance(auth_client, sid)

        routing = SessionModuleRouting.objects.get(session_id=sid)
        assert routing.variant == Routing.UPPER
        assert float(routing.decided_on_accuracy) == 100.0

    def test_a_weak_module_one_routes_down(self, auth_client):
        exam, first, _ = adaptive_exam(module_one=5)
        sid = start(auth_client, exam)
        answer_module_one(auth_client, sid, first, correct=1)  # 20%
        advance(auth_client, sid)

        routing = SessionModuleRouting.objects.get(session_id=sid)
        assert routing.variant == Routing.LOWER
        assert float(routing.decided_on_accuracy) == 20.0

    def test_exactly_the_threshold_routes_up(self, auth_client):
        """`>=`, not `>`. Worth pinning: which side of the line the boundary
        falls on is a decision, not an implementation detail."""
        exam, first, _ = adaptive_exam(module_one=5)
        sid = start(auth_client, exam)
        answer_module_one(auth_client, sid, first, correct=3)  # 60% == threshold
        advance(auth_client, sid)
        assert SessionModuleRouting.objects.get(session_id=sid).variant == Routing.UPPER
        assert float(UPPER_THRESHOLD) == 0.6

    def test_no_previous_module_defaults_to_the_lower_form(self):
        """A student wrongly given the easier paper loses ceiling; one wrongly
        given the harder paper loses the ability to show what they know."""
        exam = ExamTemplateFactory(access_level="public", is_adaptive=True)
        only = ExamSectionFactory(exam=exam, section_number=1, module="math")
        ExamQuestionFactory(
            section=only, question=QuestionFactory(), position=1, routing=Routing.LOWER
        )
        ExamQuestionFactory(
            section=only, question=QuestionFactory(), position=2, routing=Routing.UPPER
        )
        session = ExamSession.objects.create(user=UserFactory(), exam=exam)
        assert routing_for(session, only) == Routing.LOWER

    def test_an_empty_module_is_not_a_score_of_zero(self):
        exam = ExamTemplateFactory(is_adaptive=True)
        empty = ExamSectionFactory(exam=exam, section_number=1, module="math")
        session = ExamSession.objects.create(user=UserFactory(), exam=exam)
        assert module_accuracy(session, empty) is None


class TestItIsDecidedOnce:
    def test_a_later_answer_does_not_move_the_student(self, auth_client):
        """The reconcile sweep can write a module-1 answer after the advance. If
        routing were recomputed on read, that would move a student between forms
        while they were sitting one of them — and grade them on the other."""
        exam, first, _ = adaptive_exam(module_one=5)
        sid = start(auth_client, exam)
        answer_module_one(auth_client, sid, first, correct=1)
        advance(auth_client, sid)
        assert SessionModuleRouting.objects.get(session_id=sid).variant == Routing.LOWER

        # Backfill every module-1 answer as correct, the way the sweep would.
        session = ExamSession.objects.get(pk=sid)
        session.responses.filter(
            question_id__in=first.exam_questions.values_list("question_id", flat=True)
        ).update(chosen_answer="A")

        auth_client.get(f"{SESSIONS}{sid}/")
        assert SessionModuleRouting.objects.get(session_id=sid).variant == Routing.LOWER
        assert SessionModuleRouting.objects.filter(session_id=sid).count() == 1

    def test_serializing_never_decides_a_routing(self, auth_client):
        """Reading the paper must not route a student into a module they have
        not reached."""
        exam, _, _ = adaptive_exam()
        sid = start(auth_client, exam)
        auth_client.get(f"{SESSIONS}{sid}/")
        assert not SessionModuleRouting.objects.filter(session_id=sid).exists()


class TestWhatIsServed:
    def test_only_one_form_arrives(self, auth_client):
        exam, first, _ = adaptive_exam(module_one=5, per_form=4)
        sid = start(auth_client, exam)
        answer_module_one(auth_client, sid, first, correct=5)
        served = advance(auth_client, sid).data["data"]["sections"][1]["questions"]

        assert len(served) == 4  # one form, not both
        upper = set(
            exam.sections.get(section_number=2)
            .exam_questions.filter(routing=Routing.UPPER)
            .values_list("question_id", flat=True)
        )
        assert {q["question"]["id"] for q in served} == {str(qid) for qid in upper}

    def test_an_unreached_routed_module_reports_one_form_not_two(self, auth_client):
        """The runner numbers the paper off question_count. Reporting both forms
        would tell a student their 4-question module has 8 in it."""
        exam, _, _ = adaptive_exam(module_one=5, per_form=4)
        sid = start(auth_client, exam)
        detail = auth_client.get(f"{SESSIONS}{sid}/").data["data"]
        assert [s["question_count"] for s in detail["sections"]] == [5, 4]

    def test_the_other_form_cannot_be_answered(self, auth_client):
        """Belonging to the current SECTION is not enough — the other form's
        questions are in that section too, and answers to them would sit in the
        table as work that silently did not count."""
        exam, first, second = adaptive_exam(module_one=5)
        sid = start(auth_client, exam)
        answer_module_one(auth_client, sid, first, correct=5)  # → upper
        advance(auth_client, sid)

        not_served = second.exam_questions.filter(routing=Routing.LOWER).first()
        response = auth_client.post(
            f"{SESSIONS}{sid}/answer/",
            {"question": str(not_served.question_id), "chosen_answer": "A"},
            format="json",
        )
        assert response.status_code == 400


class TestGrading:
    def test_the_unseen_form_is_not_counted_as_omitted(self, auth_client):
        """The one that would hurt most. Counting both forms marks a student as
        having skipped a module that was never selected for them."""
        exam, first, second = adaptive_exam(module_one=5, per_form=4)
        sid = start(auth_client, exam)
        answer_module_one(auth_client, sid, first, correct=5)
        advance(auth_client, sid)
        for eq in second.exam_questions.filter(routing=Routing.UPPER):
            auth_client.post(
                f"{SESSIONS}{sid}/answer/",
                {"question": str(eq.question_id), "chosen_answer": "A"},
                format="json",
            )
        auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")

        result = ExamResult.objects.get(session_id=sid)
        assert result.total_questions == 9  # 5 + one form of 4, not 5 + 8
        assert result.total_correct == 9
        assert result.total_skipped == 0
        assert float(result.accuracy_pct) == 100.0

    def test_a_module_never_reached_still_counts_as_omitted(self, auth_client):
        """An unreached module IS omitted — but only its standard questions can
        be, since no form was ever chosen."""
        exam, first, _ = adaptive_exam(module_one=5, per_form=4)
        sid = start(auth_client, exam)
        answer_module_one(auth_client, sid, first, correct=5)
        auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")

        result = ExamResult.objects.get(session_id=sid)
        assert result.total_questions == 5
        assert result.total_correct == 5


class TestANonAdaptivePaperIsUntouched:
    def test_every_question_is_served_and_graded(self, auth_client):
        """`standard` is the only value a non-adaptive paper holds, which is why
        none of the above changed an existing exam."""
        exam = ExamTemplateFactory(access_level="public", time_limit=None, is_adaptive=False)
        section = ExamSectionFactory(exam=exam, section_number=1, module="math")
        for position in range(1, 4):
            ExamQuestionFactory(
                section=section, question=QuestionFactory(correct_answer="A"), position=position
            )

        sid = start(auth_client, exam)
        detail = auth_client.get(f"{SESSIONS}{sid}/").data["data"]
        assert len(detail["sections"][0]["questions"]) == 3
        assert detail["sections"][0]["question_count"] == 3

        session = ExamSession.objects.get(pk=sid)
        grade_session(session)
        assert ExamResult.objects.get(session=session).total_questions == 3

    def test_variant_questions_are_refused_on_a_static_paper(self, admin_client):
        """Refused rather than ignored — a silently dropped `upper` leaves the
        author looking at a module holding both forms with no idea why."""
        exam = ExamTemplateFactory(is_adaptive=False)
        section = ExamSectionFactory(exam=exam, section_number=1, module="math")
        question = QuestionFactory(status="published")

        response = admin_client.post(
            f"/api/v1/admin/exams/{exam.id}/sections/{section.id}/questions/",
            {"question": str(question.id), "routing": "upper"},
            format="json",
        )
        assert response.status_code == 400
