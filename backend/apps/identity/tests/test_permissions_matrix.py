"""
DSAT LMS v2 — Permissions matrix tests (5.6a)
Domain: Identity
Covers: IsAdmin gate; effective matrix = defaults + overrides; PUT upserts a
        sparse override, reverting to default drops the row; admin row not
        editable; unknown role/capability/non-bool rejected; access-matrix +
        capabilities_for_role reflect the override.
"""

import pytest
from rest_framework.test import APIClient

from apps.identity.models import RolePermission
from apps.identity.services import access_matrix, capabilities_for_role
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

URL = "/api/v1/admin/permissions/matrix/"


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class TestGate:
    def test_non_admin_forbidden(self):
        for role in ("teacher", "academic_manager", "receptionist", "student"):
            assert client_for(UserFactory(role=role)).get(URL).status_code == 403

    def test_admin_ok(self):
        r = client_for(AdminUserFactory()).get(URL)
        assert r.status_code == 200
        body = r.data["data"]
        assert "admin" not in body["editable_roles"]
        assert "grade" in body["capabilities"]


class TestOverrides:
    def test_put_sets_override_and_reflects_in_matrix(self):
        c = client_for(AdminUserFactory())
        # Teacher grades by default; turn it off.
        r = c.put(
            URL,
            {"overrides": [{"role": "teacher", "capability": "grade", "allowed": False}]},
            format="json",
        )
        assert r.status_code == 200
        assert RolePermission.objects.filter(role="teacher", capability="grade").count() == 1
        # Effective capability + access matrix now reflect the override.
        assert capabilities_for_role("teacher")["grade"] is False
        assert access_matrix()["teacher"]["grade"] is False
        teacher_row = next(row for row in r.data["data"]["matrix"] if row["role"] == "teacher")
        grade_cell = next(c for c in teacher_row["cells"] if c["capability"] == "grade")
        assert grade_cell["allowed"] is False and grade_cell["overridden"] is True

    def test_revert_to_default_drops_override(self):
        c = client_for(AdminUserFactory())
        c.put(
            URL,
            {"overrides": [{"role": "teacher", "capability": "grade", "allowed": False}]},
            format="json",
        )
        # Set it back to the hardcoded default (True) → the row is soft-deleted.
        c.put(
            URL,
            {"overrides": [{"role": "teacher", "capability": "grade", "allowed": True}]},
            format="json",
        )
        assert RolePermission.objects.filter(role="teacher", capability="grade").count() == 0
        assert capabilities_for_role("teacher")["grade"] is True

    def test_reactivates_soft_deleted_override(self):
        # A soft-deleted override must not block re-setting the same cell.
        RolePermission.all_objects.create(role="teacher", capability="grade", allowed=False)
        RolePermission.all_objects.filter(role="teacher").update(deleted_at="2020-01-01T00:00:00Z")
        c = client_for(AdminUserFactory())
        r = c.put(
            URL,
            {"overrides": [{"role": "teacher", "capability": "grade", "allowed": False}]},
            format="json",
        )
        assert r.status_code == 200
        assert RolePermission.objects.filter(role="teacher", capability="grade").count() == 1
        assert capabilities_for_role("teacher")["grade"] is False


class TestValidation:
    def test_admin_role_not_editable(self):
        r = client_for(AdminUserFactory()).put(
            URL,
            {"overrides": [{"role": "admin", "capability": "grade", "allowed": False}]},
            format="json",
        )
        assert r.status_code == 400

    def test_unknown_capability_rejected(self):
        r = client_for(AdminUserFactory()).put(
            URL,
            {"overrides": [{"role": "teacher", "capability": "fly", "allowed": True}]},
            format="json",
        )
        assert r.status_code == 400

    def test_non_bool_allowed_rejected(self):
        r = client_for(AdminUserFactory()).put(
            URL,
            {"overrides": [{"role": "teacher", "capability": "grade", "allowed": "yes"}]},
            format="json",
        )
        assert r.status_code == 400

    def test_missing_overrides_rejected(self):
        assert client_for(AdminUserFactory()).put(URL, {}, format="json").status_code == 400
