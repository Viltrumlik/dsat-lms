"""
DSAT LMS v2 — Audit tests
Domain: Audit
Covers: record_activity() field snapshotting + system actor, the admin viewer
        gate + filters, the actions vocab endpoint, and that an instrumented
        admin mutation (role change) actually writes a row.
"""

import pytest
from rest_framework.test import APIClient

from apps.audit.models import ActivityLog
from apps.audit.services import record_activity
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

LIST = "/api/v1/admin/audit/"
ACTIONS = "/api/v1/admin/audit/actions/"


def admin_client():
    client = APIClient()
    admin = AdminUserFactory()
    client.force_authenticate(admin)
    client.user = admin
    return client


class TestRecordActivity:
    def test_snapshots_actor_and_target(self):
        actor = AdminUserFactory()
        target = UserFactory(role="student")
        row = record_activity(
            actor=actor,
            action="user.role_changed",
            target=target,
            summary="x → student",
            to_role="student",
        )
        assert row is not None
        assert row.actor_id == actor.id
        assert row.actor_role == actor.role
        assert row.target_type == "identity.User"
        assert str(row.target_id) == str(target.id)
        assert row.target_label  # denormalized, non-empty
        assert row.metadata == {"to_role": "student"}

    def test_system_actor_is_null(self):
        row = record_activity(actor=None, action="system.tick")
        assert row.actor_id is None
        assert row.actor_role == ""


class TestPermissions:
    def test_unauthenticated_401(self, api_client):
        assert api_client.get(LIST).status_code == 401

    def test_public_forbidden(self, auth_client):
        assert auth_client.get(LIST).status_code == 403

    def test_teacher_forbidden(self):
        client = APIClient()
        client.force_authenticate(UserFactory(role="teacher"))
        assert client.get(LIST).status_code == 403


class TestViewer:
    def test_lists_and_filters(self):
        client = admin_client()
        record_activity(actor=client.user, action="user.created", summary="a")
        record_activity(actor=client.user, action="question.approved", summary="b")

        r = client.get(LIST)
        assert r.status_code == 200
        assert r.data["success"] is True
        assert len(r.data["data"]) >= 2
        assert "pagination" in r.data["meta"]

        r = client.get(LIST + "?action=question.approved")
        assert r.status_code == 200
        assert all(row["action"] == "question.approved" for row in r.data["data"])

    def test_search_q(self):
        client = admin_client()
        record_activity(actor=client.user, action="user.created", summary="needle-xyz")
        r = client.get(LIST + "?q=needle-xyz")
        assert r.status_code == 200
        assert any("needle-xyz" in (row["summary"] or "") for row in r.data["data"])

    def test_actions_vocab(self):
        client = admin_client()
        record_activity(actor=client.user, action="user.created", target=UserFactory())
        r = client.get(ACTIONS)
        assert r.status_code == 200
        assert "user.created" in r.data["data"]["actions"]
        assert "identity.User" in r.data["data"]["target_types"]


class TestInstrumentation:
    def test_role_change_writes_a_row(self):
        client = admin_client()
        victim = UserFactory(role="student")
        r = client.patch(
            f"/api/v1/admin/users/{victim.id}/role/", {"role": "teacher"}, format="json"
        )
        assert r.status_code == 200
        assert ActivityLog.objects.filter(action="user.role_changed", target_id=victim.id).exists()
