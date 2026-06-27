"""
DSAT LMS v2 — Identity task tests
Domain: Identity
Covers: email tasks send mail; registration enqueues the verification email
        (which runs inline under the eager fixture).
"""

import pytest

from apps.identity.tasks import send_password_reset_email, send_verification_email
from apps.identity.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def test_verification_email_task_sends(mailoutbox):
    user = UserFactory(email="vt@dsat.local")
    send_verification_email(user.id)
    assert len(mailoutbox) == 1
    assert "vt@dsat.local" in mailoutbox[0].to


def test_reset_email_task_sends(mailoutbox):
    user = UserFactory(email="rt@dsat.local")
    send_password_reset_email(user.id)
    assert len(mailoutbox) == 1
    assert "rt@dsat.local" in mailoutbox[0].to


def test_register_enqueues_verification_email(api_client, mailoutbox):
    r = api_client.post(
        "/api/v1/auth/register/",
        {
            "email": "reg@dsat.local",
            "password": "StrongPass123!",
            "first_name": "Reg",
            "last_name": "User",
        },
        format="json",
    )
    assert r.status_code == 201
    assert len(mailoutbox) == 1  # eager .delay() ran the task inline


def test_missing_user_id_is_noop(db, mailoutbox):
    import uuid

    send_verification_email(uuid.uuid4())  # no such user
    assert len(mailoutbox) == 0
