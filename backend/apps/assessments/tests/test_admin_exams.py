"""
DSAT LMS v2 — Admin exam-builder tests
Domain: Assessments
Covers: permission gate, exam CRUD (+ filters/search/soft-delete), sections
        (auto-numbering + duplicate guard), section questions (add published-only +
        dedupe + append, reorder-as-permutation, remove), and assignments (class /
        student target validation, schedule validation, list filter, progress).
"""

import pytest
from rest_framework.test import APIClient

from apps.academy.tests.factories import ClassFactory
from apps.assessments.models import ExamAssignment
from apps.assessments.tests.factories import (
    ExamResultFactory,
    ExamSectionFactory,
    ExamSessionFactory,
    ExamTemplateFactory,
)
from apps.identity.tests.factories import AdminUserFactory, UserFactory
from apps.question_bank.tests.factories import QuestionFactory

pytestmark = pytest.mark.django_db

ADMIN = "/api/v1/admin/"
OPENS = "2026-08-01T09:00:00Z"
CLOSES = "2026-08-08T09:00:00Z"


def admin_client():
    admin = AdminUserFactory()
    client = APIClient()
    client.force_authenticate(admin)
    client.user = admin
    return client


class TestPermissions:
    def test_unauthenticated_401(self, api_client):
        assert api_client.get(ADMIN + "exams/").status_code == 401

    def test_non_admin_forbidden(self):
        teacher = UserFactory(role="teacher")
        client = APIClient()
        client.force_authenticate(teacher)
        assert client.get(ADMIN + "exams/").status_code == 403
        assert client.get(ADMIN + "assignments/").status_code == 403


