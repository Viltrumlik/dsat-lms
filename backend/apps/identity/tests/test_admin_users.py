"""
DSAT LMS v2 — Admin user-management tests
Domain: Identity
Covers: permission gate, list (filters + search + soft-delete visibility + pagination
        meta), create (+ validation), detail, update (+ email uniqueness + role
        immutability), role change, deactivate/reactivate, soft-delete, set-password,
        and self-action guards.
"""

import pytest
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

ADMIN = "/api/v1/admin/"


def admin_client():
    admin = AdminUserFactory()
    client = APIClient()
    client.force_authenticate(admin)
    client.user = admin
    return client


class TestPermissions:
    def test_unauthenticated_401(self, api_client):
        assert api_client.get(ADMIN + "users/").status_code == 401

    def test_public_user_forbidden(self, auth_client):
        # auth_client is a public-role user
        assert auth_client.get(ADMIN + "users/").status_code == 403

    def test_teacher_forbidden(self):
        teacher = UserFactory(role="teacher")
        client = APIClient()
        client.force_authenticate(teacher)
        assert client.get(ADMIN + "users/").status_code == 403

    def test_student_forbidden(self):
        student = UserFactory(role="student")
        client = APIClient()
        client.force_authenticate(student)
        assert client.post(ADMIN + "users/", {}, format="json").status_code == 403


class TestList:
    def test_admin_lists_all_users(self):
        client = admin_client()
        UserFactory(role="public")
        UserFactory(role="teacher")
        r = client.get(ADMIN + "users/")
        assert r.status_code == 200
        assert r.data["success"] is True
        # two created + the admin itself
        assert len(r.data["data"]) >= 3
        assert "pagination" in r.data["meta"]

    def test_filter_by_role(self):
        client = admin_client()
        UserFactory(role="public")
        UserFactory(role="teacher")
        r = client.get(ADMIN + "users/?role=teacher")
        assert r.status_code == 200
        rows = r.data["data"]
        assert rows and all(u["role"] == "teacher" for u in rows)

    def test_filter_by_is_active(self):
        client = admin_client()
        UserFactory(role="public", is_active=False, email="inactive@dsat.local")
        r = client.get(ADMIN + "users/?is_active=false")
        assert [u["email"] for u in r.data["data"]] == ["inactive@dsat.local"]

    def test_filter_by_is_email_verified(self):
        client = admin_client()
        UserFactory(role="public", is_email_verified=True, email="verified@dsat.local")
        rows = client.get(ADMIN + "users/?is_email_verified=true&role=public").data["data"]
        assert [u["email"] for u in rows] == ["verified@dsat.local"]

    def test_search_matches_email_and_name(self):
        client = admin_client()
        UserFactory(role="public", email="alice@dsat.local", first_name="Alice")
        UserFactory(role="public", email="bob@dsat.local", first_name="Bob")
        by_email = client.get(ADMIN + "users/?search=alice").data["data"]
        assert [u["email"] for u in by_email] == ["alice@dsat.local"]
        by_name = client.get(ADMIN + "users/?search=Bob").data["data"]
        assert [u["email"] for u in by_name] == ["bob@dsat.local"]

    def test_soft_deleted_hidden_by_default_and_shown_when_requested(self):
        client = admin_client()
        gone = UserFactory(role="public", email="gone@dsat.local")
        gone.soft_delete()
        default_emails = [u["email"] for u in client.get(ADMIN + "users/").data["data"]]
        assert "gone@dsat.local" not in default_emails
        with_deleted = [
            u["email"] for u in client.get(ADMIN + "users/?include_deleted=true").data["data"]
        ]
        assert "gone@dsat.local" in with_deleted


