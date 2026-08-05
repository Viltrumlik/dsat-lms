"""
DSAT LMS v2 — Exam integrity tests
Domain: Assessments
Covers: the ways a student could previously buy themselves time or read the
        answer key, each one pinned so it cannot come back.

  timer   forward-only sections (the section-clock reset), section-vs-exam clock
          separation (the stranded student), no second session on one paper,
          pause refused on invigilated papers, answers refused for a finished
          section
  answers the question-bank study view locked while a paper is open, correctness
          withheld from the runner until submit
  gates   assignment window + attempt cap, free-tier quotas
"""

import datetime as dt

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.academy.models import Class, ClassEnrollment
from apps.assessments.models import ExamAssignment, ExamSession
from apps.assessments.tests.factories import (
    ExamQuestionFactory,
    ExamSectionFactory,
    ExamTemplateFactory,
)
from apps.identity.tests.factories import UserFactory
from apps.question_bank.tests.factories import QuestionFactory

pytestmark = pytest.mark.django_db

SESSIONS = "/api/v1/sessions/"
QUESTIONS = "/api/v1/questions/"


def two_section_exam(*, section_minutes=30, exam_minutes=None):
    """A paper with two timed modules, one question each."""
    exam = ExamTemplateFactory(access_level="public", time_limit=exam_minutes)
    questions = []
    for number in (1, 2):
        section = ExamSectionFactory(exam=exam, section_number=number, time_limit=section_minutes)
        question = QuestionFactory(correct_answer="A")
        ExamQuestionFactory(section=section, question=question, position=1)
        questions.append(question)
    return exam, questions


def start(client, exam):
    return client.post(SESSIONS, {"exam": str(exam.id)}, format="json")


def age_section_clock(session_id, minutes):
    """Backdate the section clock so the module reads as expired."""
    when = timezone.now() - dt.timedelta(minutes=minutes)
    ExamSession.all_objects.filter(pk=session_id).update(started_at=when, section_started_at=when)


class TestSectionClockCannotBeReset:
    def test_sections_move_forward_only(self, auth_client):
        """2 -> 1 -> 2 used to restamp the module clock on every hop."""
        exam, _ = two_section_exam()
        sid = start(auth_client, exam).data["data"]["id"]

        assert (
            auth_client.patch(
                f"{SESSIONS}{sid}/", {"current_section": 2}, format="json"
            ).status_code
            == 200
        )
        back = auth_client.patch(f"{SESSIONS}{sid}/", {"current_section": 1}, format="json")
        assert back.status_code == 400
        assert back.data["error"]["field"] == "current_section"

    def test_advancing_does_not_extend_a_later_return(self, auth_client):
        exam, _ = two_section_exam()
        sid = start(auth_client, exam).data["data"]["id"]
        auth_client.patch(f"{SESSIONS}{sid}/", {"current_section": 2}, format="json")

        session = ExamSession.objects.get(pk=sid)
        stamped = session.section_started_at
        assert stamped is not None

        # A refused backward hop must not have touched the clock.
        auth_client.patch(f"{SESSIONS}{sid}/", {"current_section": 1}, format="json")
        session.refresh_from_db()
        assert session.section_started_at == stamped
        assert session.current_section == 2


class TestSpentSectionIsNotASpentPaper:
    def test_expired_section_still_allows_the_advance(self, auth_client):
        """The bug that stranded students: refused the advance, so never able to
        reach the module they still had time in."""
        exam, _ = two_section_exam(section_minutes=30)
        sid = start(auth_client, exam).data["data"]["id"]
        age_section_clock(sid, minutes=31)

        # Ordinary saves are refused — this module is over.
        stuck = auth_client.patch(f"{SESSIONS}{sid}/", {"current_question": 1}, format="json")
        assert stuck.status_code == 400

        # But moving on is exactly what they must be able to do.
        advance = auth_client.patch(f"{SESSIONS}{sid}/", {"current_section": 2}, format="json")
        assert advance.status_code == 200
        assert advance.data["data"]["current_section"] == 2
        assert advance.data["data"]["section_time_remaining"] > 0

    def test_expired_exam_clock_stops_everything(self, auth_client):
        exam, _ = two_section_exam(section_minutes=30, exam_minutes=30)
        sid = start(auth_client, exam).data["data"]["id"]
        age_section_clock(sid, minutes=31)

        r = auth_client.patch(f"{SESSIONS}{sid}/", {"current_section": 2}, format="json")
        assert r.status_code == 400
        assert "submit" in r.data["error"]["message"].lower()


