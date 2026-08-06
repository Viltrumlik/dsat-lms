"""
DSAT LMS v2 — Homework 2.0 lifecycle tests
Domain: Homework
Covers: handing work in (text + files, with ownership enforced), handing it back
        for another go, marking it, the attempt counter and the event trail, the
        late flag, and the start-a-linked-exam path going through the same
        session gate as POST /sessions/.
"""

import datetime as dt

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.academy.models import ClassEnrollment
from apps.academy.tests.factories import ClassFactory
from apps.assessments.models import ExamSession
from apps.assessments.tests.factories import (
    ExamQuestionFactory,
    ExamSectionFactory,
    ExamTemplateFactory,
)
from apps.files.models import Attachment
from apps.homework.models import HomeworkEvent, HomeworkSubmission
from apps.homework.tests.factories import HomeworkFactory
from apps.identity.tests.factories import UserFactory
from apps.question_bank.tests.factories import QuestionFactory

pytestmark = pytest.mark.django_db

BASE = "/api/v1/homework/"


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    client.user = user
    return client


def attachment_for(user, name="work.pdf"):
    return Attachment.objects.create(
        owner=user,
        uploaded_by=user,
        file=f"uploads/{name}",
        original_name=name,
        content_type="application/pdf",
        size=1024,
        kind=Attachment.Kind.HOMEWORK,
    )


@pytest.fixture
def setup():
    """A teacher, their class, an enrolled student, and one homework."""
    teacher = UserFactory(role="teacher")
    student = UserFactory(role="student")
    klass = ClassFactory(teacher=teacher)
    ClassEnrollment.objects.create(
        klass=klass, student=student, status=ClassEnrollment.Status.ACTIVE
    )
    homework = HomeworkFactory(
        assigned_class=klass,
        assigned_by=teacher,
        due_at=timezone.now() + dt.timedelta(days=3),
    )
    return teacher, student, klass, homework


class TestHandingWorkIn:
    def test_submits_text_and_files(self, setup):
        _, student, _, homework = setup
        client = client_for(student)
        attachment = attachment_for(student)

        r = client.post(
            f"{BASE}{homework.id}/submit/",
            {"response_text": "Here is my working.", "attachment_ids": [str(attachment.id)]},
            format="json",
        )
        assert r.status_code == 200
        d = r.data["data"]
        assert d["status"] == "submitted"
        assert d["response_text"] == "Here is my working."
        assert d["attempt_number"] == 1
        assert [f["original_name"] for f in d["files"]] == ["work.pdf"]
        assert d["is_late"] is False

    def test_cannot_attach_someone_elses_file(self, setup):
        """Otherwise a guessed id hands the teacher a readable link to it."""
        _, student, _, homework = setup
        stranger_file = attachment_for(UserFactory(role="student"), "secret.pdf")

        r = client_for(student).post(
            f"{BASE}{homework.id}/submit/",
            {"attachment_ids": [str(stranger_file.id)]},
            format="json",
        )
        assert r.status_code == 400
        assert r.data["error"]["field"] == "attachments"

    def test_late_is_stamped_at_submit_not_computed_on_read(self, setup):
        """Moving the due date afterwards must not rewrite history."""
        teacher, student, klass, _ = setup
        overdue = HomeworkFactory(
            assigned_class=klass,
            assigned_by=teacher,
            due_at=timezone.now() - dt.timedelta(days=1),
        )
        r = client_for(student).post(f"{BASE}{overdue.id}/submit/", {}, format="json")
        assert r.data["data"]["is_late"] is True

        # Teacher extends the deadline — the record of lateness stands.
        overdue.due_at = timezone.now() + dt.timedelta(days=7)
        overdue.save(update_fields=["due_at"])
        submission = HomeworkSubmission.objects.get(homework=overdue, student=student)
        assert submission.is_late is True

    def test_records_an_event(self, setup):
        _, student, _, homework = setup
        client_for(student).post(f"{BASE}{homework.id}/submit/", {}, format="json")
        submission = HomeworkSubmission.objects.get(homework=homework, student=student)
        assert [e.kind for e in submission.events.all()] == ["submitted"]


