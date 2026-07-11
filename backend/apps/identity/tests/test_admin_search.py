"""
DSAT LMS v2 — Admin global-search tests (Phase 5.1a)
Domain: Identity (admin)
Covers: permission gate, short-query guard, and the users group.
"""

import pytest
from rest_framework.test import APIClient

from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

URL = "/api/v1/admin/search/"


def admin_client():
    client = APIClient()
    client.force_authenticate(AdminUserFactory())
    return client


class TestPermissions:
    def test_unauthenticated_401(self, api_client):
        assert api_client.get(URL + "?q=abc").status_code == 401

    def test_teacher_forbidden(self):
        client = APIClient()
        client.force_authenticate(UserFactory(role="teacher"))
        assert client.get(URL + "?q=abc").status_code == 403


class TestSearch:
    def test_short_query_empty(self):
        r = admin_client().get(URL + "?q=a")
        assert r.status_code == 200
        assert r.data["data"]["groups"] == []

    def test_finds_user_by_email(self):
        UserFactory(email="findme.unique@example.com", first_name="Find", last_name="Me")
        r = admin_client().get(URL + "?q=findme.unique")
        assert r.status_code == 200
        groups = {g["type"]: g for g in r.data["data"]["groups"]}
        assert "users" in groups
        assert any(
            item["subtitle"] == "findme.unique@example.com" for item in groups["users"]["items"]
        )

    def test_no_match_no_group(self):
        r = admin_client().get(URL + "?q=zzz-nonexistent-zzz")
        assert r.status_code == 200
        assert r.data["data"]["groups"] == []
