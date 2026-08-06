"""
DSAT LMS v2 — Client error intake tests
Domain: Common
Covers: the endpoint accepts a browser crash and logs it, and — since it is an
        unauthenticated write open to the internet — that everything bounding
        the abuse actually bounds it: field truncation, the allowlist, the body
        cap, malformed input, and the per-IP rate limit.
"""

import json
import logging
from unittest import mock

import pytest
from django.db.backends.base.base import BaseDatabaseWrapper
from django.test import Client

URL = "/api/v1/client-errors/"


@pytest.fixture
def client():
    return Client()


@pytest.fixture
def logs(caplog):
    """caplog listens on the ROOT logger, and settings give `apps` its own handler
    with propagate=False — so records never get there. Attach caplog's handler to
    the logger under test instead of asserting on an empty capture."""
    logger = logging.getLogger("apps.client")
    logger.addHandler(caplog.handler)
    caplog.set_level(logging.ERROR, logger="apps.client")
    yield caplog
    logger.removeHandler(caplog.handler)


def post(client, payload, **extra):
    return client.post(URL, data=json.dumps(payload), content_type="application/json", **extra)


def report_of(logs):
    return next(r for r in logs.records if hasattr(r, "client_report")).client_report


class TestItAccepts:
    def test_a_report_is_logged(self, client, logs):
        response = post(
            client,
            {
                "message": "Cannot read properties of undefined",
                "stack": "at TestShell (webpack://…)",
                "url": "https://app.example.com/session/abc",
                "context": {"boundary": "app"},
            },
        )
        assert response.status_code == 204
        assert "Cannot read properties of undefined" in logs.text
        assert report_of(logs)["context"] == {"boundary": "app"}

    def test_no_authentication_is_needed(self, client):
        """The errors most worth seeing happen instead of a working session."""
        assert post(client, {"message": "boom"}).status_code == 204

    def test_it_takes_no_database_connection(self, client):
        """`ATOMIC_REQUESTS` is global, so without `non_atomic_requests` an
        unauthenticated endpoint that stores nothing would still take a
        connection per request — a free way to exhaust the pool, and a report
        that cannot get through when the database is the thing that broke."""
        with mock.patch.object(
            BaseDatabaseWrapper, "ensure_connection", side_effect=OSError("database is gone")
        ):
            assert post(client, {"message": "boom"}).status_code == 204


class TestItBounds:
    def test_long_fields_are_truncated(self, client, logs):
        # Over each field's limit, under the body cap — the two bounds are
        # separate and both have to hold.
        post(client, {"message": "x" * 900, "stack": "y" * 6000})
        report = report_of(logs)
        assert len(report["message"]) == 500
        assert len(report["stack"]) == 4000

    def test_unnamed_fields_are_dropped(self, client, logs):
        """An allowlist, not a sanitizer: a browser can put anything in this body,
        and the surest way not to log a password is never to read the field."""
        post(client, {"message": "boom", "password": "hunter2", "cookies": "session=…"})
        report = report_of(logs)
        assert "hunter2" not in json.dumps(report)
        assert set(report) == {
            "message",
            "stack",
            "digest",
            "url",
            "user_agent",
            "context",
        }

    def test_context_is_capped(self, client, logs):
        post(client, {"message": "boom", "context": {f"k{i}": "v" for i in range(50)}})
        assert len(report_of(logs)["context"]) == 10

    def test_an_oversized_body_is_refused(self, client):
        assert post(client, {"message": "x" * 100_000}).status_code == 413

    @pytest.mark.parametrize("body", [b"not json", b"[]", b'"a string"'])
    def test_malformed_input_is_a_400_not_a_500(self, client, body):
        response = client.post(URL, data=body, content_type="application/json")
        assert response.status_code == 400

    def test_a_report_with_no_message_is_refused(self, client):
        assert post(client, {"stack": "…"}).status_code == 400


class TestItThrottles:
    """Throttling is nulled suite-wide (conftest._disable_throttling); this sets a
    tiny rate on the one scope, via monkeypatch so it cannot leak into the tests
    that run after it."""

    def test_a_flood_gets_429(self, client, monkeypatch):
        """A render loop can throw thousands of times a second. The client caps
        itself per page load — but a client is exactly the thing that cannot be
        trusted to."""
        from django.core.cache import cache
        from rest_framework.throttling import SimpleRateThrottle

        cache.clear()
        monkeypatch.setattr(
            SimpleRateThrottle,
            "THROTTLE_RATES",
            {**SimpleRateThrottle.THROTTLE_RATES, "client_errors": "3/min"},
        )

        codes = [post(client, {"message": f"boom {i}"}).status_code for i in range(5)]
        assert codes[:3] == [204, 204, 204]
        # 429 rather than a silent drop, so a runaway client backs off instead of
        # retrying into the limiter forever.
        assert codes[3:] == [429, 429]
