"""
DSAT LMS v2 — Homework tests
Domain: Homework
Covers: academy gate, role-scoped listing (teacher own-class / student enrolled),
        create (own class only, teacher-only), submit (enrolled student),
        non-enrolled 404, teacher views submissions.
"""

import pytest
from rest_framework.test import APIClient

from apps.academy.models import ClassEnrollment
from apps.academy.tests.factories import ClassFactory
from apps.homework.models import HomeworkSubmission
from apps.homework.tests.factories import HomeworkFactory
from apps.identity.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

BASE = "/api/v1/homework/"
DUE = "2026-12-31T00:00:00Z"


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    client.user = user
    return client


def enroll(klass, student):
    ClassEnrollment.objects.create(
        klass=klass, student=student, status=ClassEnrollment.Status.ACTIVE
    )


class TestList:
    def test_public_user_forbidden(self, auth_client):
        assert auth_client.get(BASE).status_code == 403

    def test_teacher_sees_only_own_class(self):
        teacher = UserFactory(role="teacher")
        klass = ClassFactory(teacher=teacher)
        HomeworkFactory(assigned_class=klass)
        HomeworkFactory()  # another teacher's class
        data = client_for(teacher).get(BASE).data["data"]
        assert len(data) == 1

    def test_student_sees_only_enrolled_class(self):
        teacher = UserFactory(role="teacher")
        klass = ClassFactory(teacher=teacher)
        homework = HomeworkFactory(assigned_class=klass)
        student = UserFactory(role="student")
        enroll(klass, student)
        HomeworkFactory()  # class the student is NOT in
        data = client_for(student).get(BASE).data["data"]
        assert len(data) == 1
        assert data[0]["id"] == str(homework.id)


class TestCreate:
    def test_teacher_creates_for_own_class(self):
        teacher = UserFactory(role="teacher")
        klass = ClassFactory(teacher=teacher)
        r = client_for(teacher).post(
            BASE, {"title": "HW1", "assigned_class": str(klass.id), "due_at": DUE}, format="json"
        )
        assert r.status_code == 201
        assert r.data["data"]["title"] == "HW1"

    def test_teacher_cannot_assign_to_other_class(self):
        teacher = UserFactory(role="teacher")
        other = ClassFactory()  # different teacher
        r = client_for(teacher).post(
            BASE, {"title": "X", "assigned_class": str(other.id), "due_at": DUE}, format="json"
        )
        assert r.status_code == 403

    def test_student_cannot_create(self):
        student = UserFactory(role="student")
        klass = ClassFactory()
        r = client_for(student).post(
            BASE, {"title": "X", "assigned_class": str(klass.id), "due_at": DUE}, format="json"
        )
        assert r.status_code == 403


class TestSubmit:
    def test_enrolled_student_submits(self):
        teacher = UserFactory(role="teacher")
        klass = ClassFactory(teacher=teacher)
        homework = HomeworkFactory(assigned_class=klass)
        student = UserFactory(role="student")
        enroll(klass, student)
        r = client_for(student).post(f"{BASE}{homework.id}/submit/", {}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["status"] == "submitted"
        assert HomeworkSubmission.objects.filter(homework=homework, student=student).count() == 1

    def test_non_enrolled_student_404(self):
        homework = HomeworkFactory()
        student = UserFactory(role="student")
        assert (
            client_for(student).post(f"{BASE}{homework.id}/submit/", {}, format="json").status_code
            == 404
        )

    def test_teacher_views_submissions(self):
        teacher = UserFactory(role="teacher")
        klass = ClassFactory(teacher=teacher)
        homework = HomeworkFactory(assigned_class=klass)
        student = UserFactory(role="student")
        enroll(klass, student)
        client_for(student).post(f"{BASE}{homework.id}/submit/", {}, format="json")
        r = client_for(teacher).get(f"{BASE}{homework.id}/submissions/")
        assert r.status_code == 200
        assert len(r.data["data"]) == 1
        assert r.data["data"][0]["student"]["id"] == str(student.id)
