"""
DSAT LMS v2 — Question-bank practice tests
Domain: Question Bank
Covers: the filters students actually use (band, done/todo, domain-means-its-
        skills), building a drill from a selection, and the one rule that makes
        instant feedback safe — that it is a property of the session, so a real
        paper can never be talked into marking for the student.
"""

import pytest
from rest_framework.test import APIClient

from apps.assessments.models import ExamSession, ExamTemplate
from apps.assessments.tests.factories import (
    ExamQuestionFactory,
    ExamSectionFactory,
    ExamTemplateFactory,
)
from apps.identity.tests.factories import UserFactory
from apps.question_bank.models import Question, QuestionCategory
from apps.question_bank.tests.factories import QuestionFactory

pytestmark = pytest.mark.django_db

QUESTIONS = "/api/v1/questions/"
PRACTICE = f"{QUESTIONS}practice/"


@pytest.fixture
def bank():
    """A domain with two skills, and questions across all three bands."""
    domain = QuestionCategory.objects.create(module="math", name="Algebra", slug="alg")
    skill_a = QuestionCategory.objects.create(
        module="math", name="Linear equations", slug="lin", parent=domain
    )
    skill_b = QuestionCategory.objects.create(
        module="math", name="Linear functions", slug="fun", parent=domain
    )
    other = QuestionCategory.objects.create(module="reading_writing", name="Transitions", slug="tr")

    made = {}
    for key, category, difficulty in [
        ("easy_a", skill_a, 1),
        ("medium_a", skill_a, 3),
        ("hard_a", skill_a, 5),
        ("easy_b", skill_b, 2),
        ("hard_other", other, 4),
    ]:
        made[key] = QuestionFactory(
            category=category,
            module=category.module,
            difficulty=difficulty,
            correct_answer="A",
            status=Question.Status.PUBLISHED,
        )
    return {"domain": domain, "skill_a": skill_a, "other": other, **made}


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    client.user = user
    return client


class TestBandFilter:
    def test_easy_covers_one_and_two(self, auth_client, bank):
        r = auth_client.get(f"{QUESTIONS}?band=easy")
        ids = {q["id"] for q in r.data["data"]}
        assert str(bank["easy_a"].id) in ids
        assert str(bank["easy_b"].id) in ids
        assert str(bank["medium_a"].id) not in ids

    def test_hard_covers_four_and_five(self, auth_client, bank):
        ids = {q["id"] for q in auth_client.get(f"{QUESTIONS}?band=hard").data["data"]}
        assert str(bank["hard_a"].id) in ids
        assert str(bank["hard_other"].id) in ids

    def test_bands_combine(self, auth_client, bank):
        ids = {q["id"] for q in auth_client.get(f"{QUESTIONS}?band=easy&band=hard").data["data"]}
        assert str(bank["medium_a"].id) not in ids
        assert len(ids) == 4


class TestCategoryFilter:
    def test_a_domain_means_every_skill_under_it(self, auth_client, bank):
        """Picking "Algebra" and getting nothing — because questions are tagged
        with a skill — is simply wrong."""
        r = auth_client.get(f"{QUESTIONS}?category={bank['domain'].id}")
        ids = {q["id"] for q in r.data["data"]}
        assert str(bank["easy_a"].id) in ids
        assert str(bank["easy_b"].id) in ids
        assert str(bank["hard_other"].id) not in ids

    def test_a_skill_means_just_that_skill(self, auth_client, bank):
        r = auth_client.get(f"{QUESTIONS}?category={bank['skill_a'].id}")
        ids = {q["id"] for q in r.data["data"]}
        assert str(bank["easy_b"].id) not in ids
        assert len(ids) == 3


class TestDoneFilter:
    def _answer(self, user, question):
        exam = ExamTemplateFactory(access_level="public")
        section = ExamSectionFactory(exam=exam, section_number=1)
        ExamQuestionFactory(section=section, question=question, position=1)
        session = ExamSession.objects.create(user=user, exam=exam)
        session.responses.create(question=question, chosen_answer="A")
        return session

    def test_todo_excludes_what_was_answered(self, auth_client, bank):
        self._answer(auth_client.user, bank["easy_a"])
        ids = {q["id"] for q in auth_client.get(f"{QUESTIONS}?status=todo").data["data"]}
        assert str(bank["easy_a"].id) not in ids
        assert str(bank["easy_b"].id) in ids

    def test_done_is_the_complement(self, auth_client, bank):
        self._answer(auth_client.user, bank["easy_a"])
        ids = {q["id"] for q in auth_client.get(f"{QUESTIONS}?status=done").data["data"]}
        assert ids == {str(bank["easy_a"].id)}

    def test_another_students_answers_do_not_count(self, auth_client, bank):
        self._answer(UserFactory(role="student"), bank["easy_a"])
        ids = {q["id"] for q in auth_client.get(f"{QUESTIONS}?status=todo").data["data"]}
        assert str(bank["easy_a"].id) in ids


