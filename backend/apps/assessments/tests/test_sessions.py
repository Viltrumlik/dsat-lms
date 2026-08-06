"""
DSAT LMS v2 — Test engine (exam session) tests
Domain: Assessments
Covers: start (+ access control + no answer leak), ownership, auto-save with
        server-authoritative timer/cheat detection, answer upsert, submit/grading,
        idempotent submit, post-submit lockout, result endpoint.
"""

import uuid

import pytest
from rest_framework.test import APIClient

from apps.assessments.models import ExamResponse, ExamSession
from apps.assessments.tests.factories import (
    ExamQuestionFactory,
    ExamSectionFactory,
    ExamTemplateFactory,
)
from apps.identity.tests.factories import UserFactory
from apps.question_bank.tests.factories import QuestionFactory

pytestmark = pytest.mark.django_db

SESSIONS = "/api/v1/sessions/"


def make_exam(access_level="public", time_limit=30, answers=("A", "B", "C"), **kwargs):
    exam = ExamTemplateFactory(access_level=access_level, time_limit=time_limit, **kwargs)
    section = ExamSectionFactory(exam=exam, section_number=1)
    questions = []
    for i, ans in enumerate(answers, start=1):
        q = QuestionFactory(correct_answer=ans)
        ExamQuestionFactory(section=section, question=q, position=i)
        questions.append(q)
    return exam, questions


def start(client, exam):
    return client.post(SESSIONS, {"exam": str(exam.id)}, format="json")


class TestStart:
    def test_requires_auth(self, api_client):
        exam, _ = make_exam()
        assert start(api_client, exam).status_code == 401

    def test_creates_in_progress_session(self, auth_client):
        exam, _ = make_exam(time_limit=30)
        r = start(auth_client, exam)
        assert r.status_code == 201
        d = r.data["data"]
        assert d["status"] == "in_progress"
        assert 0 < d["server_time_remaining"] <= 1800
        assert ExamSession.objects.filter(id=d["id"], user=auth_client.user).exists()

    def test_does_not_leak_answers(self, auth_client):
        exam, _ = make_exam()
        d = start(auth_client, exam).data["data"]
        question = d["sections"][0]["questions"][0]["question"]
        assert "correct_answer" not in question
        assert "explanation" not in question
        assert "choices" in question

    def test_unknown_exam_is_400(self, auth_client):
        r = auth_client.post(SESSIONS, {"exam": str(uuid.uuid4())}, format="json")
        assert r.status_code == 400

    def test_academy_exam_forbidden_for_public(self, auth_client):
        exam, _ = make_exam(access_level="academy")
        r = start(auth_client, exam)
        assert r.status_code == 403
        assert r.data["error"]["code"] == "PERMISSION_DENIED"

    def test_academy_exam_allowed_for_student(self, api_client):
        exam, _ = make_exam(access_level="academy")
        api_client.force_authenticate(UserFactory(role="student"))
        assert start(api_client, exam).status_code == 201


class TestOwnership:
    def test_owner_can_fetch(self, auth_client):
        exam, _ = make_exam()
        sid = start(auth_client, exam).data["data"]["id"]
        r = auth_client.get(f"{SESSIONS}{sid}/")
        assert r.status_code == 200 and r.data["data"]["id"] == sid

    def test_other_user_gets_404(self, auth_client):
        exam, _ = make_exam()
        sid = start(auth_client, exam).data["data"]["id"]
        other = APIClient()
        other.force_authenticate(UserFactory())
        assert other.get(f"{SESSIONS}{sid}/").status_code == 404


