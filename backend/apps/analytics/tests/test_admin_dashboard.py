"""
DSAT LMS v2 — Admin dashboard tests (Phase 5.1)
Domain: Analytics (admin)
Covers: permission gate, overview payload shape, trend-window clamp, PlatformOpsDaily
        rollup idempotency + registration counting, empty-platform nulls, and rebuild.
"""

import datetime as dt

import pytest
from rest_framework.test import APIClient

from apps.analytics.admin_ops import build_platform_ops_daily
from apps.analytics.models import PlatformOpsDaily
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

DASH = "/api/v1/admin/dashboard/"
REBUILD = "/api/v1/admin/dashboard/rebuild/"


def admin_client():
    client = APIClient()
    client.force_authenticate(AdminUserFactory())
    return client


class TestPermissions:
    def test_unauthenticated_401(self, api_client):
        assert api_client.get(DASH).status_code == 401

    def test_public_forbidden(self, auth_client):
        assert auth_client.get(DASH).status_code == 403

    def test_teacher_forbidden(self):
        client = APIClient()
        client.force_authenticate(UserFactory(role="teacher"))
        assert client.get(DASH).status_code == 403


class TestOverview:
    def test_payload_shape(self):
        r = admin_client().get(DASH)
        assert r.status_code == 200
        data = r.data["data"]
        assert set(data.keys()) == {"kpis", "today", "alerts", "trends", "recent_activity"}
        assert set(data["kpis"].keys()) == {
            "total_students",
            "total_teachers",
            "active_classes",
            "upcoming_exams",
            "completion_rate",
            "satisfaction",
        }

    def test_empty_platform_nulls(self):
        # No homework, no ratings → completion_rate + satisfaction are null (not 0).
        data = admin_client().get(DASH).data["data"]
        assert data["kpis"]["completion_rate"] is None
        assert data["kpis"]["satisfaction"] is None
        assert data["alerts"] == []

    def test_counts_active_staff(self):
        UserFactory(role="student")
        UserFactory(role="teacher")
        data = admin_client().get(DASH).data["data"]
        assert data["kpis"]["total_students"] >= 1
        assert data["kpis"]["total_teachers"] >= 1

    def test_trend_window_default_and_clamp(self):
        assert len(admin_client().get(DASH).data["data"]["trends"]) == 30
        assert len(admin_client().get(DASH + "?days=7").data["data"]["trends"]) == 7
        # Clamp to the 1..90 range.
        assert len(admin_client().get(DASH + "?days=9999").data["data"]["trends"]) == 90
        assert len(admin_client().get(DASH + "?days=0").data["data"]["trends"]) == 1


class TestRollup:
    def test_build_is_idempotent(self):
        today = dt.date(2026, 1, 15)
        build_platform_ops_daily(today)
        build_platform_ops_daily(today)
        assert PlatformOpsDaily.objects.filter(date=today).count() == 1

    def test_rebuild_endpoint(self):
        r = admin_client().post(REBUILD)
        assert r.status_code == 200
        assert "kpis" in r.data["data"]
        # rollup_recent writes today + a trailing window.
        assert PlatformOpsDaily.objects.exists()
