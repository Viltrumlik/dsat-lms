"""
DSAT LMS v2 — Report export tests (5.3b)
Domain: Analytics
Covers: gate, CSV + XLSX student report, attendance report (needs class_id),
        and the unknown-kind 404.
"""

import pytest
from rest_framework.test import APIClient

from apps.academy.models import ClassEnrollment
from apps.academy.tests.factories import ClassFactory
from apps.analytics.reports import XLSX_CONTENT_TYPE
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db


def admin_client():
    c = APIClient()
    c.force_authenticate(AdminUserFactory())
    return c


class TestPermissions:
    def test_unauthenticated_401(self, api_client):
        assert api_client.get("/api/v1/admin/reports/students/").status_code == 401

    def test_teacher_forbidden(self):
        c = APIClient()
        c.force_authenticate(UserFactory(role="teacher"))
        assert c.get("/api/v1/admin/reports/students/").status_code == 403


class TestReports:
    def test_students_csv(self):
        UserFactory(role="student", first_name="Ann", last_name="Lee")
        r = admin_client().get("/api/v1/admin/reports/students/?fmt=csv")
        assert r.status_code == 200
        assert r["Content-Type"].startswith("text/csv")
        body = b"".join(r.streaming_content).decode()
        assert "Name,Email" in body and "Ann Lee" in body

    def test_students_xlsx(self):
        UserFactory(role="student")
        r = admin_client().get("/api/v1/admin/reports/students/?fmt=xlsx")
        assert r.status_code == 200
        assert r["Content-Type"] == XLSX_CONTENT_TYPE
        assert r["Content-Disposition"].endswith('.xlsx"')

    def test_attendance_needs_class(self):
        assert admin_client().get("/api/v1/admin/reports/attendance/").status_code == 400

    def test_attendance_report(self):
        klass = ClassFactory()
        s = UserFactory(role="student")
        ClassEnrollment.objects.create(klass=klass, student=s, status=ClassEnrollment.Status.ACTIVE)
        r = admin_client().get(f"/api/v1/admin/reports/attendance/?class_id={klass.id}&fmt=csv")
        assert r.status_code == 200
        body = b"".join(r.streaming_content).decode()
        assert "Present,Absent,Late,Excused" in body

    def test_unknown_kind_404(self):
        assert admin_client().get("/api/v1/admin/reports/nonsense/").status_code == 404