class TestAutoSave:
    def test_updates_navigation_and_client_state(self, auth_client):
        exam, _ = make_exam()
        sid = start(auth_client, exam).data["data"]["id"]
        r = auth_client.patch(
            f"{SESSIONS}{sid}/",
            {
                "current_section": 1,
                "current_question": 2,
                "client_session_data": {"questions": {"x": {"flagged": True}}},
            },
            format="json",
        )
        assert r.status_code == 200
        assert r.data["data"]["current_question"] == 2
        assert r.data["data"]["client_session_data"]["questions"]["x"]["flagged"] is True

    def test_ignores_client_reported_time(self, auth_client):
        """The clock is not an input. A claimed time is discarded, not argued with.

        This used to be a validation: the client sent time_remaining and the
        server rejected it if it exceeded the server clock. That still let the
        client steer a value the server stored and served back, and it only ever
        caught claims that were too GENEROUS. The field is now ignored outright.
        """
        exam, _ = make_exam(time_limit=30)  # ~1800s on the server clock
        sid = start(auth_client, exam).data["data"]["id"]
        r = auth_client.patch(f"{SESSIONS}{sid}/", {"time_remaining": 99999}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["time_remaining"] <= 1800
        assert r.data["data"]["server_time_remaining"] <= 1800

    def test_writes_the_server_clock_on_every_save(self, auth_client):
        exam, _ = make_exam(time_limit=30)
        sid = start(auth_client, exam).data["data"]["id"]
        r = auth_client.patch(f"{SESSIONS}{sid}/", {"current_question": 2}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["time_remaining"] == r.data["data"]["server_time_remaining"]

    def test_rejects_an_oversized_client_blob(self, auth_client):
        exam, _ = make_exam()
        sid = start(auth_client, exam).data["data"]["id"]
        r = auth_client.patch(
            f"{SESSIONS}{sid}/",
            {"client_session_data": {"questions": {"x": {"note": "z" * 300_000}}}},
            format="json",
        )
        assert r.status_code == 400


class TestAnswer:
    def test_saves_and_upserts(self, auth_client):
        exam, qs = make_exam(answers=("A", "B"))
        sid = start(auth_client, exam).data["data"]["id"]
        url = f"{SESSIONS}{sid}/answer/"
        assert (
            auth_client.post(
                url, {"question": str(qs[0].id), "chosen_answer": "A"}, format="json"
            ).status_code
            == 200
        )
        assert (
            auth_client.post(
                url, {"question": str(qs[0].id), "chosen_answer": "C"}, format="json"
            ).status_code
            == 200
        )
        responses = ExamResponse.objects.filter(session_id=sid, question=qs[0])
        assert responses.count() == 1
        assert responses.first().chosen_answer == "C"

    def test_foreign_question_rejected(self, auth_client):
        exam, _ = make_exam()
        sid = start(auth_client, exam).data["data"]["id"]
        stray = QuestionFactory()
        r = auth_client.post(
            f"{SESSIONS}{sid}/answer/",
            {"question": str(stray.id), "chosen_answer": "A"},
            format="json",
        )
        assert r.status_code == 400
        assert r.data["error"]["code"] == "EXAM_SESSION_ERROR"


class TestSubmitAndResult:
    def _started(self, auth_client):
        exam, qs = make_exam(answers=("A", "B", "C"))
        sid = start(auth_client, exam).data["data"]["id"]
        return sid, qs

    def test_grades_correctly(self, auth_client):
        sid, qs = self._started(auth_client)
        answer = f"{SESSIONS}{sid}/answer/"
        auth_client.post(
            answer, {"question": str(qs[0].id), "chosen_answer": "A"}, format="json"
        )  # correct
        auth_client.post(
            answer, {"question": str(qs[1].id), "chosen_answer": "Z"}, format="json"
        )  # wrong
        # qs[2] left unanswered → skipped
        r = auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")
        assert r.status_code == 200
        d = r.data["data"]
        assert (
            d["total_correct"],
            d["total_incorrect"],
            d["total_skipped"],
            d["total_questions"],
        ) == (1, 1, 1, 3)
        assert float(d["accuracy_pct"]) == pytest.approx(33.33)
        assert "categories" in d["score_breakdown"]

    def test_status_becomes_completed(self, auth_client):
        sid, _ = self._started(auth_client)
        auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")
        assert ExamSession.objects.get(id=sid).status == "completed"

    def test_submit_is_idempotent(self, auth_client):
        sid, _ = self._started(auth_client)
        r1 = auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")
        r2 = auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")
        assert r2.status_code == 200
        assert r1.data["data"]["total_questions"] == r2.data["data"]["total_questions"] == 3

    def test_cannot_answer_after_submit(self, auth_client):
        sid, qs = self._started(auth_client)
        auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")
        r = auth_client.post(
            f"{SESSIONS}{sid}/answer/",
            {"question": str(qs[0].id), "chosen_answer": "A"},
            format="json",
        )
        assert r.status_code == 400
        assert r.data["error"]["code"] == "EXAM_SESSION_ERROR"

    def test_result_endpoint(self, auth_client):
        sid, _ = self._started(auth_client)
        assert auth_client.get(f"{SESSIONS}{sid}/result/").status_code == 400  # not yet submitted
        auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")
        r = auth_client.get(f"{SESSIONS}{sid}/result/")
        assert r.status_code == 200
        assert r.data["data"]["total_questions"] == 3


class TestHistory:
    def test_lists_my_sessions(self, auth_client):
        exam_a, _ = make_exam()
        exam_b, _ = make_exam()
        start(auth_client, exam_a)
        start(auth_client, exam_b)
        r = auth_client.get(SESSIONS)
        assert r.status_code == 200
        assert r.data["success"] is True
        assert len(r.data["data"]) == 2
        assert "pagination" in r.data["meta"]

    def test_excludes_other_users(self, auth_client):
        exam, _ = make_exam()
        start(auth_client, exam)
        other = APIClient()
        other.force_authenticate(UserFactory())
        assert len(other.get(SESSIONS).data["data"]) == 0


class TestPauseResume:
    def test_pause_then_resume(self, auth_client):
        exam, _ = make_exam(time_limit=30, allow_pause=True)
        sid = start(auth_client, exam).data["data"]["id"]
        r = auth_client.post(f"{SESSIONS}{sid}/pause/", {}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["status"] == "paused"
        r2 = auth_client.post(f"{SESSIONS}{sid}/resume/", {}, format="json")
        assert r2.status_code == 200
        assert r2.data["data"]["status"] == "in_progress"

    def test_invigilated_paper_cannot_be_paused(self, auth_client):
        """Pause freezes the clock, so on a timed paper it IS unlimited time."""
        exam, _ = make_exam(time_limit=30, allow_pause=False)
        sid = start(auth_client, exam).data["data"]["id"]
        r = auth_client.post(f"{SESSIONS}{sid}/pause/", {}, format="json")
        assert r.status_code == 400
        assert r.data["error"]["code"] == "EXAM_SESSION_ERROR"

    def test_cannot_answer_while_paused(self, auth_client):
        exam, qs = make_exam(allow_pause=True)
        sid = start(auth_client, exam).data["data"]["id"]
        auth_client.post(f"{SESSIONS}{sid}/pause/", {}, format="json")
        r = auth_client.post(
            f"{SESSIONS}{sid}/answer/",
            {"question": str(qs[0].id), "chosen_answer": "A"},
            format="json",
        )
        assert r.status_code == 400
        assert r.data["error"]["code"] == "EXAM_SESSION_ERROR"

    def test_cannot_pause_completed(self, auth_client):
        exam, _ = make_exam(allow_pause=True)
        sid = start(auth_client, exam).data["data"]["id"]
        auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")
        assert auth_client.post(f"{SESSIONS}{sid}/pause/", {}, format="json").status_code == 400

    def test_cannot_resume_in_progress(self, auth_client):
        exam, _ = make_exam()
        sid = start(auth_client, exam).data["data"]["id"]
        assert auth_client.post(f"{SESSIONS}{sid}/resume/", {}, format="json").status_code == 400

    def test_paused_timer_is_frozen(self):
        """While paused, remaining is measured to paused_at, not now."""
        from datetime import timedelta

        from django.utils import timezone

        from apps.assessments.services import server_time_remaining
        from apps.assessments.tests.factories import ExamSessionFactory

        exam = ExamTemplateFactory(time_limit=30)
        session = ExamSessionFactory(
            user=UserFactory(), exam=exam, status=ExamSession.Status.PAUSED
        )
        # Started 10 min ago, paused 4 min ago → only 6 min counted (≈24 min left).
        session.started_at = timezone.now() - timedelta(minutes=10)
        session.paused_at = timezone.now() - timedelta(minutes=4)
        session.save()
        remaining = server_time_remaining(session)
        assert 1430 <= remaining <= 1440  # ~1440s, NOT ~1200s if it used "now"


class TestScaledScoring:
    def test_section_scores_and_total(self, auth_client):
        from apps.question_bank.tests.factories import QuestionFactory

        exam = ExamTemplateFactory(access_level="public", time_limit=30)
        section = ExamSectionFactory(exam=exam, section_number=1)
        qm1 = QuestionFactory(module="math", correct_answer="A")
        qm2 = QuestionFactory(module="math", correct_answer="A")
        qr1 = QuestionFactory(module="reading_writing", correct_answer="A")
        qr2 = QuestionFactory(module="reading_writing", correct_answer="A")
        for i, q in enumerate([qm1, qm2, qr1, qr2], start=1):
            ExamQuestionFactory(section=section, question=q, position=i)

        sid = start(auth_client, exam).data["data"]["id"]
        answer = f"{SESSIONS}{sid}/answer/"
        auth_client.post(answer, {"question": str(qm1.id), "chosen_answer": "A"}, format="json")
        auth_client.post(answer, {"question": str(qr1.id), "chosen_answer": "A"}, format="json")
        auth_client.post(answer, {"question": str(qr2.id), "chosen_answer": "A"}, format="json")
        # qm2 unanswered

        d = auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json").data["data"]
        # Scaled via the representative curve in scoring.py (CURVE anchors).
        assert d["math_score"] == 480  # 1/2 → ratio 0.5 anchor
        assert d["rw_score"] == 800  # 2/2 → ratio 1.0 ceiling
        assert d["total_score"] == 1280


class TestPerSectionTimer:
    def test_uses_current_section_limit(self):
        from datetime import timedelta

        from django.utils import timezone

        from apps.assessments.services import server_time_remaining
        from apps.assessments.tests.factories import ExamSessionFactory

        exam = ExamTemplateFactory(time_limit=None)  # no whole-exam limit
        ExamSectionFactory(exam=exam, section_number=1, time_limit=10)  # 10-min section
        session = ExamSessionFactory(
            user=UserFactory(),
            exam=exam,
            current_section=1,
            status=ExamSession.Status.IN_PROGRESS,
        )
        session.started_at = timezone.now() - timedelta(minutes=3)
        session.save()
        remaining = server_time_remaining(session)
        assert 415 <= remaining <= 420  # ~7 min left of the 10-min section

    def test_advancing_section_resets_clock(self, auth_client):
        from apps.question_bank.tests.factories import QuestionFactory

        exam = ExamTemplateFactory(access_level="public", time_limit=None)
        s1 = ExamSectionFactory(exam=exam, section_number=1, time_limit=10)
        ExamSectionFactory(exam=exam, section_number=2, time_limit=10)
        ExamQuestionFactory(section=s1, question=QuestionFactory(), position=1)

        sid = start(auth_client, exam).data["data"]["id"]
        r = auth_client.patch(f"{SESSIONS}{sid}/", {"current_section": 2}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["server_time_remaining"] >= 595  # fresh 10-min section


class TestAnswerReview:
    """GET /sessions/{id}/review/ — the post-submission answer review.

    Exposes correct answers + explanations, so it must be owner-scoped and only
    served after submit. Correctness is recomputed from the live question bank.
    """

    def _submitted(self, auth_client):
        exam, qs = make_exam(answers=("A", "B", "C"))
        sid = start(auth_client, exam).data["data"]["id"]
        answer = f"{SESSIONS}{sid}/answer/"
        auth_client.post(answer, {"question": str(qs[0].id), "chosen_answer": "A"}, format="json")
        auth_client.post(answer, {"question": str(qs[1].id), "chosen_answer": "D"}, format="json")
        # qs[2] deliberately left unanswered
        auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")
        return sid, qs

    def test_requires_submission(self, auth_client):
        exam, _ = make_exam()
        sid = start(auth_client, exam).data["data"]["id"]
        r = auth_client.get(f"{SESSIONS}{sid}/review/")
        assert r.status_code == 400
        assert r.data["error"]["code"] == "EXAM_SESSION_ERROR"

    def test_other_users_get_404(self, auth_client):
        sid, _ = self._submitted(auth_client)
        other = APIClient()
        other.force_authenticate(UserFactory())
        assert other.get(f"{SESSIONS}{sid}/review/").status_code == 404

    def test_returns_every_question_in_exam_order(self, auth_client):
        sid, qs = self._submitted(auth_client)
        rows = auth_client.get(f"{SESSIONS}{sid}/review/").data["data"]
        assert [r["number"] for r in rows] == [1, 2, 3]
        assert [r["question"]["id"] for r in rows] == [str(q.id) for q in qs]

    def test_marks_correct_incorrect_and_skipped(self, auth_client):
        sid, _ = self._submitted(auth_client)
        rows = auth_client.get(f"{SESSIONS}{sid}/review/").data["data"]
        assert [r["status"] for r in rows] == ["correct", "incorrect", "skipped"]
        assert [r["chosen_answer"] for r in rows] == ["A", "D", None]
        assert [r["correct_answer"] for r in rows] == ["A", "B", "C"]

    def test_shows_choices_but_not_the_explanation(self, auth_client):
        """The review is right-and-wrong only: the key, the answer, the verdict.

        Explanations are deliberately not in the shape — the review is a score
        check, not a lesson, and every field here has to stay behind the
        submitted-session gate.
        """
        from apps.question_bank.tests.factories import ChoiceFactory

        exam, qs = make_exam(answers=("A",))
        qs[0].explanation = "Because alpha."
        qs[0].save(update_fields=["explanation"])
        ChoiceFactory(question=qs[0], label="A", text="alpha")
        ChoiceFactory(question=qs[0], label="B", text="beta")
        sid = start(auth_client, exam).data["data"]["id"]
        auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")

        row = auth_client.get(f"{SESSIONS}{sid}/review/").data["data"][0]
        assert "explanation" not in row
        assert "explanation_image_url" not in row
        assert "explanation" not in row["question"]
        assert set(row) == {
            "number",
            "section_number",
            "section_title",
            "question",
            "correct_answer",
            "chosen_answer",
            "status",
        }
        assert {c["text"] for c in row["question"]["choices"]} == {"alpha", "beta"}

    def test_reflects_a_live_question_edit(self, auth_client):
        """Questions are not versioned — editing one updates a past review."""
        sid, qs = self._submitted(auth_client)
        rows = auth_client.get(f"{SESSIONS}{sid}/review/").data["data"]
        assert rows[1]["status"] == "incorrect"

        # An admin corrects the answer key to what the student actually chose.
        qs[1].correct_answer = "D"
        qs[1].stem = "corrected stem"
        qs[1].save(update_fields=["correct_answer", "stem"])

        rows = auth_client.get(f"{SESSIONS}{sid}/review/").data["data"]
        assert rows[1]["status"] == "correct"
        assert rows[1]["correct_answer"] == "D"
        assert rows[1]["question"]["stem"] == "corrected stem"

    def test_grid_in_equivalence_counts_as_correct(self, auth_client):
        exam, qs = make_exam(answers=("7/2",))
        qs[0].answer_type = "grid_in"
        qs[0].save(update_fields=["answer_type"])
        sid = start(auth_client, exam).data["data"]["id"]
        auth_client.post(
            f"{SESSIONS}{sid}/answer/",
            {"question": str(qs[0].id), "chosen_answer": "3.5"},
            format="json",
        )
        auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")
        rows = auth_client.get(f"{SESSIONS}{sid}/review/").data["data"]
        assert rows[0]["status"] == "correct"
