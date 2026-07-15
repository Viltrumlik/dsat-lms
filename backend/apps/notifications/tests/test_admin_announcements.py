"""
DSAT LMS v2 — Announcement admin endpoint tests (5.2c)
Domain: Notifications
Covers: gate, create/list, channel + audience validation, send (fan-out +
        already-sent guard + draft-only edit), and template CRUD.
"""

import pytest
from rest_framework.test import APIClient

from apps.identity.tests.factories import AdminUserFactory, UserFactory
from apps.notifications.models import MessageTemplate, Notification

pytestmark = pytest.mark.django_db

LIST = "/api/v1/admin/announcements/"
TEMPLATES = "/api/v1/admin/message-templates/"


def admin_client():
    c = APIClient()
    c.force_authenticate(AdminUserFactory())
    return c


def _create(client, **over):
    body = {
        "title": "Snow day",
        "body": "No classes tomorrow.",
        "audience_type": "all_students",
        "channels": ["in_app"],
    }
    body.update(over)
    return client.post(LIST, body, format="json")


class TestPermissions:
    def test_unauthenticated_401(self, api_client):
        assert api_client.get(LIST).status_code == 401

    def test_teacher_forbidden(self):
        c = APIClient()
        c.force_authenticate(UserFactory(role="teacher"))
        assert c.get(LIST).status_code == 403


class TestCreateValidate:
    def test_create_draft(self):
        r = _create(admin_client())
        assert r.status_code == 201, r.data
        assert r.data["data"]["status"] == "draft"

    def test_bad_channel_rejected(self):
        assert _create(admin_client(), channels=["carrier_pigeon"]).status_code == 400

    def test_empty_channels_rejected(self):
        assert _create(admin_client(), channels=[]).status_code == 400

    def test_role_audience_needs_valid_role(self):
        assert (
            _create(admin_client(), audience_type="role", audience_ref="wizard").status_code == 400
        )

    def test_class_audience_needs_ref(self):
        assert _create(admin_client(), audience_type="class").status_code == 400


class TestSend:
    def test_send_fans_out(self):
        UserFactory(role="student")
        client = admin_client()
        aid = _create(client).data["data"]["id"]
        r = client.post(f"{LIST}{aid}/send/")
        assert r.status_code == 200, r.data
        assert r.data["data"]["sent"] == 1
        assert Notification.objects.filter(type=Notification.Type.ANNOUNCEMENT).count() == 1

    def test_send_twice_guarded(self):
        UserFactory(role="student")
        client = admin_client()
        aid = _create(client).data["data"]["id"]
        client.post(f"{LIST}{aid}/send/")
        assert client.post(f"{LIST}{aid}/send/").status_code == 400

    def test_cannot_edit_after_send(self):
        UserFactory(role="student")
        client = admin_client()
        aid = _create(client).data["data"]["id"]
        client.post(f"{LIST}{aid}/send/")
        assert client.patch(f"{LIST}{aid}/", {"title": "x"}, format="json").status_code == 400


class TestTemplates:
    def test_template_crud(self):
        client = admin_client()
        r = client.post(TEMPLATES, {"name": "Reminder", "body": "Please submit."}, format="json")
        assert r.status_code == 201
        tid = r.data["data"]["id"]
        assert client.get(TEMPLATES).status_code == 200
        assert client.delete(f"{TEMPLATES}{tid}/").status_code == 204
        assert not MessageTemplate.objects.filter(pk=tid).exists()
