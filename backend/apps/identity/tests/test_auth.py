"""
DSAT LMS v2 — Identity auth tests
Domain: Identity
Covers: register, login, me, refresh (rotation/blacklist), logout, email
        verification, password reset, password change.
"""

import pytest
from django.contrib.auth.tokens import default_token_generator

from apps.identity.models import User
from apps.identity.tests.factories import DEFAULT_PASSWORD, UserFactory
from apps.identity.tokens import email_verification_token, encode_uid

pytestmark = pytest.mark.django_db

REGISTER = "/api/v1/auth/register/"
LOGIN = "/api/v1/auth/login/"
REFRESH = "/api/v1/auth/refresh/"
LOGOUT = "/api/v1/auth/logout/"
ME = "/api/v1/auth/me/"
VERIFY_CONFIRM = "/api/v1/auth/verify-email/confirm/"
RESET = "/api/v1/auth/password/reset/"
RESET_CONFIRM = "/api/v1/auth/password/reset/confirm/"
CHANGE = "/api/v1/auth/password/change/"


def _register(client, email="new@dsat.local", password="StrongPass123!"):
    return client.post(
        REGISTER,
        {"email": email, "password": password, "first_name": "New", "last_name": "User"},
        format="json",
    )


class TestRegister:
    def test_creates_public_user_and_returns_tokens(self, api_client):
        r = _register(api_client)
        assert r.status_code == 201
        assert r.data["success"] is True
        assert r.data["data"]["user"]["role"] == "public"
        assert r.data["data"]["access_token"]
        assert "refresh_token" in api_client.cookies
        assert User.objects.filter(email="new@dsat.local").exists()

    def test_duplicate_email_is_validation_error(self, api_client):
        UserFactory(email="dupe@dsat.local")
        r = _register(api_client, email="DUPE@dsat.local")  # case-insensitive
        assert r.status_code == 400
        assert r.data["error"]["code"] == "VALIDATION_ERROR"
        assert "email" in r.data["error"]["fields"]

    def test_weak_password_rejected(self, api_client):
        r = _register(api_client, password="123")
        assert r.status_code == 400
        assert "password" in r.data["error"]["fields"]


class TestLogin:
    def test_success(self, api_client):
        UserFactory(email="log@dsat.local")
        r = api_client.post(
            LOGIN, {"email": "log@dsat.local", "password": DEFAULT_PASSWORD}, format="json"
        )
        assert r.status_code == 200
        assert r.data["data"]["access_token"]
        assert "refresh_token" in api_client.cookies

    def test_wrong_password(self, api_client):
        UserFactory(email="log2@dsat.local")
        r = api_client.post(LOGIN, {"email": "log2@dsat.local", "password": "nope"}, format="json")
        assert r.status_code == 400


class TestMe:
    def test_requires_auth(self, api_client):
        assert api_client.get(ME).status_code == 401

    def test_returns_current_user(self, api_client):
        r = _register(api_client, email="me@dsat.local")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['data']['access_token']}")
        me = api_client.get(ME)
        assert me.status_code == 200
        assert me.data["data"]["user"]["email"] == "me@dsat.local"

    def test_patch_updates_profile_fields(self, api_client):
        r = _register(api_client, email="patchme@dsat.local")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['data']['access_token']}")
        me = api_client.patch(
            ME,
            {"first_name": "Nodira", "sat_target_score": 1450, "exam_date": "2026-10-03"},
            format="json",
        )
        assert me.status_code == 200
        user = me.data["data"]["user"]
        assert user["first_name"] == "Nodira"
        assert user["sat_target_score"] == 1450
        assert user["exam_date"] == "2026-10-03"

    def test_patch_cannot_change_email_or_role(self, api_client):
        r = _register(api_client, email="immutable@dsat.local")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['data']['access_token']}")
        me = api_client.patch(ME, {"email": "evil@dsat.local", "role": "admin"}, format="json")
        assert me.status_code == 200
        assert me.data["data"]["user"]["email"] == "immutable@dsat.local"
        assert me.data["data"]["user"]["role"] == "public"

    def test_patch_rejects_out_of_range_target_score(self, api_client):
        r = _register(api_client, email="range@dsat.local")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['data']['access_token']}")
        assert api_client.patch(ME, {"sat_target_score": 200}, format="json").status_code == 400