class TestExamCRUD:
    def test_create_and_detail(self):
        client = admin_client()
        r = client.post(
            ADMIN + "exams/",
            {
                "type": "practice",
                "title": "SAT Practice 1",
                "module": "full",
                "time_limit": 64,
                "access_level": "public",
            },
            format="json",
        )
        assert r.status_code == 201
        assert r.data["data"]["sections"] == []
        eid = r.data["data"]["id"]
        d = client.get(f"{ADMIN}exams/{eid}/")
        assert d.status_code == 200
        assert d.data["data"]["title"] == "SAT Practice 1"

    def test_list_filters_and_search(self):
        client = admin_client()
        ExamTemplateFactory(type="practice", access_level="public", title="Alpha")
        ExamTemplateFactory(type="mock", access_level="academy", title="Beta")
        assert len(client.get(ADMIN + "exams/").data["data"]) >= 2
        mocks = client.get(ADMIN + "exams/?type=mock").data["data"]
        assert mocks and all(e["type"] == "mock" for e in mocks)
        found = client.get(ADMIN + "exams/?search=Alpha").data["data"]
        assert [e["title"] for e in found] == ["Alpha"]

    def test_update(self):
        client = admin_client()
        exam = ExamTemplateFactory()
        r = client.patch(f"{ADMIN}exams/{exam.id}/", {"title": "Renamed"}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["title"] == "Renamed"

    def test_soft_delete_hides_from_list(self):
        client = admin_client()
        exam = ExamTemplateFactory()
        assert client.delete(f"{ADMIN}exams/{exam.id}/").status_code == 204
        exam.refresh_from_db()
        assert exam.deleted_at is not None
        assert all(e["id"] != str(exam.id) for e in client.get(ADMIN + "exams/").data["data"])


class TestSections:
    def test_create_auto_numbers(self):
        client = admin_client()
        exam = ExamTemplateFactory()
        r1 = client.post(
            f"{ADMIN}exams/{exam.id}/sections/",
            {"module": "reading_writing", "time_limit": 32},
            format="json",
        )
        assert r1.status_code == 201
        assert r1.data["data"]["section_number"] == 1
        r2 = client.post(
            f"{ADMIN}exams/{exam.id}/sections/", {"module": "math", "time_limit": 35}, format="json"
        )
        assert r2.data["data"]["section_number"] == 2
        assert len(client.get(f"{ADMIN}exams/{exam.id}/sections/").data["data"]) == 2

    def test_update_and_delete(self):
        client = admin_client()
        exam = ExamTemplateFactory()
        section = ExamSectionFactory(exam=exam)
        r = client.patch(
            f"{ADMIN}exams/{exam.id}/sections/{section.id}/", {"title": "Module 1"}, format="json"
        )
        assert r.data["data"]["title"] == "Module 1"
        assert client.delete(f"{ADMIN}exams/{exam.id}/sections/{section.id}/").status_code == 204

    def test_duplicate_section_number_400(self):
        client = admin_client()
        exam = ExamTemplateFactory()
        ExamSectionFactory(exam=exam, section_number=1)
        r = client.post(
            f"{ADMIN}exams/{exam.id}/sections/",
            {"module": "math", "section_number": 1},
            format="json",
        )
        assert r.status_code == 400


class TestSectionQuestions:
    def _section(self):
        exam = ExamTemplateFactory()
        return exam, ExamSectionFactory(exam=exam)

    def _add(self, client, exam, section, question):
        return client.post(
            f"{ADMIN}exams/{exam.id}/sections/{section.id}/questions/",
            {"question": str(question.id)},
            format="json",
        )

    def test_add_published_question_appends(self):
        client = admin_client()
        exam, section = self._section()
        r1 = self._add(client, exam, section, QuestionFactory(status="published"))
        assert r1.status_code == 201
        assert r1.data["data"]["position"] == 1
        r2 = self._add(client, exam, section, QuestionFactory(status="published"))
        assert r2.data["data"]["position"] == 2

    def test_cannot_add_unpublished(self):
        client = admin_client()
        exam, section = self._section()
        r = self._add(client, exam, section, QuestionFactory(status="draft"))
        assert r.status_code == 400
        assert r.data["error"]["field"] == "question"

    def test_cannot_add_duplicate(self):
        client = admin_client()
        exam, section = self._section()
        q = QuestionFactory(status="published")
        self._add(client, exam, section, q)
        assert self._add(client, exam, section, q).status_code == 400

    def test_reorder(self):
        client = admin_client()
        exam, section = self._section()
        eq_ids = [
            self._add(client, exam, section, QuestionFactory(status="published")).data["data"]["id"]
            for _ in range(3)
        ]
        new_order = list(reversed(eq_ids))
        r = client.post(
            f"{ADMIN}exams/{exam.id}/sections/{section.id}/questions/reorder/",
            {"order": new_order},
            format="json",
        )
        assert r.status_code == 200
        positions = {sq["id"]: sq["position"] for sq in r.data["data"]["questions"]}
        assert positions[new_order[0]] == 1
        assert positions[new_order[2]] == 3

    def test_reorder_must_be_permutation(self):
        client = admin_client()
        exam, section = self._section()
        eq_id = self._add(client, exam, section, QuestionFactory(status="published")).data["data"][
            "id"
        ]
        r = client.post(
            f"{ADMIN}exams/{exam.id}/sections/{section.id}/questions/reorder/",
            {"order": [eq_id, 999999]},
            format="json",
        )
        assert r.status_code == 400

    def test_remove(self):
        client = admin_client()
        exam, section = self._section()
        eq_id = self._add(client, exam, section, QuestionFactory(status="published")).data["data"][
            "id"
        ]
        assert (
            client.delete(
                f"{ADMIN}exams/{exam.id}/sections/{section.id}/questions/{eq_id}/"
            ).status_code
            == 204
        )
        assert (
            client.get(f"{ADMIN}exams/{exam.id}/sections/{section.id}/questions/").data["data"]
            == []
        )


class TestAssignments:
    def _create(self, client, **over):
        exam = over.pop("exam", None) or ExamTemplateFactory()
        payload = {"exam": str(exam.id), "opens_at": OPENS, "closes_at": CLOSES}
        payload.update(over)
        return client.post(ADMIN + "assignments/", payload, format="json"), exam

    def test_create_for_class(self):
        client = admin_client()
        klass = ClassFactory()
        r, _ = self._create(client, assigned_class=str(klass.id), max_attempts=2)
        assert r.status_code == 201
        assert r.data["data"]["assigned_class"]["id"] == str(klass.id)
        assert r.data["data"]["assigned_student"] is None
        assert r.data["data"]["max_attempts"] == 2

    def test_create_for_student(self):
        client = admin_client()
        student = UserFactory(role="student")
        r, _ = self._create(client, assigned_student=str(student.id))
        assert r.status_code == 201
        assert r.data["data"]["assigned_student"]["id"] == str(student.id)

    def test_requires_exactly_one_target(self):
        client = admin_client()
        klass = ClassFactory()
        student = UserFactory(role="student")
        both, _ = self._create(
            client, assigned_class=str(klass.id), assigned_student=str(student.id)
        )
        assert both.status_code == 400
        neither, _ = self._create(client)
        assert neither.status_code == 400

    def test_closes_must_be_after_opens(self):
        client = admin_client()
        klass = ClassFactory()
        r, _ = self._create(client, assigned_class=str(klass.id), opens_at=CLOSES, closes_at=OPENS)
        assert r.status_code == 400

    def test_list_filter_by_exam(self):
        client = admin_client()
        klass = ClassFactory()
        _, exam = self._create(client, assigned_class=str(klass.id))
        rows = client.get(f"{ADMIN}assignments/?exam={exam.id}").data["data"]
        assert rows and all(a["exam"]["id"] == str(exam.id) for a in rows)

    def test_update_and_soft_delete(self):
        client = admin_client()
        klass = ClassFactory()
        aid = self._create(client, assigned_class=str(klass.id))[0].data["data"]["id"]
        r = client.patch(f"{ADMIN}assignments/{aid}/", {"max_attempts": 3}, format="json")
        assert r.data["data"]["max_attempts"] == 3
        assert client.delete(f"{ADMIN}assignments/{aid}/").status_code == 204
        assert ExamAssignment.all_objects.get(id=aid).deleted_at is not None

    def test_sessions_progress(self):
        client = admin_client()
        student = UserFactory(role="student")
        exam = ExamTemplateFactory()
        aid = self._create(client, exam=exam, assigned_student=str(student.id))[0].data["data"][
            "id"
        ]
        assignment = ExamAssignment.objects.get(id=aid)
        session = ExamSessionFactory(
            user=student, exam=exam, assignment=assignment, status="completed"
        )
        ExamResultFactory(session=session, total_score=1400)
        rows = client.get(f"{ADMIN}assignments/{aid}/sessions/").data["data"]
        assert len(rows) == 1
        assert rows[0]["student"]["id"] == str(student.id)
        assert rows[0]["status"] == "completed"
        assert rows[0]["total_score"] == 1400
