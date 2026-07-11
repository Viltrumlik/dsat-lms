"""
DSAT LMS v2 — Org settings tests
Domain: Identity
Covers: permission gate, singleton load, GET defaults, PATCH update, and
        grading-threshold / feature-flag validation.

Note: these hit DRF directly, so bodies/responses are snake_case (the camel↔snake
transform lives in the frontend axios client, not the API).
"""

import pytest
from rest_framework.test import APIClient

from apps.identity.models import OrgSetting
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

URL = "/api/v1/admin/org-settings/"


def admin_client():
    client = APIClient()
    client.force_authenticate(AdminUserFactory())
    return client


class TestPermissions:
    def test_unauthenticated_401(self, api_client):
        assert api_client.get(URL).status_code == 401

    def test_public_forbidden(self, auth_client):
        assert auth_client.get(URL).status_code == 403

    def test_teacher_forbidden(self):
        client = APIClient()
        client.force_authenticate(UserFactory(role="teacher"))
        assert client.patch(URL, {"academy_name": "x"}, format="json").status_code == 403


class TestSingleton:
    def test_load_is_idempotent(self):
        a = OrgSetting.load()
        b = OrgSetting.load()
        assert a.pk == b.pk
        assert OrgSetting.objects.count() == 1


class TestReadWrite:
    def test_get_returns_defaults(self):
        r = admin_client().get(URL)
        assert r.status_code == 200
        assert r.data["success"] is True
        data = r.data["data"]
        assert data["grading_thresholds"] == {"A": 90, "B": 80, "C": 70, "D": 60}
        assert data["display_timezone"]

    def test_patch_updates_fields(self):
        client = admin_client()
        r = client.patch(
            URL,
            {
                "academy_name": "DSAT Prep",
                "academic_year": "2025-2026",
                "grading_thresholds": {"A": 85, "B": 70},
                "feature_flags": {"courses": True, "leads": False},
            },
            format="json",
        )
        assert r.status_code == 200, r.data
        data = r.data["data"]
        assert data["academy_name"] == "DSAT Prep"
        assert data["academic_year"] == "2025-2026"
        assert data["grading_thresholds"] == {"A": 85, "B": 70}
        assert data["feature_flags"] == {"courses": True, "leads": False}
        # Persisted to the singleton.
        assert OrgSetting.load().academy_name == "DSAT Prep"

    def test_invalid_grading_threshold_rejected(self):
        r = admin_client().patch(URL, {"grading_thresholds": {"A": 150}}, format="json")
        assert r.status_code == 400

    def test_grading_threshold_must_be_object(self):
        r = admin_client().patch(URL, {"grading_thresholds": [90, 80]}, format="json")
        assert r.status_code == 400

    def test_feature_flags_must_be_boolean(self):
        r = admin_client().patch(URL, {"feature_flags": {"courses": "yes"}}, format="json")
        assert r.status_code == 400
