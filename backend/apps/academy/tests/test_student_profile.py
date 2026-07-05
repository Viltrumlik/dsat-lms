"""
DSAT LMS v2 — 4D person-layer tests
Domain: Academy
Covers: lazy StudentProfile creation, student self-serve demographics (+ status is
        not self-writable), staff read/write scoping across the 6-role matrix,
        lifecycle status transitions (+ enrollment side-effect), and guardians CRUD.
"""

import pytest
from rest_framework.test import APIClient

from apps.academy.models import ClassEnrollment, Guardian, StudentProfile
from apps.academy.services import get_or_create_student_profile
from apps.academy.tests.factories import ClassFactory
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

STUDENTS = "/api/v1/students/"


def authed(user=None, role="student"):
    user = user or (AdminUserFactory() if role == "admin" else UserFactory(role=role))
    client = APIClient()
    client.force_authenticate(user)
    client.user = user
    return client


def enrolled_student(teacher):
    student = UserFactory(role="student")
    klass = ClassFactory(teacher=teacher)
    ClassEnrollment.objects.create(
        klass=klass, student=student, status=ClassEnrollment.Status.ACTIVE
    )
    return student


class TestSelfServe:
    def test_get_creates_profile_lazily(self):
        client = authed(role="student")
        assert not StudentProfile.objects.filter(user=client.user).exists()
        r = client.get(STUDENTS + "me/")
        assert r.status_code == 200
        assert r.json()["data"]["status"] == "active"
        assert StudentProfile.objects.filter(user=client.user).exists()

    def test_student_edits_own_demographics(self):
        client = authed(role="student")
        r = client.patch(
            STUDENTS + "me/",
            {"phone": "+998901234567", "school": "Presidential School", "gender": "female"},
            format="json",
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["phone"] == "+998901234567"
        assert data["school"] == "Presidential School"

    def test_status_is_not_self_writable(self):
        client = authed(role="student")
        client.get(STUDENTS + "me/")  # create
        client.patch(STUDENTS + "me/", {"status": "graduated"}, format="json")
        assert get_or_create_student_profile(client.user).status == "active"

    def test_non_student_forbidden(self):
        assert authed(role="teacher").get(STUDENTS + "me/").status_code == 403
        assert authed(role="public").get(STUDENTS + "me/").status_code == 403


class TestStaffAccess:
    def test_full_access_staff_read_any(self):
        student = UserFactory(role="student")
        for role in ("admin", "academic_manager", "receptionist"):
            client = authed(role=role) if role != "admin" else authed(role="admin")
            r = client.get(STUDENTS + f"{student.id}/")
            assert r.status_code == 200, role
            assert r.json()["data"]["student"]["id"] == str(student.id)

    def test_teacher_scoped_to_own_class(self):
        teacher = UserFactory(role="teacher")
        mine = enrolled_student(teacher)
        other = UserFactory(role="student")
        client = authed(teacher)
        assert client.get(STUDENTS + f"{mine.id}/").status_code == 200
        assert client.get(STUDENTS + f"{other.id}/").status_code == 404

    def test_student_cannot_hit_staff_endpoint(self):
        other = UserFactory(role="student")
        assert authed(role="student").get(STUDENTS + f"{other.id}/").status_code == 403

    def test_operational_staff_updates_demographics(self):
        student = UserFactory(role="student")
        r = authed(role="receptionist").patch(
            STUDENTS + f"{student.id}/", {"grade": "11", "address": "Tashkent"}, format="json"
        )
        assert r.status_code == 200
        assert r.json()["data"]["grade"] == "11"


class TestLifecycleStatus:
    def test_valid_transition(self):
        student = UserFactory(role="student")
        r = authed(role="academic_manager").post(
            STUDENTS + f"{student.id}/status/", {"status": "frozen"}, format="json"
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["status"] == "frozen"
        assert data["status_changed_at"] is not None

    def test_same_status_rejected(self):
        student = UserFactory(role="student")
        r = authed(role="admin").post(
            STUDENTS + f"{student.id}/status/", {"status": "active"}, format="json"
        )
        assert r.status_code == 400

    def test_invalid_transition_rejected(self):
        student = UserFactory(role="student")
        client = authed(role="admin")
        client.post(STUDENTS + f"{student.id}/status/", {"status": "graduated"}, format="json")
        # graduated → frozen is not allowed
        r = client.post(STUDENTS + f"{student.id}/status/", {"status": "frozen"}, format="json")
        assert r.status_code == 400

    def test_dropped_deactivates_enrollments(self):
        teacher = UserFactory(role="teacher")
        student = enrolled_student(teacher)
        authed(role="admin").post(
            STUDENTS + f"{student.id}/status/", {"status": "dropped"}, format="json"
        )
        assert not ClassEnrollment.objects.filter(
            student=student, status=ClassEnrollment.Status.ACTIVE
        ).exists()

    def test_status_change_records_operator(self):
        student = UserFactory(role="student")
        manager = authed(role="academic_manager")
        manager.post(STUDENTS + f"{student.id}/status/", {"status": "frozen"}, format="json")
        assert get_or_create_student_profile(student).status_changed_by_id == manager.user.id

    def test_teacher_write_status_is_class_scoped(self):
        teacher = UserFactory(role="teacher")
        mine = enrolled_student(teacher)
        other = UserFactory(role="student")
        client = authed(teacher)
        # own-class student → allowed
        assert (
            client.post(
                STUDENTS + f"{mine.id}/status/", {"status": "frozen"}, format="json"
            ).status_code
            == 200
        )
        # cross-class student → 404 (not visible to this teacher)
        assert (
            client.post(
                STUDENTS + f"{other.id}/status/", {"status": "frozen"}, format="json"
            ).status_code
            == 404
        )


class TestGuardians:
    def test_create_list_update_delete(self):
        student = UserFactory(role="student")
        staff = authed(role="receptionist")
        # create
        r = staff.post(
            STUDENTS + f"{student.id}/guardians/",
            {
                "relation": "mother",
                "name": "Nigora",
                "phone": "+998900000000",
                "is_emergency": True,
            },
            format="json",
        )
        assert r.status_code == 201
        gid = r.json()["data"]["id"]
        # list
        r = staff.get(STUDENTS + f"{student.id}/guardians/")
        assert r.status_code == 200 and len(r.json()["data"]) == 1
        # update
        r = staff.patch(STUDENTS + f"guardians/{gid}/", {"phone": "+998911111111"}, format="json")
        assert r.status_code == 200 and r.json()["data"]["phone"] == "+998911111111"
        # soft-delete
        assert staff.delete(STUDENTS + f"guardians/{gid}/").status_code == 204
        assert Guardian.all_objects.get(id=gid).deleted_at is not None
        assert staff.get(STUDENTS + f"{student.id}/guardians/").json()["data"] == []

    def test_teacher_cannot_manage_other_class_guardian(self):
        teacher = UserFactory(role="teacher")
        other = UserFactory(role="student")
        r = authed(teacher).post(
            STUDENTS + f"{other.id}/guardians/",
            {"relation": "father", "name": "X"},
            format="json",
        )
        assert r.status_code == 404
