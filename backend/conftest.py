"""
DSAT LMS v2 — Shared pytest fixtures
"""

import pytest
from rest_framework.test import APIClient

from apps.identity.tests.factories import UserFactory


@pytest.fixture(autouse=True)
def _fast_passwords(settings):
    """Fast (insecure) hashing in tests — factories create many users."""
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@pytest.fixture(autouse=True)
def _celery_eager():
    """Run Celery tasks inline (no broker) for the whole test suite."""
    from config.celery import app

    app.conf.task_always_eager = True
    app.conf.task_eager_propagates = True


@pytest.fixture(autouse=True)
def _disable_throttling(monkeypatch):
    """Disable DRF throttling in tests. The suite hammers login/register from one
    IP and would trip the real rates. DRF binds throttle classes + rates at import
    (a `settings` override can't reach them), so null the shared rate map instead —
    a None rate disables that scope. Tests that assert throttling set their own
    rate (see TestAuthThrottle)."""
    from rest_framework.throttling import SimpleRateThrottle

    monkeypatch.setattr(
        SimpleRateThrottle,
        "THROTTLE_RATES",
        {scope: None for scope in SimpleRateThrottle.THROTTLE_RATES},
    )


@pytest.fixture
def api_client():
    """Unauthenticated DRF API client (tracks cookies across requests)."""
    return APIClient()


@pytest.fixture
def auth_client(db):
    """API client force-authenticated as a fresh public user (exposes .user)."""
    user = UserFactory()
    client = APIClient()
    client.force_authenticate(user=user)
    client.user = user
    return client