def sit(user, question, chosen="A", *, is_correct=None, status="completed", feedback_mode="none"):
    """Answer a question in a session, and hand the session back."""
    exam = ExamTemplateFactory(access_level="public")
    section = ExamSectionFactory(exam=exam, section_number=1)
    ExamQuestionFactory(section=section, question=question, position=1)
    session = ExamSession.objects.create(
        user=user, exam=exam, status=status, feedback_mode=feedback_mode
    )
    session.responses.create(question=question, chosen_answer=chosen, is_correct=is_correct)
    return session


class TestMyAttempt:
    """What you put last time, kept — except where telling you would be the key."""

    def _row(self, client, question):
        rows = client.get(QUESTIONS).data["data"]
        return next(q for q in rows if q["id"] == str(question.id))

    def test_carries_the_answer_and_the_verdict(self, auth_client, bank):
        sit(auth_client.user, bank["easy_a"], "C", is_correct=False)
        attempt = self._row(auth_client, bank["easy_a"])["my_attempt"]
        assert attempt["chosen_answer"] == "C"
        assert attempt["is_correct"] is False
        assert attempt["answered_at"] is not None

    def test_null_when_never_attempted(self, auth_client, bank):
        assert self._row(auth_client, bank["easy_a"])["my_attempt"] is None

    def test_blank_is_not_an_attempt(self, auth_client, bank):
        sit(auth_client.user, bank["easy_a"], "")
        assert self._row(auth_client, bank["easy_a"])["my_attempt"] is None

    def test_another_students_attempt_is_not_mine(self, auth_client, bank):
        sit(UserFactory(role="student"), bank["easy_a"], "B", is_correct=True)
        assert self._row(auth_client, bank["easy_a"])["my_attempt"] is None

    def test_the_newest_attempt_wins(self, auth_client, bank):
        sit(auth_client.user, bank["easy_a"], "B", is_correct=False)
        sit(auth_client.user, bank["easy_a"], "A", is_correct=True)
        attempt = self._row(auth_client, bank["easy_a"])["my_attempt"]
        assert attempt["chosen_answer"] == "A"
        assert attempt["is_correct"] is True

    def test_detail_carries_it_too(self, auth_client, bank):
        sit(auth_client.user, bank["easy_a"], "D", is_correct=False)
        r = auth_client.get(f"{QUESTIONS}{bank['easy_a'].id}/")
        assert r.data["data"]["my_attempt"]["chosen_answer"] == "D"

    def test_withheld_while_the_question_sits_in_a_live_paper(self, auth_client, bank):
        # Answered once, correctly, in a finished sitting...
        sit(auth_client.user, bank["easy_a"], "A", is_correct=True)
        # ...and now it turns up in a paper they are in the middle of. Repeating
        # "you got this right with A" would hand them the key.
        sit(auth_client.user, bank["easy_a"], "", status="in_progress")
        assert self._row(auth_client, bank["easy_a"])["my_attempt"] is None

    def test_a_drill_does_not_withhold_it(self, auth_client, bank):
        sit(auth_client.user, bank["easy_a"], "A", is_correct=True)
        sit(auth_client.user, bank["easy_a"], "", status="in_progress", feedback_mode="instant")
        assert self._row(auth_client, bank["easy_a"])["my_attempt"] is not None


class TestPracticeOptions:
    def test_counts_roll_up_to_the_domain(self, auth_client, bank):
        r = auth_client.get(f"{PRACTICE}options/")
        assert r.status_code == 200
        rows = {c["name"]: c for c in r.data["data"]["categories"]}
        # Three under skill_a plus one under skill_b.
        assert rows["Algebra"]["total"] == 4
        assert rows["Algebra"]["easy"] == 2
        assert rows["Algebra"]["hard"] == 1

    def test_reports_what_is_done(self, auth_client, bank):
        TestDoneFilter()._answer(auth_client.user, bank["easy_a"])
        data = auth_client.get(f"{PRACTICE}options/").data["data"]
        assert data["done_questions"] == 1


