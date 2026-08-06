"""
DSAT LMS v2 — Health endpoint tests
Domain: Common
Covers: the distinction that matters — liveness never touches a dependency, so
        a database outage must not make every container look dead and get
        restarted; readiness does, and reports 503 so the load balancer takes
        the instance out of the pool instead.
"""

from unittest import mock

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db


class TestLiveness:
    def test_it_answers_without_authentication(self, api_client):
        response = api_client.get("/healthz")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_it_stays_up_when_the_database_is_down(self, api_client):
        """The whole point. Liveness answers for the PROCESS, not the stack —
        restarting every web container during a database blip turns an outage
        into a longer one."""
        with mock.patch("common.health.connection") as conn:
            conn.cursor.side_effect = OSError("database is gone")
            assert api_client.get("/healthz").status_code == 200

    def test_it_says_nothing_useful_to_a_stranger(self, api_client):
        # An unauthenticated endpoint that reports versions or hostnames is
        # reconnaissance served on request.
        assert api_client.get("/healthz").json() == {"status": "ok"}


class TestReadiness:
    def test_it_reports_each_dependency(self, api_client):
        body = api_client.get("/readyz").json()
        assert body["status"] == "ok"
        assert body["checks"] == {"database": "ok", "cache": "ok"}

    def test_a_dead_database_is_a_503(self, api_client):
        with mock.patch("common.health.connection") as conn:
            conn.cursor.side_effect = OSError("database is gone")
            response = api_client.get("/readyz")
        assert response.status_code == 503
        assert response.json()["checks"]["database"] == "error"

    def test_a_cache_that_swallows_writes_is_not_ready(self, api_client):
        """`ping` would call this healthy. A round-trip does not."""
        with mock.patch("common.health.cache") as cache:
            cache.get.return_value = None
            response = api_client.get("/readyz")
        assert response.status_code == 503
        assert response.json()["checks"]["cache"] == "error"

    def test_the_urls_are_unversioned(self):
        # A load balancer should not have to know the API version to ask
        # whether the app is up.
        assert reverse("healthz") == "/healthz"
        assert reverse("readyz") == "/readyz"
