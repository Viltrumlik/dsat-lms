"""
DSAT LMS v2 — Gradebook tests (5.3a)
Domain: Academy
Covers: gate, matrix shape, grade precedence (manual > none), inline + bulk grade,
        row-scoping (out-of-scope class/submission → 404), admin access, and a
        constant-query-count assembly.
"""

import pytest
from rest_framework.test import APIClient

from apps.academy.gradebook import class_gradebook
from apps.academy.models import ClassEnrollment
from apps.academy.tests.factories import ClassFactory
from apps.homework.models import Homework, HomeworkSubmission
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

GB = "/api/v1/teacher/gradebook/"


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _class_with_homework(teacher, n_students=2, n_hw=1):
    klass = ClassFactory(teacher=teacher)
    students = []
    for _ in range(n_students):
        s = UserFactory(role="student")
        ClassEnrollment.objects.create(klass=klass, student=s, status=ClassEnrollment.Status.ACTIVE)
        students.append(s)
    homeworks = [
        Homework.objects.create(
            title=f"HW {i}",
            assigned_class=klass,
            assigned_by=teacher,
            due_at="2026-03-01T09:00:00Z",
            is_published=True,
        )
        for i in range(n_hw)
    ]
    return klass, students, homeworks


class TestPermissions:
    def test_student_forbidden(self):
        klass = ClassFactory()
        assert (
            client_for(UserFactory(role="student")).get(f"{GB}?class_id={klass.id}").status_code
            == 403
        )


class TestMatrix:
    def test_shape_and_scoping(self):
        teacher = UserFactory(role="teacher")
        klass, students, homeworks = _class_with_homework(teacher, n_students=2, n_hw=2)
        r = client_for(teacher).get(f"{GB}?class_id={klass.id}")
        assert r.status_code == 200, r.data
        data = r.data["data"]
        assert len(data["items"]) == 2
        assert len(data["rows"]) == 2
        assert len(data["rows"][0]["cells"]) == 2

    def test_teacher_other_class_404(self):
        teacher = UserFactory(role="teacher")
        other = ClassFactory(teacher=UserFactory(role="teacher"))
        assert client_for(teacher).get(f"{GB}?class_id={other.id}").status_code == 404

    def test_missing_class_id_400(self):
        assert client_for(UserFactory(role="teacher")).get(GB).status_code == 400

    def test_admin_any_class(self):
        klass, *_ = _class_with_homework(UserFactory(role="teacher"))
        r = client_for(AdminUserFactory()).get(f"/api/v1/admin/gradebook/?class_id={klass.id}")
        assert r.status_code == 200

    def test_constant_query_count(self, django_assert_max_num_queries):
        teacher = UserFactory(role="teacher")
        klass, students, homeworks = _class_with_homework(teacher, n_students=5, n_hw=3)
        for s in students:
            for hw in homeworks:
                HomeworkSubmission.objects.create(homework=hw, student=s, grade=80)
        with django_assert_max_num_queries(6):  # students + homeworks + submissions (+overhead)
            class_gradebook(klass)


class TestGrading:
    def _one(self):
        teacher = UserFactory(role="teacher")
        klass, students, homeworks = _class_with_homework(teacher, n_students=1, n_hw=1)
        sub = HomeworkSubmission.objects.create(homework=homeworks[0], student=students[0])
        return teacher, sub

    def test_inline_grade(self):
        teacher, sub = self._one()
        r = client_for(teacher).patch(
            f"{GB}submissions/{sub.id}/", {"grade": "88.5", "feedback": "Nice"}, format="json"
        )
        assert r.status_code == 200, r.data
        sub.refresh_from_db()
        assert float(sub.grade) == 88.5
        assert sub.status == HomeworkSubmission.Status.GRADED
        assert sub.graded_by_id == teacher.id and sub.graded_at is not None
        # The resolved cell reflects the manual grade (DRF response is snake_case).
        cell = r.data["data"]["rows"][0]["cells"][0]
        assert cell["grade"] == 88.5 and cell["grade_source"] == "manual"

    def test_grade_none_source(self):
        teacher, sub = self._one()
        r = client_for(teacher).get(f"{GB}?class_id={sub.homework.assigned_class_id}")
        cell = r.data["data"]["rows"][0]["cells"][0]
        assert cell["grade"] is None and cell["grade_source"] == "none"

    def test_bulk_grade(self):
        teacher, sub = self._one()
        r = client_for(teacher).post(
            f"{GB}bulk-grade/",
            {"grades": [{"submission": str(sub.id), "grade": "70"}]},
            format="json",
        )
        assert r.status_code == 200
        sub.refresh_from_db()
        assert float(sub.grade) == 70

    def test_bulk_grade_preserves_feedback(self):
        # A bulk row omitting `feedback` must NOT erase a previously-saved comment.
        teacher, sub = self._one()
        client = client_for(teacher)
        client.patch(
            f"{GB}submissions/{sub.id}/", {"grade": "90", "feedback": "Nice work"}, format="json"
        )
        client.post(
            f"{GB}bulk-grade/",
            {"grades": [{"submission": str(sub.id), "grade": "85"}]},
            format="json",
        )
        sub.refresh_from_db()
        assert float(sub.grade) == 85 and sub.feedback == "Nice work"

    def test_out_of_scope_submission_404(self):
        _, sub = self._one()
        other = UserFactory(role="teacher")
        assert (
            client_for(other)
            .patch(f"{GB}submissions/{sub.id}/", {"grade": "50"}, format="json")
            .status_code
            == 404
        )