class TestHandingWorkBack:
    def _submitted(self, setup):
        _, student, _, homework = setup
        client_for(student).post(
            f"{BASE}{homework.id}/submit/", {"response_text": "v1"}, format="json"
        )
        return HomeworkSubmission.objects.get(homework=homework, student=student)

    def test_teacher_returns_for_revision(self, setup):
        teacher, student, _, homework = setup
        submission = self._submitted(setup)

        r = client_for(teacher).post(
            f"{BASE}{homework.id}/submissions/{submission.id}/return/",
            {"note": "Show your working on Q3."},
            format="json",
        )
        assert r.status_code == 200
        assert r.data["data"]["status"] == "returned"
        assert r.data["data"]["feedback"] == "Show your working on Q3."

    def test_returned_work_can_be_handed_in_again(self, setup):
        teacher, student, _, homework = setup
        submission = self._submitted(setup)
        client_for(teacher).post(
            f"{BASE}{homework.id}/submissions/{submission.id}/return/", {}, format="json"
        )

        r = client_for(student).post(
            f"{BASE}{homework.id}/submit/", {"response_text": "v2"}, format="json"
        )
        assert r.status_code == 200
        assert r.data["data"]["status"] == "submitted"
        assert r.data["data"]["attempt_number"] == 2
        assert r.data["data"]["response_text"] == "v2"

    def test_returning_clears_a_stale_grade(self, setup):
        """A returned piece is not a graded piece — leaving the mark would feed
        the gradebook a score for work being redone."""
        teacher, _, _, homework = setup
        submission = self._submitted(setup)
        tc = client_for(teacher)
        tc.post(
            f"{BASE}{homework.id}/submissions/{submission.id}/grade/",
            {"grade": "80"},
            format="json",
        )
        r = tc.post(f"{BASE}{homework.id}/submissions/{submission.id}/return/", {}, format="json")
        assert r.data["data"]["grade"] is None
        assert r.data["data"]["graded_at"] is None

    def test_nothing_to_hand_back_before_it_is_handed_in(self, setup):
        teacher, student, _, homework = setup
        submission = HomeworkSubmission.objects.create(homework=homework, student=student)
        r = client_for(teacher).post(
            f"{BASE}{homework.id}/submissions/{submission.id}/return/", {}, format="json"
        )
        assert r.status_code == 400


class TestMarking:
    def _submitted(self, setup):
        _, student, _, homework = setup
        client_for(student).post(f"{BASE}{homework.id}/submit/", {}, format="json")
        return HomeworkSubmission.objects.get(homework=homework, student=student)

    def test_grades_with_feedback(self, setup):
        teacher, _, _, homework = setup
        submission = self._submitted(setup)
        r = client_for(teacher).post(
            f"{BASE}{homework.id}/submissions/{submission.id}/grade/",
            {"grade": "92.5", "feedback": "Strong work."},
            format="json",
        )
        assert r.status_code == 200
        assert r.data["data"]["status"] == "graded"
        assert str(r.data["data"]["grade"]) == "92.50"
        assert r.data["data"]["feedback"] == "Strong work."

    def test_cannot_grade_work_never_handed_in(self, setup):
        teacher, student, _, homework = setup
        submission = HomeworkSubmission.objects.create(homework=homework, student=student)
        r = client_for(teacher).post(
            f"{BASE}{homework.id}/submissions/{submission.id}/grade/",
            {"grade": "50"},
            format="json",
        )
        assert r.status_code == 400

    def test_a_student_cannot_resubmit_graded_work(self, setup):
        teacher, student, _, homework = setup
        submission = self._submitted(setup)
        client_for(teacher).post(
            f"{BASE}{homework.id}/submissions/{submission.id}/grade/",
            {"grade": "70"},
            format="json",
        )
        r = client_for(student).post(f"{BASE}{homework.id}/submit/", {}, format="json")
        assert r.status_code == 400

    def test_another_teacher_cannot_grade_it(self, setup):
        _, _, _, homework = setup
        submission = self._submitted(setup)
        r = client_for(UserFactory(role="teacher")).post(
            f"{BASE}{homework.id}/submissions/{submission.id}/grade/",
            {"grade": "100"},
            format="json",
        )
        assert r.status_code == 404

    def test_the_trail_records_every_move(self, setup):
        teacher, student, _, homework = setup
        submission = self._submitted(setup)
        tc = client_for(teacher)
        tc.post(f"{BASE}{homework.id}/submissions/{submission.id}/return/", {}, format="json")
        client_for(student).post(f"{BASE}{homework.id}/submit/", {}, format="json")
        tc.post(
            f"{BASE}{homework.id}/submissions/{submission.id}/grade/",
            {"grade": "88"},
            format="json",
        )
        kinds = list(
            HomeworkEvent.objects.filter(submission=submission).values_list("kind", flat=True)
        )
        assert kinds == ["submitted", "returned", "submitted", "graded"]


