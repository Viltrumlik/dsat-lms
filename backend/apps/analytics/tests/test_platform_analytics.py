"""
DSAT LMS v2 — Platform analytics tests (5.3c)
Domain: Analytics (admin)
Covers: gate, payload shape, weak-students (at-risk surfaces), active-teachers
        ranking, and attendance-by-class.
"""

import pytest
from rest_framework.test import APIClient

from apps.academy.models import Attendance, ClassEnrollment, ClassSession
from apps.academy.tests.factories import ClassFactory
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

URL = "/api/v1/admin/analytics/"


def admin_client():
    c = APIClient()
    c.force_authenticate(AdminUserFactory())
    return c


class TestPermissions:
    def test_teacher_forbidden(self):
        c = APIClient()
        c.force_authenticate(UserFactory(role="teacher"))
        assert c.get(URL).status_code == 403


class TestAnalytics:
    def test_shape(self):
        r = admin_client().get(URL)
        assert r.status_code == 200
        assert set(r.data["data"].keys()) == {
            "weak_students",
            "active_teachers",
            "exam_difficulty",
            "attendance_by_class",
        }

    def test_weak_students_and_attendance(self):
        teacher = UserFactory(role="teacher")
        klass = ClassFactory(teacher=teacher)
        student = UserFactory(role="student", first_name="Poor", last_name="Attend")
        ClassEnrollment.objects.create(
            klass=klass, student=student, status=ClassEnrollment.Status.ACTIVE
        )
        # Mostly-absent → low attendance → at-risk.
        for i, st in enumerate(["absent", "absent", "absent", "present"]):
            session = ClassSession.objects.create(
                klass=klass, starts_at=f"2026-02-{i + 1:02d}T09:00:00Z"
            )
            Attendance.objects.create(session=session, student=student, status=st)

        data = admin_client().get(URL).data["data"]
        assert any(w["student"]["email"] == student.email for w in data["weak_students"])
        assert any(c["class"] == klass.name for c in data["attendance_by_class"])

    def test_active_teachers_ranked(self):
        teacher = UserFactory(role="teacher")
        klass = ClassFactory(teacher=teacher)
        ClassEnrollment.objects.create(
            klass=klass, student=UserFactory(role="student"), status=ClassEnrollment.Status.ACTIVE
        )
        data = admin_client().get(URL).data["data"]
        row = next(
            (t for t in data["active_teachers"] if t["teacher"]["id"] == str(teacher.id)), None
        )
        assert row is not None and row["classes"] == 1 and row["students"] == 1

    def test_empty_platform(self):
        data = admin_client().get(URL).data["data"]
        assert data["weak_students"] == [] and data["attendance_by_class"] == []