class TestCreate:
    def test_create_success(self):
        client = admin_client()
        r = client.post(
            ADMIN + "users/",
            {
                "email": "New@dsat.local",
                "first_name": "New",
                "last_name": "Teacher",
                "role": "teacher",
                "password": "SecurePass999!",
            },
            format="json",
        )
        assert r.status_code == 201
        assert r.data["data"]["role"] == "teacher"
        assert r.data["data"]["email"] == "new@dsat.local"  # normalized
        # admin-created accounts are pre-verified
        assert r.data["data"]["is_email_verified"] is True
        user = User.objects.get(email="new@dsat.local")
        assert user.check_password("SecurePass999!")

    def test_create_duplicate_email_400(self):
        client = admin_client()
        UserFactory(email="exists@dsat.local")
        r = client.post(
            ADMIN + "users/",
            {
                "email": "exists@dsat.local",
                "first_name": "Dup",
                "last_name": "User",
                "role": "public",
                "password": "SecurePass999!",
            },
            format="json",
        )
        assert r.status_code == 400
        assert r.data["error"]["code"] == "VALIDATION_ERROR"
        assert "email" in r.data["error"]["fields"]

    def test_create_weak_password_400(self):
        client = admin_client()
        r = client.post(
            ADMIN + "users/",
            {
                "email": "weak@dsat.local",
                "first_name": "Weak",
                "last_name": "Pass",
                "role": "public",
                "password": "123",
            },
            format="json",
        )
        assert r.status_code == 400
        assert "password" in r.data["error"]["fields"]

    def test_create_invalid_role_400(self):
        client = admin_client()
        r = client.post(
            ADMIN + "users/",
            {
                "email": "bad@dsat.local",
                "first_name": "Bad",
                "last_name": "Role",
                "role": "superuser",
                "password": "SecurePass999!",
            },
            format="json",
        )
        assert r.status_code == 400
        assert "role" in r.data["error"]["fields"]