class TestAnswersAreSectionScoped:
    def test_cannot_answer_a_finished_section(self, auth_client):
        """Otherwise per-section timing means nothing: advance, then keep
        answering module 1 on module 2's clock."""
        exam, questions = two_section_exam()
        sid = start(auth_client, exam).data["data"]["id"]
        auth_client.patch(f"{SESSIONS}{sid}/", {"current_section": 2}, format="json")

        r = auth_client.post(
            f"{SESSIONS}{sid}/answer/",
            {"question": str(questions[0].id), "chosen_answer": "A"},
            format="json",
        )
        assert r.status_code == 400
        assert r.data["error"]["field"] == "question"

    def test_current_section_answers_are_accepted(self, auth_client):
        exam, questions = two_section_exam()
        sid = start(auth_client, exam).data["data"]["id"]
        r = auth_client.post(
            f"{SESSIONS}{sid}/answer/",
            {"question": str(questions[0].id), "chosen_answer": "A"},
            format="json",
        )
        assert r.status_code == 200

    def test_answer_never_echoes_correctness(self, auth_client):
        """An answer endpoint that reports right/wrong is an oracle."""
        exam, questions = two_section_exam()
        sid = start(auth_client, exam).data["data"]["id"]
        r = auth_client.post(
            f"{SESSIONS}{sid}/answer/",
            {"question": str(questions[0].id), "chosen_answer": "A"},
            format="json",
        )
        assert "is_correct" not in r.data["data"]

    def test_session_detail_withholds_correctness_until_submit(self, auth_client):
        exam, questions = two_section_exam()
        sid = start(auth_client, exam).data["data"]["id"]
        auth_client.post(
            f"{SESSIONS}{sid}/answer/",
            {"question": str(questions[0].id), "chosen_answer": "A"},
            format="json",
        )

        live = auth_client.get(f"{SESSIONS}{sid}/").data["data"]
        assert live["responses"]
        assert all("is_correct" not in r for r in live["responses"])

        auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")
        graded = auth_client.get(f"{SESSIONS}{sid}/").data["data"]
        assert all("is_correct" in r for r in graded["responses"])


class TestStudyViewIsLockedDuringAPaper:
    def test_answer_key_is_hidden_for_a_question_in_a_live_session(self, auth_client):
        """The leak: the runner hands out question ids, and the study view hands
        out that same question's answer to anyone who asks."""
        exam, questions = two_section_exam()
        target = questions[0]

        before = auth_client.get(f"{QUESTIONS}{target.id}/")
        assert before.status_code == 200
        assert before.data["data"]["correct_answer"] == "A"

        sid = start(auth_client, exam).data["data"]["id"]
        during = auth_client.get(f"{QUESTIONS}{target.id}/")
        assert during.status_code == 403
        assert during.data["error"]["code"] == "PERMISSION_DENIED"

        auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")
        after = auth_client.get(f"{QUESTIONS}{target.id}/")
        assert after.status_code == 200

    def test_a_paused_paper_still_locks_it(self, auth_client):
        exam, questions = two_section_exam()
        exam.allow_pause = True
        exam.save(update_fields=["allow_pause"])
        sid = start(auth_client, exam).data["data"]["id"]
        auth_client.post(f"{SESSIONS}{sid}/pause/", {}, format="json")

        assert auth_client.get(f"{QUESTIONS}{questions[0].id}/").status_code == 403

    def test_unrelated_questions_stay_readable(self, auth_client):
        exam, _ = two_section_exam()
        start(auth_client, exam)
        stray = QuestionFactory(correct_answer="B")
        assert auth_client.get(f"{QUESTIONS}{stray.id}/").status_code == 200

    def test_another_students_paper_does_not_lock_me_out(self, auth_client):
        exam, questions = two_section_exam()
        other = APIClient()
        other.force_authenticate(UserFactory(role="student"))
        start(other, exam)

        assert auth_client.get(f"{QUESTIONS}{questions[0].id}/").status_code == 200


