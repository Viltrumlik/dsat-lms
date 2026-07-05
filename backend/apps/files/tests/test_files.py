"""
DSAT LMS v2 — Files pipeline tests
Domain: Files
Covers: upload (+ validation: size/type/magic-byte sniff/owner-on-behalf), list
        (own + staff-scoped), detail/soft-delete, download (public avatar vs
        auth-gated private), set-avatar, and the purge task.
"""

import io
from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.files.models import Attachment
from apps.files.tasks import purge_soft_deleted_attachments
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

FILES = "/api/v1/files/"


@pytest.fixture(autouse=True)
def _media_root(tmp_path, settings):
    # Uploads write real bytes; keep them in a per-test temp dir (auto-cleaned).
    settings.MEDIA_ROOT = str(tmp_path)


def _png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), "red").save(buf, format="PNG")
    return buf.getvalue()


def png_upload(name="a.png"):
    return SimpleUploadedFile(name, _png_bytes(), content_type="image/png")


def authed(user=None, role="student"):
    user = user or (AdminUserFactory() if role == "admin" else UserFactory(role=role))
    client = APIClient()
    client.force_authenticate(user)
    client.user = user
    return client


def _upload(client, kind="document", **extra):
    return client.post(FILES, {"file": png_upload(), "kind": kind, **extra}, format="multipart")


class TestUpload:
    def test_upload_avatar(self):
        client = authed()
        r = _upload(client, kind="avatar")
        assert r.status_code == 201, r.content
        data = r.json()["data"]
        assert data["kind"] == "avatar"
        assert data["size"] > 0
        assert data["download_url"].endswith(f"/api/v1/files/{data['id']}/download/")
        assert Attachment.objects.filter(id=data["id"], owner=client.user).exists()

    def test_upload_requires_file(self):
        assert authed().post(FILES, {"kind": "document"}, format="multipart").status_code == 400

    def test_upload_rejects_spoofed_image(self):
        bad = SimpleUploadedFile("x.png", b"not a real image", content_type="image/png")
        r = authed().post(FILES, {"file": bad, "kind": "avatar"}, format="multipart")
        assert r.status_code == 400
        assert r.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_upload_rejects_disallowed_type(self):
        exe = SimpleUploadedFile("x.exe", b"MZbinary", content_type="application/x-msdownload")
        assert (
            authed().post(FILES, {"file": exe, "kind": "document"}, format="multipart").status_code
            == 400
        )

    def test_upload_rejects_invalid_kind(self):
        r = authed().post(FILES, {"file": png_upload(), "kind": "bogus"}, format="multipart")
        assert r.status_code == 400

    def test_non_staff_cannot_upload_for_other(self):
        other = UserFactory(role="student")
        r = _upload(authed(role="student"), kind="avatar", owner_id=str(other.id))
        assert r.status_code == 403

    def test_staff_can_upload_for_student(self):
        student = UserFactory(role="student")
        r = _upload(authed(UserFactory(role="academic_manager")), owner_id=str(student.id))
        assert r.status_code == 201
        assert Attachment.objects.get(id=r.json()["data"]["id"]).owner_id == student.id


class TestListDetailDelete:
    def test_list_only_own(self):
        client = authed()
        _upload(client)
        _upload(authed(role="student"))
        r = client.get(FILES)
        assert r.status_code == 200
        assert {row["owner_id"] for row in r.json()["data"]} == {str(client.user.id)}

    def test_staff_lists_student_files(self):
        student = UserFactory(role="student")
        _upload(authed(student))
        r = authed(UserFactory(role="academic_manager")).get(FILES + f"?owner={student.id}")
        assert r.status_code == 200
        assert len(r.json()["data"]) == 1

    def test_non_staff_cannot_list_other(self):
        student = UserFactory(role="student")
        assert authed(role="student").get(FILES + f"?owner={student.id}").status_code == 403

    def test_soft_delete(self):
        client = authed()
        fid = _upload(client).json()["data"]["id"]
        assert client.delete(FILES + f"{fid}/").status_code == 204
        assert client.get(FILES + f"{fid}/").status_code == 404
        assert Attachment.all_objects.get(id=fid).deleted_at is not None

    def test_other_user_cannot_see_or_delete(self):
        fid = _upload(authed()).json()["data"]["id"]
        assert authed(role="student").delete(FILES + f"{fid}/").status_code == 404


