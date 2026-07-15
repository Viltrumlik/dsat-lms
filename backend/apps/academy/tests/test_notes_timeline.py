"""
DSAT LMS v2 — Student notes + timeline tests (5.5b)
Domain: Academy
Covers: IsAdmin gate, note CRUD + pin ordering, and the merged Student-360
        timeline (note + parent-contact + mentor-checkin + audit, newest-first).
"""

import pytest
from rest_framework.test import APIClient

from apps.academy.models import (
    Guardian,
    MentorCheckIn,
    ParentContactLog,
    StudentNote,
    StudentProfile,
)
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def notes_url(sid):
    return f"/api/v1/admin/students/{sid}/notes/"


class TestNotes:
    def test_gate(self):
        s = UserFactory(role="student")
        assert client_for(UserFactory(role="teacher")).get(notes_url(s.id)).status_code == 403

    def test_create_and_pin_ordering(self):
        admin = AdminUserFactory()
        s = UserFactory(role="student")
        c = client_for(admin)
        c.post(notes_url(s.id), {"body": "First"}, format="json")
        second = c.post(notes_url(s.id), {"body": "Pinned", "pinned": True}, format="json")
        assert second.status_code == 201
        rows = c.get(notes_url(s.id)).data["data"]
        # Pinned note sorts first regardless of recency.
        assert rows[0]["body"] == "Pinned" and rows[0]["pinned"] is True

    def test_edit_and_delete(self):
        admin = AdminUserFactory()
        s = UserFactory(role="student")
        c = client_for(admin)
        created = c.post(notes_url(s.id), {"body": "Draft"}, format="json")
        note_id = created.data["data"]["id"]
        r = c.patch(f"{notes_url(s.id)}{note_id}/", {"pinned": True}, format="json")
        assert r.status_code == 200 and r.data["data"]["pinned"] is True
        assert c.delete(f"{notes_url(s.id)}{note_id}/").status_code == 204
        assert StudentNote.objects.filter(id=note_id).count() == 0


class TestTimeline:
    def test_merges_all_sources_newest_first(self):
        admin = AdminUserFactory()
        s = UserFactory(role="student")
        profile = StudentProfile.objects.create(user=s)
        guardian = Guardian.objects.create(profile=profile, name="Parent", relation="mother")

        StudentNote.objects.create(student=s, author=admin, body="A note")
        ParentContactLog.objects.create(profile=profile, guardian=guardian, author=admin, note="Called home")
        MentorCheckIn.objects.create(profile=profile, mentor=admin, note="Weekly check-in")

        from apps.audit.services import record_activity

        record_activity(
            actor=admin, action="student.status_changed", target=s, summary="active → frozen"
        )

        rows = client_for(admin).get(f"/api/v1/admin/students/{s.id}/timeline/").data["data"]
        types = {e["type"] for e in rows}
        assert {"note", "parent_contact", "mentor_checkin", "audit"} <= types
        # Newest-first ordering.
        timestamps = [e["timestamp"] for e in rows]
        assert timestamps == sorted(timestamps, reverse=True)
