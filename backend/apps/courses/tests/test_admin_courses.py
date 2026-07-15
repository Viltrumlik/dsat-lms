"""
DSAT LMS v2 — Courses admin authoring tests (5.4a)
Domain: Courses
Covers: IsAdmin gate, course CRUD + slug, publish lifecycle (empty-course guard),
        unit/lesson create, reorder-as-permutation (+ mismatch guard), lesson edit,
        attachment add/remove, soft-delete hides from list.
"""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.courses.tests.factories import CourseFactory, LessonFactory, UnitFactory
from apps.files.models import Attachment
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/courses/"


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class TestPermissions:
    def test_non_admin_forbidden(self):
        assert client_for(UserFactory(role="teacher")).get(BASE).status_code == 403
        assert client_for(UserFactory(role="student")).get(BASE).status_code == 403

    def test_admin_ok(self):
        assert client_for(AdminUserFactory()).get(BASE).status_code == 200


class TestCourseCrud:
    def test_create_generates_unique_slug(self):
        admin = AdminUserFactory()
        c = client_for(admin)
        r1 = c.post(BASE, {"title": "Algebra Basics", "subject": "math"}, format="json")
        assert r1.status_code == 201, r1.data
        assert r1.data["data"]["slug"] == "algebra-basics"
        r2 = c.post(BASE, {"title": "Algebra Basics", "subject": "math"}, format="json")
        assert r2.data["data"]["slug"] == "algebra-basics-2"

    def test_patch_and_soft_delete(self):
        course = CourseFactory()
        c = client_for(AdminUserFactory())
        r = c.patch(f"{BASE}{course.id}/", {"title": "Renamed"}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["title"] == "Renamed"
        assert r.data["data"]["slug"] == "renamed"
        assert c.delete(f"{BASE}{course.id}/").status_code == 204
        assert c.get(BASE).data["data"] == []
        course.refresh_from_db()
        assert course.deleted_at is not None

    def test_list_counts(self):
        course = CourseFactory()
        unit = UnitFactory(course=course)
        LessonFactory(unit=unit)
        LessonFactory(unit=unit)
        r = client_for(AdminUserFactory()).get(BASE)
        item = r.data["data"][0]
        assert item["unit_count"] == 1 and item["lesson_count"] == 2


class TestPublishLifecycle:
    def test_publish_requires_a_lesson(self):
        course = CourseFactory()
        c = client_for(AdminUserFactory())
        r = c.post(f"{BASE}{course.id}/publish/", {"action": "publish"}, format="json")
        assert r.status_code == 400

    def test_publish_then_archive(self):
        course = CourseFactory()
        LessonFactory(unit=UnitFactory(course=course))
        c = client_for(AdminUserFactory())
        r = c.post(f"{BASE}{course.id}/publish/", {"action": "publish"}, format="json")
        assert r.status_code == 200 and r.data["data"]["status"] == "published"
        course.refresh_from_db()
        assert course.published_at is not None
        r2 = c.post(f"{BASE}{course.id}/publish/", {"action": "archive"}, format="json")
        assert r2.data["data"]["status"] == "archived"


class TestUnitsLessons:
    def test_create_unit_and_lesson_autoposition(self):
        course = CourseFactory()
        c = client_for(AdminUserFactory())
        u1 = c.post(f"{BASE}{course.id}/units/", {"title": "U1"}, format="json")
        u2 = c.post(f"{BASE}{course.id}/units/", {"title": "U2"}, format="json")
        assert u1.data["data"]["position"] == 1 and u2.data["data"]["position"] == 2
        uid = u1.data["data"]["id"]
        l1 = c.post(f"{BASE}{course.id}/units/{uid}/lessons/", {"title": "L1"}, format="json")
        l2 = c.post(f"{BASE}{course.id}/units/{uid}/lessons/", {"title": "L2"}, format="json")
        assert l1.data["data"]["position"] == 1 and l2.data["data"]["position"] == 2

    def test_edit_lesson_body(self):
        lesson = LessonFactory()
        r = client_for(AdminUserFactory()).patch(
            f"/api/v1/admin/lessons/{lesson.id}/",
            {"content_md": "# New body", "video_url": "https://v.example/x"},
            format="json",
        )
        assert r.status_code == 200
        lesson.refresh_from_db()
        assert lesson.content_md == "# New body"

    def test_reorder_units(self):
        course = CourseFactory()
        u1 = UnitFactory(course=course, position=1)
        u2 = UnitFactory(course=course, position=2)
        u3 = UnitFactory(course=course, position=3)
        c = client_for(AdminUserFactory())
        r = c.post(
            f"{BASE}{course.id}/units/reorder/",
            {"order": [str(u3.id), str(u1.id), str(u2.id)]},
            format="json",
        )
        assert r.status_code == 200
        u1.refresh_from_db()
        u2.refresh_from_db()
        u3.refresh_from_db()
        assert (u3.position, u1.position, u2.position) == (1, 2, 3)

    def test_reorder_rejects_wrong_set(self):
        course = CourseFactory()
        u1 = UnitFactory(course=course, position=1)
        UnitFactory(course=course, position=2)
        r = client_for(AdminUserFactory()).post(
            f"{BASE}{course.id}/units/reorder/",
            {"order": [str(u1.id)]},  # missing u2
            format="json",
        )
        assert r.status_code == 400

    def test_soft_deleted_unit_frees_position(self):
        """A soft-deleted unit's position can be reused (partial-unique active-only)."""
        course = CourseFactory()
        u1 = UnitFactory(course=course, position=1)
        c = client_for(AdminUserFactory())
        assert c.delete(f"{BASE}{course.id}/units/{u1.id}/").status_code == 204
        # A new unit takes position 1 again — no IntegrityError.
        r = c.post(f"{BASE}{course.id}/units/", {"title": "Fresh"}, format="json")
        assert r.status_code == 201 and r.data["data"]["position"] == 1


class TestAttachments:
    def _attachment(self, owner):
        return Attachment.objects.create(
            owner=owner,
            uploaded_by=owner,
            file=SimpleUploadedFile("slides.pdf", b"%PDF-1.4 x"),
            original_name="slides.pdf",
            content_type="application/pdf",
            size=9,
            kind=Attachment.Kind.DOCUMENT,
        )

    def test_add_and_remove_attachment(self):
        admin = AdminUserFactory()
        lesson = LessonFactory()
        att = self._attachment(admin)
        c = client_for(admin)
        r = c.post(
            f"/api/v1/admin/lessons/{lesson.id}/attachments/",
            {"attachment": str(att.id), "caption": "Slides"},
            format="json",
        )
        assert r.status_code == 201, r.data
        link_id = r.data["data"]["id"]
        assert lesson.attachments.count() == 1
        d = c.delete(f"/api/v1/admin/lessons/{lesson.id}/attachments/{link_id}/")
        assert d.status_code == 204
        assert lesson.attachments.count() == 0
