"""
DSAT LMS v2 — Admin students directory + bulk + saved-filters tests (5.5c)
Domain: CRM
Covers: IsAdmin gate, filters (status/mentor/tag/q), bulk tag/status (+ skip on
        bad transition), saved-filter CRUD (per-user).
"""

import pytest
from rest_framework.test import APIClient

from apps.academy.models import StudentProfile
from apps.crm.models import SavedFilter
from apps.crm.services import assign_tag
from apps.crm.tags import Tag
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

LIST = "/api/v1/admin/students/"
BULK = "/api/v1/admin/students/bulk/"
FILTERS = "/api/v1/admin/saved-filters/"


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _student(status=StudentProfile.LifecycleStatus.ACTIVE, **user_kw):
    u = UserFactory(role="student", **user_kw)
    StudentProfile.objects.create(user=u, status=status)
    return u


class TestList:
    def test_gate(self):
        assert client_for(UserFactory(role="teacher")).get(LIST).status_code == 403

    def test_filter_by_status(self):
        _student(status="active")
        _student(status="frozen")
        c = client_for(AdminUserFactory())
        rows = c.get(f"{LIST}?status=frozen").data["data"]
        assert len(rows) == 1 and rows[0]["status"] == "frozen"

    def test_filter_by_tag(self):
        s1 = _student()
        _student()
        tag = Tag.objects.create(name="Priority")
        assign_tag(tag, "student", s1.id)
        rows = client_for(AdminUserFactory()).get(f"{LIST}?tag={tag.id}").data["data"]
        assert len(rows) == 1 and rows[0]["id"] == str(s1.id)
        assert rows[0]["tags"][0]["name"] == "Priority"

    def test_search(self):
        _student(email="findme@x.com", first_name="Zarina")
        _student(email="other@x.com")
        rows = client_for(AdminUserFactory()).get(f"{LIST}?q=zarina").data["data"]
        assert len(rows) == 1 and rows[0]["email"] == "findme@x.com"


class TestBulk:
    def test_bulk_tag(self):
        s1, s2 = _student(), _student()
        tag = Tag.objects.create(name="Cohort A")
        r = client_for(AdminUserFactory()).post(
            BULK,
            {"action": "tag", "tag": str(tag.id), "student_ids": [str(s1.id), str(s2.id)]},
            format="json",
        )
        assert r.status_code == 200 and r.data["data"]["applied"] == 2
        from apps.crm.services import tags_for

        assert tags_for("student", s1.id).count() == 1

    def test_bulk_status_skips_bad_transition(self):
        s1 = _student(status="active")
        s2 = _student(status="graduated")  # active is a valid target from graduated
        # Move both to "frozen": active→frozen ok, graduated→frozen invalid → skipped.
        r = client_for(AdminUserFactory()).post(
            BULK,
            {"action": "status", "status": "frozen", "student_ids": [str(s1.id), str(s2.id)]},
            format="json",
        )
        assert r.status_code == 200
        assert r.data["data"]["applied"] == 1 and r.data["data"]["skipped"] == 1
        s1.student_profile.refresh_from_db()
        assert s1.student_profile.status == "frozen"


class TestSavedFilters:
    def test_crud_is_per_user(self):
        admin1, admin2 = AdminUserFactory(), AdminUserFactory()
        c1 = client_for(admin1)
        created = c1.post(
            FILTERS,
            {"kind": "students", "name": "Frozen", "params": {"status": "frozen"}},
            format="json",
        )
        assert created.status_code == 201
        # admin2 doesn't see admin1's filter.
        assert client_for(admin2).get(FILTERS).data["data"] == []
        assert len(c1.get(FILTERS).data["data"]) == 1
        fid = created.data["data"]["id"]
        assert c1.delete(f"{FILTERS}{fid}/").status_code == 204
        assert SavedFilter.objects.filter(id=fid).count() == 0