class TestDownload:
    def test_avatar_is_public(self):
        fid = _upload(authed(), kind="avatar").json()["data"]["id"]
        assert APIClient().get(FILES + f"{fid}/download/").status_code == 200

    def test_private_requires_access(self):
        client = authed()
        fid = _upload(client).json()["data"]["id"]
        assert APIClient().get(FILES + f"{fid}/download/").status_code == 404  # unauth
        assert authed(role="student").get(FILES + f"{fid}/download/").status_code == 404  # other
        assert client.get(FILES + f"{fid}/download/").status_code == 200  # owner

    def test_full_access_staff_can_download_private(self):
        student = UserFactory(role="student")
        fid = _upload(authed(student)).json()["data"]["id"]
        assert authed(role="admin").get(FILES + f"{fid}/download/").status_code == 200


class TestSetAvatar:
    def test_set_avatar_updates_user(self):
        client = authed()
        fid = _upload(client, kind="avatar").json()["data"]["id"]
        r = client.post(FILES + f"{fid}/set-avatar/")
        assert r.status_code == 200
        client.user.refresh_from_db()
        assert client.user.avatar_url.endswith(f"/api/v1/files/{fid}/download/")
        assert r.json()["data"]["avatar_url"] == client.user.avatar_url

    def test_non_avatar_rejected(self):
        client = authed()
        fid = _upload(client, kind="document").json()["data"]["id"]
        assert client.post(FILES + f"{fid}/set-avatar/").status_code == 400


class TestPurgeTask:
    def test_purges_old_soft_deleted(self):
        fid = _upload(authed()).json()["data"]["id"]
        Attachment.all_objects.filter(id=fid).update(deleted_at=timezone.now() - timedelta(days=40))
        assert purge_soft_deleted_attachments() == 1
        assert not Attachment.all_objects.filter(id=fid).exists()

    def test_keeps_recent_and_live(self):
        client = authed()
        _upload(client)  # live
        fid = _upload(client).json()["data"]["id"]
        Attachment.all_objects.filter(id=fid).update(deleted_at=timezone.now())  # recent
        assert purge_soft_deleted_attachments() == 0
        assert Attachment.all_objects.count() == 2


class TestSecurityHardening:
    def test_hostile_filename_download_is_well_formed(self):
        # A filename with a quote + non-ASCII must not corrupt the header.
        client = authed()
        bad_name = 'evil"; download; filename="x.exe.png'
        upload = SimpleUploadedFile(bad_name, _png_bytes(), content_type="image/png")
        fid = client.post(FILES, {"file": upload, "kind": "avatar"}, format="multipart").json()[
            "data"
        ]["id"]
        r = client.get(FILES + f"{fid}/download/")
        assert r.status_code == 200
        cd = r["Content-Disposition"]
        # Django RFC-6266-encodes; the raw quote/semicolon must not appear unescaped.
        assert 'filename="evil"' not in cd
        assert r["X-Content-Type-Options"] == "nosniff"

    def test_text_plain_now_rejected(self):
        txt = SimpleUploadedFile("notes.txt", b"hello", content_type="text/plain")
        assert (
            authed().post(FILES, {"file": txt, "kind": "document"}, format="multipart").status_code
            == 400
        )

    def test_staff_cannot_upload_for_non_student(self):
        # Uploading on behalf of another STAFF member (not a student) is refused.
        other_teacher = UserFactory(role="teacher")
        r = _upload(authed(UserFactory(role="receptionist")), owner_id=str(other_teacher.id))
        assert r.status_code == 403

    def test_staff_cannot_set_non_student_avatar(self):
        # A receptionist may not overwrite an admin's avatar (no privilege escalation).
        admin = AdminUserFactory()
        # admin uploads their own avatar…
        fid = _upload(authed(admin), kind="avatar").json()["data"]["id"]
        # …a receptionist (full-access staff) must not be able to set it.
        assert (
            authed(UserFactory(role="receptionist")).post(FILES + f"{fid}/set-avatar/").status_code
            == 403
        )

    def test_replacing_avatar_soft_deletes_previous(self):
        client = authed()
        first = _upload(client, kind="avatar").json()["data"]["id"]
        client.post(FILES + f"{first}/set-avatar/")
        second = _upload(client, kind="avatar").json()["data"]["id"]
        client.post(FILES + f"{second}/set-avatar/")
        # The superseded avatar is soft-deleted (heads into the purge path).
        assert Attachment.all_objects.get(id=first).deleted_at is not None
        assert Attachment.objects.get(id=second).deleted_at is None