class TestBuildingADrill:
    def test_preview_counts_before_starting(self, auth_client, bank):
        r = auth_client.post(
            f"{PRACTICE}preview/",
            {"categories": [str(bank["domain"].id)], "difficulties": ["easy"]},
            format="json",
        )
        assert r.data["data"]["matching"] == 2

    def test_start_opens_a_session_on_the_selection(self, auth_client, bank):
        r = auth_client.post(
            f"{PRACTICE}start/",
            {"categories": [str(bank["domain"].id)], "mode": "instant"},
            format="json",
        )
        assert r.status_code == 201
        data = r.data["data"]
        assert data["question_count"] == 4
        assert data["feedback_mode"] == "instant"
        # Untimed: a drill is for thinking, not racing.
        assert data["server_time_remaining"] is None

    def test_the_limit_is_respected(self, auth_client, bank):
        r = auth_client.post(
            f"{PRACTICE}start/", {"categories": [str(bank["domain"].id)], "limit": 2}, format="json"
        )
        assert r.data["data"]["question_count"] == 2

    def test_skipping_done_questions(self, auth_client, bank):
        TestDoneFilter()._answer(auth_client.user, bank["easy_a"])
        r = auth_client.post(
            f"{PRACTICE}start/",
            {"categories": [str(bank["domain"].id)], "exclude_done": True},
            format="json",
        )
        assert r.data["data"]["question_count"] == 3

    def test_an_empty_selection_is_refused(self, auth_client, bank):
        r = auth_client.post(
            f"{PRACTICE}start/",
            {"categories": [str(bank["other"].id)], "difficulties": ["easy"]},
            format="json",
        )
        assert r.status_code == 400

    def test_generated_templates_stay_out_of_the_exam_list(self, auth_client, bank):
        auth_client.post(
            f"{PRACTICE}start/", {"categories": [str(bank["domain"].id)]}, format="json"
        )
        titles = [e["title"] for e in auth_client.get("/api/v1/exams/").data["data"]]
        assert not any("Algebra" in title for title in titles)
        assert ExamTemplate.objects.filter(is_generated=True).count() == 1


class TestInstantFeedbackIsSessionScoped:
    def _drill(self, auth_client, bank, mode):
        r = auth_client.post(
            f"{PRACTICE}start/",
            {"categories": [str(bank["domain"].id)], "mode": mode},
            format="json",
        )
        data = r.data["data"]
        return data["id"], data["sections"][0]["questions"][0]["question"]["id"]

    def test_a_drill_marks_each_answer(self, auth_client, bank):
        session_id, question_id = self._drill(auth_client, bank, "instant")
        r = auth_client.post(
            f"/api/v1/sessions/{session_id}/answer/",
            {"question": question_id, "chosen_answer": "A"},
            format="json",
        )
        assert r.data["data"]["is_correct"] is True
        assert r.data["data"]["correct_answer"] == "A"

    def test_a_wrong_answer_says_so(self, auth_client, bank):
        session_id, question_id = self._drill(auth_client, bank, "instant")
        r = auth_client.post(
            f"/api/v1/sessions/{session_id}/answer/",
            {"question": question_id, "chosen_answer": "D"},
            format="json",
        )
        assert r.data["data"]["is_correct"] is False

    def test_exam_mode_reveals_nothing(self, auth_client, bank):
        session_id, question_id = self._drill(auth_client, bank, "exam")
        r = auth_client.post(
            f"/api/v1/sessions/{session_id}/answer/",
            {"question": question_id, "chosen_answer": "A"},
            format="json",
        )
        assert "is_correct" not in r.data["data"]
        assert "correct_answer" not in r.data["data"]

    def test_a_real_paper_cannot_be_asked_to_mark(self, auth_client, bank):
        """The mode lives on the session and is set at start. There is no
        request field that could turn a paper into a drill."""
        exam = ExamTemplateFactory(access_level="public")
        section = ExamSectionFactory(exam=exam, section_number=1)
        ExamQuestionFactory(section=section, question=bank["easy_a"], position=1)
        session_id = auth_client.post(
            "/api/v1/sessions/", {"exam": str(exam.id)}, format="json"
        ).data["data"]["id"]

        r = auth_client.post(
            f"/api/v1/sessions/{session_id}/answer/",
            {"question": str(bank["easy_a"].id), "chosen_answer": "A", "mode": "instant"},
            format="json",
        )
        assert "is_correct" not in r.data["data"]
        assert ExamSession.objects.get(pk=session_id).feedback_mode == "none"

    def test_the_study_view_stays_open_during_a_drill(self, auth_client, bank):
        """A paper locks the answer key; a drill shows it anyway, so locking
        would only block the student from what they came for."""
        self._drill(auth_client, bank, "instant")
        assert auth_client.get(f"{QUESTIONS}{bank['easy_a'].id}/").status_code == 200
