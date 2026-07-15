"""
DSAT LMS v2 — CRM tags tests (5.5b)
Domain: CRM
Covers: IsAdmin gate, tag CRUD (+ unique name), assign/unassign across entity
        types (student + lead), list-on-entity, unknown-entity 404, idempotent
        re-assign (reactivate soft-deleted link).
"""

import pytest
from rest_framework.test import APIClient

from apps.crm.tags import Tag, TaggedItem
from apps.crm.tests.factories import LeadFactory
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

TAGS = "/api/v1/admin/crm/tags/"


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class TestTagCrud:
    def test_gate(self):
        assert client_for(UserFactory(role="teacher")).get(TAGS).status_code == 403

    def test_create_and_unique(self):
        c = client_for(AdminUserFactory())
        assert c.post(TAGS, {"name": "VIP", "color": "#4F46E5"}, format="json").status_code == 201
        assert c.post(TAGS, {"name": "VIP"}, format="json").status_code == 400

    def test_delete_removes_links(self):
        admin = AdminUserFactory()
        c = client_for(admin)
        tag = Tag.objects.create(name="Scholarship")
        student = UserFactory(role="student")
        c.post(f"{TAGS}student/{student.id}/", {"tag": str(tag.id)}, format="json")
        assert TaggedItem.objects.filter(tag=tag).count() == 1
        assert c.delete(f"{TAGS}{tag.id}/").status_code == 204
        tag.refresh_from_db()
        assert tag.deleted_at is not None
        assert TaggedItem.objects.filter(tag=tag).count() == 0  # links soft-deleted too


class TestEntityTagging:
    def test_assign_and_list_on_student(self):
        c = client_for(AdminUserFactory())
        tag = Tag.objects.create(name="At-risk")
        student = UserFactory(role="student")
        r = c.post(f"{TAGS}student/{student.id}/", {"tag": str(tag.id)}, format="json")
        assert r.status_code == 200
        listed = c.get(f"{TAGS}student/{student.id}/").data["data"]
        assert len(listed) == 1 and listed[0]["name"] == "At-risk"

    def test_assign_to_lead(self):
        c = client_for(AdminUserFactory())
        tag = Tag.objects.create(name="Hot")
        lead = LeadFactory(owner=UserFactory(role="receptionist"))
        assert (
            c.post(f"{TAGS}lead/{lead.id}/", {"tag": str(tag.id)}, format="json").status_code == 200
        )
        assert c.get(f"{TAGS}lead/{lead.id}/").data["data"][0]["name"] == "Hot"

    def test_assign_is_idempotent(self):
        c = client_for(AdminUserFactory())
        tag = Tag.objects.create(name="Twice")
        student = UserFactory(role="student")
        c.post(f"{TAGS}student/{student.id}/", {"tag": str(tag.id)}, format="json")
        c.post(f"{TAGS}student/{student.id}/", {"tag": str(tag.id)}, format="json")
        assert TaggedItem.objects.filter(tag=tag).count() == 1

    def test_unassign(self):
        c = client_for(AdminUserFactory())
        tag = Tag.objects.create(name="Remove me")
        student = UserFactory(role="student")
        c.post(f"{TAGS}student/{student.id}/", {"tag": str(tag.id)}, format="json")
        assert c.delete(f"{TAGS}student/{student.id}/{tag.id}/").status_code == 204
        assert c.get(f"{TAGS}student/{student.id}/").data["data"] == []

    def test_reassign_reactivates_link(self):
        c = client_for(AdminUserFactory())
        tag = Tag.objects.create(name="Cycle")
        student = UserFactory(role="student")
        c.post(f"{TAGS}student/{student.id}/", {"tag": str(tag.id)}, format="json")
        c.delete(f"{TAGS}student/{student.id}/{tag.id}/")
        c.post(f"{TAGS}student/{student.id}/", {"tag": str(tag.id)}, format="json")
        # Reactivated, not duplicated.
        assert TaggedItem.all_objects.filter(tag=tag).count() == 1
        assert TaggedItem.objects.filter(tag=tag).count() == 1

    def test_unknown_entity_404(self):
        import uuid

        c = client_for(AdminUserFactory())
        tag = Tag.objects.create(name="X")
        assert (
            c.post(
                f"{TAGS}student/{uuid.uuid4()}/", {"tag": str(tag.id)}, format="json"
            ).status_code
            == 404
        )
        # A teacher is not a taggable "student".
        teacher = UserFactory(role="teacher")
        assert (
            c.post(f"{TAGS}student/{teacher.id}/", {"tag": str(tag.id)}, format="json").status_code
            == 404
        )
