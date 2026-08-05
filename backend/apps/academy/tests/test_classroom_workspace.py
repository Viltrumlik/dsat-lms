"""
DSAT LMS v2 — Classroom workspace tests
Domain: Academy
Covers: the one surface both roles open — that a teacher reaches it at all, that
        the capabilities it publishes match what the API enforces, that a student
        sees classmates but not their addresses, and that classwork shows each
        role the half that is theirs (my submission vs how many handed in).
"""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.academy.models import ClassEnrollment, ClassPost
from apps.academy.tests.factories import ClassFactory
from apps.homework.models import Homework, HomeworkSubmission
from apps.identity.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

CLASSES = "/api/v1/classes/"


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def setup():
    teacher = UserFactory(role="teacher")
    student = UserFactory(role="student")
    classmate = UserFactory(role="student", first_name="Bea")
    klass = ClassFactory(teacher=teacher)
    for s in (student, classmate):
        ClassEnrollment.objects.create(klass=klass, student=s, status=ClassEnrollment.Status.ACTIVE)
    return {"teacher": teacher, "student": student, "classmate": classmate, "klass": klass}


class TestMyClasses:
    def test_a_teacher_sees_the_class_they_teach(self, setup):
        r = client_for(setup["teacher"]).get(CLASSES)
        assert [c["id"] for c in r.data["data"]] == [str(setup["klass"].id)]
        assert r.data["data"][0]["my_role"] == "staff"

    def test_a_student_sees_the_class_they_attend(self, setup):
        r = client_for(setup["student"]).get(CLASSES)
        assert r.data["data"][0]["my_role"] == "student"

    def test_an_outsider_sees_nothing(self, setup):
        assert client_for(UserFactory(role="student")).get(CLASSES).data["data"] == []


class TestDetail:
    def test_capabilities_say_what_the_api_will_allow(self, setup):
        klass = setup["klass"]
        staff = client_for(setup["teacher"]).get(f"{CLASSES}{klass.id}/").data["data"]
        assert staff["capabilities"]["can_post"] is True
        assert staff["student_count"] == 2

        mine = client_for(setup["student"]).get(f"{CLASSES}{klass.id}/").data["data"]
        assert mine["capabilities"]["can_post"] is False
        # ...and the server agrees: posting really is refused.
        refused = client_for(setup["student"]).post(
            f"{CLASSES}{klass.id}/stream/", {"body": "hello"}, format="json"
        )
        assert refused.status_code == 403

    def test_an_outsider_gets_404_not_403(self, setup):
        r = client_for(UserFactory(role="student")).get(f"{CLASSES}{setup['klass'].id}/")
        assert r.status_code == 404


class TestPeople:
    def test_a_student_sees_classmates_without_their_addresses(self, setup):
        r = client_for(setup["student"]).get(f"{CLASSES}{setup['klass'].id}/people/")
        data = r.data["data"]
        assert data["teacher"]["full_name"] == setup["teacher"].get_full_name()
        assert len(data["students"]) == 2
        assert {s["email"] for s in data["students"]} == {None}

    def test_staff_see_addresses(self, setup):
        r = client_for(setup["teacher"]).get(f"{CLASSES}{setup['klass'].id}/people/")
        assert setup["student"].email in {s["email"] for s in r.data["data"]["students"]}

    def test_an_outsider_gets_404(self, setup):
        r = client_for(UserFactory(role="student")).get(f"{CLASSES}{setup['klass'].id}/people/")
        assert r.status_code == 404


class TestClasswork:
    def _homework(self, setup, *, published=True, title="Reading"):
        return Homework.objects.create(
            title=title,
            assigned_class=setup["klass"],
            assigned_by=setup["teacher"],
            due_at=timezone.now() + timedelta(days=3),
            is_published=published,
        )

    def test_a_student_sees_their_own_submission_and_no_counts(self, setup):
        homework = self._homework(setup)
        HomeworkSubmission.objects.create(
            homework=homework, student=setup["student"], status=HomeworkSubmission.Status.SUBMITTED
        )
        HomeworkSubmission.objects.create(
            homework=homework,
            student=setup["classmate"],
            status=HomeworkSubmission.Status.SUBMITTED,
        )

        row = (
            client_for(setup["student"])
            .get(f"{CLASSES}{setup['klass'].id}/classwork/")
            .data["data"][0]
        )
        assert row["my_status"] == "submitted"
        assert row["submitted_count"] is None

    def test_staff_see_how_many_handed_in_and_not_a_my_status(self, setup):
        homework = self._homework(setup)
        HomeworkSubmission.objects.create(
            homework=homework, student=setup["student"], status=HomeworkSubmission.Status.SUBMITTED
        )
        HomeworkSubmission.objects.create(
            homework=homework,
            student=setup["classmate"],
            status=HomeworkSubmission.Status.ASSIGNED,
        )

        row = (
            client_for(setup["teacher"])
            .get(f"{CLASSES}{setup['klass'].id}/classwork/")
            .data["data"][0]
        )
        assert row["submitted_count"] == 1
        assert row["my_status"] is None

    def test_unpublished_homework_is_staff_only(self, setup):
        self._homework(setup, published=False, title="Draft")
        student_rows = (
            client_for(setup["student"])
            .get(f"{CLASSES}{setup['klass'].id}/classwork/")
            .data["data"]
        )
        assert student_rows == []
        staff_rows = (
            client_for(setup["teacher"])
            .get(f"{CLASSES}{setup['klass'].id}/classwork/")
            .data["data"]
        )
        assert [r["title"] for r in staff_rows] == ["Draft"]

    def test_materials_posted_to_the_stream_land_here_too(self, setup):
        ClassPost.objects.create(
            klass=setup["klass"],
            author=setup["teacher"],
            body="Chapter 4 notes",
            kind=ClassPost.Kind.MATERIAL,
        )
        rows = (
            client_for(setup["student"])
            .get(f"{CLASSES}{setup['klass'].id}/classwork/")
            .data["data"]
        )
        assert [(r["kind"], r["title"]) for r in rows] == [("material", "Chapter 4 notes")]

    def test_another_classs_homework_does_not_leak(self, setup):
        other = ClassFactory(teacher=setup["teacher"])
        Homework.objects.create(
            title="Not ours",
            assigned_class=other,
            assigned_by=setup["teacher"],
            due_at=timezone.now() + timedelta(days=1),
        )
        rows = (
            client_for(setup["student"])
            .get(f"{CLASSES}{setup['klass'].id}/classwork/")
            .data["data"]
        )
        assert rows == []