class TestOneLivePaperPerExam:
    def test_starting_twice_returns_the_same_session(self, auth_client):
        """A second session would start a second clock."""
        exam, _ = two_section_exam()
        first = start(auth_client, exam)
        assert first.status_code == 201
        second = start(auth_client, exam)
        assert second.status_code == 200
        assert second.data["data"]["id"] == first.data["data"]["id"]
        assert ExamSession.objects.filter(exam=exam, user=auth_client.user).count() == 1

    def test_a_new_session_is_allowed_once_the_first_is_in(self, auth_client):
        exam, _ = two_section_exam()
        first = start(auth_client, exam).data["data"]["id"]
        auth_client.post(f"{SESSIONS}{first}/submit/", {}, format="json")

        second = start(auth_client, exam)
        assert second.status_code == 201
        assert second.data["data"]["id"] != first


class TestAssignmentWindowIsEnforced:
    def _assigned(self, student, exam, *, opens, closes, max_attempts=1):
        klass = Class.objects.create(name="G1", teacher=UserFactory(role="teacher"))
        ClassEnrollment.objects.create(klass=klass, student=student, status="active")
        return ExamAssignment.objects.create(
            exam=exam,
            assigned_by=student,
            assigned_class=klass,
            opens_at=opens,
            closes_at=closes,
            max_attempts=max_attempts,
        )

    def test_cannot_start_before_it_opens(self, api_client):
        student = UserFactory(role="student")
        api_client.force_authenticate(student)
        exam, _ = two_section_exam()
        now = timezone.now()
        self._assigned(
            student, exam, opens=now + dt.timedelta(days=1), closes=now + dt.timedelta(days=2)
        )

        r = start(api_client, exam)
        assert r.status_code == 400
        assert r.data["error"]["code"] == "EXAM_NOT_OPEN_YET"

    def test_cannot_start_after_it_closes(self, api_client):
        student = UserFactory(role="student")
        api_client.force_authenticate(student)
        exam, _ = two_section_exam()
        now = timezone.now()
        self._assigned(
            student, exam, opens=now - dt.timedelta(days=2), closes=now - dt.timedelta(days=1)
        )

        r = start(api_client, exam)
        assert r.status_code == 400
        assert r.data["error"]["code"] == "EXAM_CLOSED"

    def test_attempts_are_capped_and_the_session_is_filed_under_it(self, api_client):
        student = UserFactory(role="student")
        api_client.force_authenticate(student)
        exam, _ = two_section_exam()
        now = timezone.now()
        assignment = self._assigned(
            student,
            exam,
            opens=now - dt.timedelta(hours=1),
            closes=now + dt.timedelta(days=1),
            max_attempts=1,
        )

        first = start(api_client, exam)
        assert first.status_code == 201
        assert ExamSession.objects.get(pk=first.data["data"]["id"]).assignment_id == assignment.id

        api_client.post(f"{SESSIONS}{first.data['data']['id']}/submit/", {}, format="json")
        second = start(api_client, exam)
        assert second.status_code == 400
        assert second.data["error"]["code"] == "EXAM_ATTEMPTS_EXHAUSTED"

    def test_an_abandoned_attempt_still_counts(self, api_client):
        """Otherwise closing the tab is a free reroll."""
        student = UserFactory(role="student")
        api_client.force_authenticate(student)
        exam, _ = two_section_exam()
        now = timezone.now()
        self._assigned(
            student,
            exam,
            opens=now - dt.timedelta(hours=1),
            closes=now + dt.timedelta(days=1),
            max_attempts=1,
        )
        sid = start(api_client, exam).data["data"]["id"]
        ExamSession.objects.filter(pk=sid).update(status=ExamSession.Status.ABANDONED)

        r = start(api_client, exam)
        assert r.status_code == 400
        assert r.data["error"]["code"] == "EXAM_ATTEMPTS_EXHAUSTED"

    def test_an_unassigned_exam_is_ungated(self, auth_client):
        exam, _ = two_section_exam()
        assert start(auth_client, exam).status_code == 201