class TestStartingTheLinkedExam:
    def _exam_homework(self, setup):
        teacher, student, klass, _ = setup
        exam = ExamTemplateFactory(access_level="academy", time_limit=30)
        section = ExamSectionFactory(exam=exam, section_number=1)
        ExamQuestionFactory(section=section, question=QuestionFactory(), position=1)
        homework = HomeworkFactory(
            assigned_class=klass,
            assigned_by=teacher,
            exam=exam,
            due_at=timezone.now() + dt.timedelta(days=3),
        )
        return exam, homework

    def test_starting_twice_does_not_mint_a_second_clock(self, setup):
        """It used to create an ExamSession directly, bypassing the session gate —
        so pressing Start twice handed out a second paper with a fresh clock."""
        _, student, _, _ = setup
        exam, homework = self._exam_homework(setup)
        client = client_for(student)

        first = client.post(f"{BASE}{homework.id}/start/", {}, format="json")
        assert first.status_code == 201
        second = client.post(f"{BASE}{homework.id}/start/", {}, format="json")
        assert second.data["data"]["id"] == first.data["data"]["id"]
        assert ExamSession.objects.filter(user=student, exam=exam).count() == 1

    def test_finishing_the_exam_hands_the_homework_in(self, setup):
        _, student, _, _ = setup
        _, homework = self._exam_homework(setup)
        client = client_for(student)
        session_id = client.post(f"{BASE}{homework.id}/start/", {}, format="json").data["data"][
            "id"
        ]

        client.post(f"/api/v1/sessions/{session_id}/submit/", {}, format="json")

        submission = HomeworkSubmission.objects.get(homework=homework, student=student)
        assert submission.status == "submitted"
        assert submission.attempt_number == 1
        # The auto hand-in is a hand-in like any other — it leaves a trail.
        assert [e.kind for e in submission.events.all()] == ["submitted"]


class TestBriefMaterials:
    def test_teacher_attaches_materials_to_the_brief(self, setup):
        teacher, student, klass, _ = setup
        worksheet = attachment_for(teacher, "worksheet.pdf")

        r = client_for(teacher).post(
            BASE,
            {
                "title": "Read chapter 4",
                "assigned_class": str(klass.id),
                "due_at": "2026-12-31T00:00:00Z",
                "attachment_ids": [str(worksheet.id)],
            },
            format="json",
        )
        assert r.status_code == 201

        # The student sees the material on their copy of the brief.
        listed = client_for(student).get(BASE).data["data"]
        brief = next(h for h in listed if h["title"] == "Read chapter 4")
        assert [a["original_name"] for a in brief["attachments"]] == ["worksheet.pdf"]