class TestRefresh:
    def test_rotates_and_blacklists_old_token(self, api_client):
        _register(api_client, email="ref@dsat.local")
        old = api_client.cookies["refresh_token"].value

        r = api_client.post(REFRESH)
        assert r.status_code == 200
        assert r.data["data"]["access_token"]
        new = api_client.cookies["refresh_token"].value
        assert new != old  # rotated

        api_client.cookies["refresh_token"] = old  # reuse the old one
        assert api_client.post(REFRESH).status_code == 401  # blacklisted

    def test_without_cookie_is_401(self, api_client):
        assert api_client.post(REFRESH).status_code == 401


class TestLogout:
    def test_blacklists_refresh_token(self, api_client):
        _register(api_client, email="out@dsat.local")
        tok = api_client.cookies["refresh_token"].value
        assert api_client.post(LOGOUT).status_code == 200
        api_client.cookies["refresh_token"] = tok
        assert api_client.post(REFRESH).status_code == 401


class TestEmailVerification:
    def test_confirm_marks_verified_and_token_is_single_use(self, api_client):
        user = UserFactory(email="verify@dsat.local", is_email_verified=False)
        body = {"uid": encode_uid(user), "token": email_verification_token.make_token(user)}

        r = api_client.post(VERIFY_CONFIRM, body, format="json")
        assert r.status_code == 200
        user.refresh_from_db()
        assert user.is_email_verified is True

        # Token self-invalidates once verified.
        assert api_client.post(VERIFY_CONFIRM, body, format="json").status_code == 400

    def test_bad_token_rejected(self, api_client):
        user = UserFactory()
        r = api_client.post(
            VERIFY_CONFIRM, {"uid": encode_uid(user), "token": "bad"}, format="json"
        )
        assert r.status_code == 400


class TestPasswordReset:
    def test_request_is_200_and_does_not_leak(self, api_client):
        UserFactory(email="exists@dsat.local")
        r1 = api_client.post(RESET, {"email": "exists@dsat.local"}, format="json")
        r2 = api_client.post(RESET, {"email": "nobody@dsat.local"}, format="json")
        assert r1.status_code == r2.status_code == 200
        assert r1.data == r2.data  # identical body either way

    def test_confirm_sets_password_and_invalidates_token(self, api_client):
        user = UserFactory(email="reset@dsat.local")
        body = {
            "uid": encode_uid(user),
            "token": default_token_generator.make_token(user),
            "new_password": "BrandNewPass456!",
        }
        assert api_client.post(RESET_CONFIRM, body, format="json").status_code == 200

        # New password works...
        assert (
            api_client.post(
                LOGIN,
                {"email": "reset@dsat.local", "password": "BrandNewPass456!"},
                format="json",
            ).status_code
            == 200
        )
        # ...and the reset token is now dead (password changed).
        assert api_client.post(RESET_CONFIRM, body, format="json").status_code == 400


class TestPasswordChange:
    def test_requires_correct_current_password(self, api_client):
        user = UserFactory(email="chg@dsat.local")
        api_client.force_authenticate(user)

        bad = api_client.post(
            CHANGE,
            {"current_password": "WRONG", "new_password": "FinalPass000!"},
            format="json",
        )
        assert bad.status_code == 400

        ok = api_client.post(
            CHANGE,
            {"current_password": DEFAULT_PASSWORD, "new_password": "FinalPass000!"},
            format="json",
        )
        assert ok.status_code == 200
        user.refresh_from_db()
        assert user.check_password("FinalPass000!")