class TestFreeTierQuotas:
    @override_settings(PUBLIC_PRACTICE_TEST_LIMIT_PER_WEEK=2)
    def test_practice_is_capped_per_week_for_public_users(self, auth_client):
        for _ in range(2):
            exam, _ = two_section_exam()
            exam.type = "practice"
            exam.save(update_fields=["type"])
            sid = start(auth_client, exam).data["data"]["id"]
            auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")

        third, _ = two_section_exam()
        third.type = "practice"
        third.save(update_fields=["type"])
        r = start(auth_client, third)
        assert r.status_code == 400
        assert r.data["error"]["code"] == "PRACTICE_LIMIT_REACHED"

    @override_settings(PUBLIC_PRACTICE_TEST_LIMIT_PER_WEEK=1)
    def test_academy_members_are_not_capped(self, api_client):
        api_client.force_authenticate(UserFactory(role="student"))
        for _ in range(3):
            exam, _ = two_section_exam()
            exam.type = "practice"
            exam.save(update_fields=["type"])
            r = start(api_client, exam)
            assert r.status_code == 201
            api_client.post(f"{SESSIONS}{r.data['data']['id']}/submit/", {}, format="json")

    @override_settings(PUBLIC_PAST_PAPER_LIMIT=1)
    def test_past_papers_are_capped_for_the_life_of_the_account(self, auth_client):
        first, _ = two_section_exam()
        first.type = "past_paper"
        first.save(update_fields=["type"])
        sid = start(auth_client, first).data["data"]["id"]
        auth_client.post(f"{SESSIONS}{sid}/submit/", {}, format="json")

        second, _ = two_section_exam()
        second.type = "past_paper"
        second.save(update_fields=["type"])
        r = start(auth_client, second)
        assert r.status_code == 400
        assert r.data["error"]["code"] == "PAST_PAPER_LIMIT_REACHED"


class TestStrandedSessionsAreGradedNotDiscarded:
    def test_expired_session_with_answers_is_submitted(self, auth_client):
        from apps.assessments.tasks import abandon_stale_sessions

        exam, questions = two_section_exam(section_minutes=None, exam_minutes=30)
        sid = start(auth_client, exam).data["data"]["id"]
        auth_client.post(
            f"{SESSIONS}{sid}/answer/",
            {"question": str(questions[0].id), "chosen_answer": "A"},
            format="json",
        )
        long_ago = timezone.now() - dt.timedelta(days=2)
        ExamSession.all_objects.filter(pk=sid).update(started_at=long_ago, updated_at=long_ago)

        assert abandon_stale_sessions() == {"graded": 1, "abandoned": 0}
        session = ExamSession.objects.get(pk=sid)
        assert session.status == ExamSession.Status.COMPLETED
        assert session.result.total_correct == 1

    def test_expired_session_with_nothing_in_it_is_abandoned(self, auth_client):
        from apps.assessments.tasks import abandon_stale_sessions

        exam, _ = two_section_exam(section_minutes=None, exam_minutes=30)
        sid = start(auth_client, exam).data["data"]["id"]
        long_ago = timezone.now() - dt.timedelta(days=2)
        ExamSession.all_objects.filter(pk=sid).update(started_at=long_ago, updated_at=long_ago)

        assert abandon_stale_sessions() == {"graded": 0, "abandoned": 1}
        assert ExamSession.objects.get(pk=sid).status == ExamSession.Status.ABANDONED