class TestDetailAndUpdate:
    def test_get_detail(self):
        client = admin_client()
        u = UserFactory(role="public", email="detail@dsat.local")
        r = client.get(f"{ADMIN}users/{u.id}/")
        assert r.status_code == 200
        assert r.data["data"]["email"] == "detail@dsat.local"

    def test_get_missing_404(self):
        client = admin_client()
        assert client.get(f"{ADMIN}users/00000000-0000-0000-0000-000000000000/").status_code == 404

    def test_update_names(self):
        client = admin_client()
        u = UserFactory(role="public")
        r = client.patch(f"{ADMIN}users/{u.id}/", {"first_name": "Renamed"}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["first_name"] == "Renamed"

    def test_update_email_conflict_400(self):
        client = admin_client()
        UserFactory(email="taken@dsat.local")
        u = UserFactory(role="public")
        r = client.patch(f"{ADMIN}users/{u.id}/", {"email": "taken@dsat.local"}, format="json")
        assert r.status_code == 400
        assert "email" in r.data["error"]["fields"]

    def test_update_ignores_role_field(self):
        """Role isn't part of the update serializer — a role in the body is a no-op."""
        client = admin_client()
        u = UserFactory(role="public")
        r = client.patch(f"{ADMIN}users/{u.id}/", {"role": "admin"}, format="json")
        assert r.status_code == 200
        u.refresh_from_db()
        assert u.role == "public"


class TestRole:
    def test_change_role(self):
        client = admin_client()
        u = UserFactory(role="public")
        r = client.patch(f"{ADMIN}users/{u.id}/role/", {"role": "student"}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["role"] == "student"
        u.refresh_from_db()
        assert u.role == "student"

    def test_invalid_role_400(self):
        client = admin_client()
        u = UserFactory(role="public")
        r = client.patch(f"{ADMIN}users/{u.id}/role/", {"role": "wizard"}, format="json")
        assert r.status_code == 400
        assert "role" in r.data["error"]["fields"]

    def test_cannot_change_own_role(self):
        client = admin_client()
        r = client.patch(f"{ADMIN}users/{client.user.id}/role/", {"role": "public"}, format="json")
        assert r.status_code == 400
        client.user.refresh_from_db()
        assert client.user.role == "admin"


class TestActivation:
    def test_deactivate_then_reactivate(self):
        client = admin_client()
        u = UserFactory(role="public")
        r = client.post(f"{ADMIN}users/{u.id}/deactivate/")
        assert r.status_code == 200
        u.refresh_from_db()
        assert u.is_active is False
        r = client.post(f"{ADMIN}users/{u.id}/reactivate/")
        assert r.status_code == 200
        u.refresh_from_db()
        assert u.is_active is True

    def test_cannot_deactivate_self(self):
        client = admin_client()
        r = client.post(f"{ADMIN}users/{client.user.id}/deactivate/")
        assert r.status_code == 400
        client.user.refresh_from_db()
        assert client.user.is_active is True

    def test_reactivate_clears_soft_delete(self):
        client = admin_client()
        u = UserFactory(role="public")
        u.soft_delete()
        assert u.deleted_at is not None and u.is_active is False
        r = client.post(f"{ADMIN}users/{u.id}/reactivate/")
        assert r.status_code == 200
        u.refresh_from_db()
        assert u.deleted_at is None and u.is_active is True


class TestSoftDelete:
    def test_soft_delete(self):
        client = admin_client()
        u = UserFactory(role="public")
        r = client.delete(f"{ADMIN}users/{u.id}/")
        assert r.status_code == 204
        u.refresh_from_db()
        assert u.deleted_at is not None
        assert u.is_active is False

    def test_cannot_delete_self(self):
        client = admin_client()
        r = client.delete(f"{ADMIN}users/{client.user.id}/")
        assert r.status_code == 400
        client.user.refresh_from_db()
        assert client.user.deleted_at is None


class TestSetPassword:
    def test_set_password(self):
        client = admin_client()
        u = UserFactory(role="public")
        r = client.post(
            f"{ADMIN}users/{u.id}/set-password/",
            {"new_password": "BrandNewPass1!"},
            format="json",
        )
        assert r.status_code == 200
        u.refresh_from_db()
        assert u.check_password("BrandNewPass1!")

    def test_set_password_weak_400(self):
        client = admin_client()
        u = UserFactory(role="public")
        r = client.post(
            f"{ADMIN}users/{u.id}/set-password/", {"new_password": "123"}, format="json"
        )
        assert r.status_code == 400
        assert "new_password" in r.data["error"]["fields"]

    def test_cannot_set_own_password(self):
        client = admin_client()
        r = client.post(
            f"{ADMIN}users/{client.user.id}/set-password/",
            {"new_password": "BrandNewPass1!"},
            format="json",
        )
        assert r.status_code == 400
        client.user.refresh_from_db()
        assert client.user.check_password("TestPass123!")  # unchanged (factory default)

    def test_set_password_blacklists_existing_sessions(self):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
        from rest_framework_simplejwt.tokens import RefreshToken

        client = admin_client()
        u = UserFactory(role="public")
        RefreshToken.for_user(u)  # records an OutstandingToken for u
        r = client.post(
            f"{ADMIN}users/{u.id}/set-password/",
            {"new_password": "BrandNewPass1!"},
            format="json",
        )
        assert r.status_code == 200
        assert BlacklistedToken.objects.filter(token__user=u).exists()


class TestLastAdminGuard:
    """At least one active admin must always remain. In practice the acting admin is
    always another active admin (self-actions are blocked and simplejwt rejects
    inactive users at auth), so to exercise the invariant directly we force-auth an
    admin who is themselves inactive."""

    def _inactive_admin_client(self):
        actor = AdminUserFactory(is_active=False)
        client = APIClient()
        client.force_authenticate(actor)
        client.user = actor
        return client

    def test_can_delete_admin_when_another_remains(self):
        client = admin_client()  # actor is an active admin
        other = AdminUserFactory()
        assert client.delete(f"{ADMIN}users/{other.id}/").status_code == 204

    def test_cannot_delete_last_active_admin(self):
        client = self._inactive_admin_client()
        sole = AdminUserFactory()  # the only ACTIVE admin
        r = client.delete(f"{ADMIN}users/{sole.id}/")
        assert r.status_code == 400
        sole.refresh_from_db()
        assert sole.deleted_at is None

    def test_cannot_deactivate_last_active_admin(self):
        client = self._inactive_admin_client()
        sole = AdminUserFactory()
        r = client.post(f"{ADMIN}users/{sole.id}/deactivate/")
        assert r.status_code == 400
        sole.refresh_from_db()
        assert sole.is_active is True

    def test_cannot_demote_last_active_admin(self):
        client = self._inactive_admin_client()
        sole = AdminUserFactory()
        r = client.patch(f"{ADMIN}users/{sole.id}/role/", {"role": "teacher"}, format="json")
        assert r.status_code == 400
        sole.refresh_from_db()
        assert sole.role == "admin"

    def test_can_demote_admin_when_another_remains(self):
        client = admin_client()  # active admin actor remains
        other = AdminUserFactory()
        r = client.patch(f"{ADMIN}users/{other.id}/role/", {"role": "teacher"}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["role"] == "teacher"


class TestUpdateProfileFields:
    def test_update_sat_target_score(self):
        client = admin_client()
        u = UserFactory(role="student")
        r = client.patch(f"{ADMIN}users/{u.id}/", {"sat_target_score": 1500}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["sat_target_score"] == 1500

    def test_sat_target_score_out_of_bounds_400(self):
        client = admin_client()
        u = UserFactory(role="student")
        assert (
            client.patch(
                f"{ADMIN}users/{u.id}/", {"sat_target_score": 300}, format="json"
            ).status_code
            == 400
        )
        assert (
            client.patch(
                f"{ADMIN}users/{u.id}/", {"sat_target_score": 2000}, format="json"
            ).status_code
            == 400
        )

    def test_update_timezone_and_exam_date(self):
        client = admin_client()
        u = UserFactory(role="student")
        r = client.patch(
            f"{ADMIN}users/{u.id}/",
            {"timezone": "UTC", "exam_date": "2026-11-07"},
            format="json",
        )
        assert r.status_code == 200
        u.refresh_from_db()
        assert u.timezone == "UTC"
        assert str(u.exam_date) == "2026-11-07"

    def test_email_normalized_and_case_insensitive_dup(self):
        client = admin_client()
        UserFactory(email="taken@dsat.local")
        u = UserFactory(role="public")
        r = client.patch(
            f"{ADMIN}users/{u.id}/", {"email": "  MixedCase@DSAT.local "}, format="json"
        )
        assert r.status_code == 200
        assert r.data["data"]["email"] == "mixedcase@dsat.local"
        r2 = client.patch(f"{ADMIN}users/{u.id}/", {"email": "TAKEN@dsat.local"}, format="json")
        assert r2.status_code == 400
        assert "email" in r2.data["error"]["fields"]


class TestListPaginationAndFilters:
    def test_pagination_cursor_flow(self):
        from urllib.parse import urlparse

        client = admin_client()
        for i in range(25):
            UserFactory(role="public", email=f"pg{i:02d}@dsat.local")
        r1 = client.get(ADMIN + "users/?page_size=10")
        assert r1.status_code == 200
        assert len(r1.data["data"]) == 10
        next_url = r1.data["meta"]["pagination"]["next"]
        assert next_url
        parsed = urlparse(next_url)
        r2 = client.get(f"{parsed.path}?{parsed.query}")
        assert r2.status_code == 200
        page1 = {u["id"] for u in r1.data["data"]}
        page2 = {u["id"] for u in r2.data["data"]}
        assert page1.isdisjoint(page2)

    def test_include_deleted_respects_role_filter(self):
        client = admin_client()
        gone_teacher = UserFactory(role="teacher", email="delteach@dsat.local")
        gone_teacher.soft_delete()
        gone_public = UserFactory(role="public", email="delpub@dsat.local")
        gone_public.soft_delete()
        rows = client.get(ADMIN + "users/?include_deleted=true&role=teacher").data["data"]
        emails = [u["email"] for u in rows]
        assert "delteach@dsat.local" in emails
        assert "delpub@dsat.local" not in emails
