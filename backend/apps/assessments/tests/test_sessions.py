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


def make_exam(access_level="public", time_limit=30, answers=("A", "B", "C")):
    exam = ExamTemplateFactory(access_level=access_level, time_limit=time_limit)
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

    def test_rejects_time_cheat(self, auth_client):
        exam, _ = make_exam(time_limit=30)  # ~1800s on the server clock
        sid = start(auth_client, exam).data["data"]["id"]
        r = auth_client.patch(f"{SESSIONS}{sid}/", {"time_remaining": 99999}, format="json")
        assert r.status_code == 400
        assert r.data["error"]["code"] == "EXAM_SESSION_ERROR"
        assert r.data["error"]["field"] == "time_remaining"

    def test_accepts_valid_time(self, auth_client):
        exam, _ = make_exam(time_limit=30)
        sid = start(auth_client, exam).data["data"]["id"]
        r = auth_client.patch(f"{SESSIONS}{sid}/", {"time_remaining": 1700}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["time_remaining"] <= 1800


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
