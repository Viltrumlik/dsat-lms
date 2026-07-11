"""
DSAT LMS v2 — Attendance tests (5.2a)
Domain: Academy
Covers: gate, session create (+ own-class scoping → 404), bulk mark (+ enrollment
        guard), teacher row-scoping (out-of-scope session → 404), and the roster.
"""

import pytest
from rest_framework.test import APIClient

from apps.academy.models import Attendance, ClassEnrollment, ClassSession
from apps.academy.tests.factories import ClassFactory
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

BASE = "/api/v1/teacher/class-sessions/"


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def enrolled(klass):
    student = UserFactory(role="student")
    ClassEnrollment.objects.create(
        klass=klass, student=student, status=ClassEnrollment.Status.ACTIVE
    )
    return student


class TestPermissions:
    def test_unauthenticated_401(self, api_client):
        assert api_client.get(BASE).status_code == 401

    def test_student_forbidden(self):
        assert client_for(UserFactory(role="student")).get(BASE).status_code == 403


class TestSessions:
    def test_teacher_creates_session_for_own_class(self):
        teacher = UserFactory(role="teacher")
        klass = ClassFactory(teacher=teacher)
        r = client_for(teacher).post(
            BASE, {"klass": str(klass.id), "starts_at": "2026-02-01T09:00:00Z"}, format="json"
        )
        assert r.status_code == 201, r.data
        assert ClassSession.objects.filter(klass=klass).exists()
        # teacher snapshotted from the class.
        assert ClassSession.objects.get(klass=klass).teacher_id == teacher.id

    def test_teacher_cannot_create_for_other_class_404(self):
        teacher = UserFactory(role="teacher")
        other_klass = ClassFactory(teacher=UserFactory(role="teacher"))
        r = client_for(teacher).post(
            BASE,
            {"klass": str(other_klass.id), "starts_at": "2026-02-01T09:00:00Z"},
            format="json",
        )
        assert r.status_code == 404

    def test_teacher_lists_only_own_sessions(self):
        teacher = UserFactory(role="teacher")
        mine = ClassSession.objects.create(
            klass=ClassFactory(teacher=teacher), starts_at="2026-02-01T09:00:00Z"
        )
        ClassSession.objects.create(
            klass=ClassFactory(teacher=UserFactory(role="teacher")),
            starts_at="2026-02-02T09:00:00Z",
        )
        r = client_for(teacher).get(BASE)
        ids = {row["id"] for row in r.data["data"]}
        assert str(mine.id) in ids and len(ids) == 1

    def test_admin_sees_all(self):
        ClassSession.objects.create(
            klass=ClassFactory(teacher=UserFactory(role="teacher")),
            starts_at="2026-02-01T09:00:00Z",
        )
        r = client_for(AdminUserFactory()).get(BASE)
        assert r.status_code == 200 and len(r.data["data"]) >= 1

    def test_out_of_scope_session_404(self):
        session = ClassSession.objects.create(
            klass=ClassFactory(teacher=UserFactory(role="teacher")),
            starts_at="2026-02-01T09:00:00Z",
        )
        other_teacher = UserFactory(role="teacher")
        assert client_for(other_teacher).get(f"{BASE}{session.id}/").status_code == 404


class TestMarking:
    def _session_with_student(self):
        teacher = UserFactory(role="teacher")
        klass = ClassFactory(teacher=teacher)
        student = enrolled(klass)
        session = ClassSession.objects.create(klass=klass, starts_at="2026-02-01T09:00:00Z")
        return teacher, klass, student, session

    def test_bulk_mark(self):
        teacher, klass, student, session = self._session_with_student()
        r = client_for(teacher).put(
            f"{BASE}{session.id}/attendance/",
            {"marks": [{"student": str(student.id), "status": "present"}]},
            format="json",
        )
        assert r.status_code == 200, r.data
        att = Attendance.objects.get(session=session, student=student)
        assert att.status == "present" and att.marked_by_id == teacher.id

    def test_mark_is_upsert(self):
        teacher, klass, student, session = self._session_with_student()
        c = client_for(teacher)
        url = f"{BASE}{session.id}/attendance/"
        c.put(url, {"marks": [{"student": str(student.id), "status": "absent"}]}, format="json")
        c.put(url, {"marks": [{"student": str(student.id), "status": "late"}]}, format="json")
        assert Attendance.objects.filter(session=session, student=student).count() == 1
        assert Attendance.objects.get(session=session, student=student).status == "late"

    def test_non_enrolled_student_rejected(self):
        teacher, klass, student, session = self._session_with_student()
        outsider = UserFactory(role="student")
        r = client_for(teacher).put(
            f"{BASE}{session.id}/attendance/",
            {"marks": [{"student": str(outsider.id), "status": "present"}]},
            format="json",
        )
        assert r.status_code == 400

    def test_detail_roster_includes_mark(self):
        teacher, klass, student, session = self._session_with_student()
        Attendance.objects.create(
            session=session, student=student, status="present", marked_by=teacher
        )
        r = client_for(teacher).get(f"{BASE}{session.id}/")
        assert r.status_code == 200
        roster = r.data["data"]["roster"]
        assert roster and roster[0]["status"] == "present"
