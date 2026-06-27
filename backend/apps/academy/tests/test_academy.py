"""
DSAT LMS v2 — Academy (teacher) tests
Domain: Academy
Covers: permission gate, class create/list scoping, roster, enroll
        (+ unknown email, + idempotency), and own-class-only isolation.
"""

import pytest
from rest_framework.test import APIClient

from apps.academy.models import ClassEnrollment
from apps.academy.tests.factories import ClassFactory
from apps.identity.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

TEACHER = "/api/v1/teacher/"


def teacher_client():
    teacher = UserFactory(role="teacher")
    client = APIClient()
    client.force_authenticate(teacher)
    client.user = teacher
    return client


class TestClasses:
    def test_public_user_forbidden(self, auth_client):
        # auth_client is a public-role user
        assert auth_client.get(TEACHER + "classes/").status_code == 403

    def test_teacher_creates_and_lists(self):
        client = teacher_client()
        r = client.post(TEACHER + "classes/", {"name": "Morning SAT"}, format="json")
        assert r.status_code == 201
        assert r.data["data"]["name"] == "Morning SAT"
        assert r.data["data"]["student_count"] == 0
        assert len(client.get(TEACHER + "classes/").data["data"]) == 1

    def test_only_own_classes_listed(self):
        client = teacher_client()
        ClassFactory()  # another teacher's class
        client.post(TEACHER + "classes/", {"name": "Mine"}, format="json")
        data = client.get(TEACHER + "classes/").data["data"]
        assert len(data) == 1
        assert data[0]["name"] == "Mine"


class TestRosterAndEnroll:
    def test_enroll_then_appears_in_roster(self):
        client = teacher_client()
        klass = ClassFactory(teacher=client.user)
        UserFactory(role="student", email="s1@dsat.local")
        r = client.post(
            f"{TEACHER}classes/{klass.id}/enroll/", {"email": "s1@dsat.local"}, format="json"
        )
        assert r.status_code == 200
        roster = client.get(f"{TEACHER}classes/{klass.id}/roster/")
        assert len(roster.data["data"]) == 1
        assert roster.data["data"][0]["student"]["email"] == "s1@dsat.local"

    def test_enroll_unknown_email_400(self):
        client = teacher_client()
        klass = ClassFactory(teacher=client.user)
        r = client.post(
            f"{TEACHER}classes/{klass.id}/enroll/", {"email": "nope@dsat.local"}, format="json"
        )
        assert r.status_code == 400
        assert r.data["error"]["field"] == "email"

    def test_enroll_is_idempotent(self):
        client = teacher_client()
        klass = ClassFactory(teacher=client.user)
        student = UserFactory(role="student", email="s2@dsat.local")
        for _ in range(2):
            client.post(
                f"{TEACHER}classes/{klass.id}/enroll/", {"email": "s2@dsat.local"}, format="json"
            )
        assert ClassEnrollment.objects.filter(klass=klass, student=student).count() == 1

    def test_cannot_touch_other_teachers_class(self):
        client = teacher_client()
        other = ClassFactory()  # different teacher
        assert client.get(f"{TEACHER}classes/{other.id}/roster/").status_code == 404
        assert (
            client.post(
                f"{TEACHER}classes/{other.id}/enroll/", {"email": "x@dsat.local"}, format="json"
            ).status_code
            == 404
        )
