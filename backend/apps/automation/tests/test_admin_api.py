"""
DSAT LMS v2 — Automation admin API tests (5.6b)
Domain: Automation
Covers: IsAdmin gate; catalog shape; rule CRUD; DSL/action validation → 400;
        event rule requires a valid event_key; dry-run + sweep + logs endpoints.
"""

import pytest
from rest_framework.test import APIClient

from apps.automation.models import AutomationRule
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/automation/"


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def leaf(field, op, value):
    return {"type": "condition", "field": field, "op": op, "value": value}


def group(op, *children):
    return {"type": "group", "op": op, "children": list(children)}


VALID_RULE = {
    "name": "Nudge disengaged",
    "trigger_type": "scheduled_daily",
    "conditions": {
        "type": "group",
        "op": "and",
        "children": [{"type": "condition", "field": "days_inactive", "op": "gte", "value": 7}],
    },
    "actions": [{"type": "notify", "params": {"recipient": "student", "message": "We miss you!"}}],
}


class TestGate:
    def test_non_admin_forbidden(self):
        for role in ("teacher", "academic_manager", "receptionist", "student"):
            assert client_for(UserFactory(role=role)).get(f"{BASE}rules/").status_code == 403
            assert client_for(UserFactory(role=role)).get(f"{BASE}catalog/").status_code == 403

    def test_admin_ok(self):
        assert client_for(AdminUserFactory()).get(f"{BASE}rules/").status_code == 200


class TestCatalog:
    def test_catalog_shape(self):
        body = client_for(AdminUserFactory()).get(f"{BASE}catalog/").data["data"]
        assert {"triggers", "events", "fields", "operators", "actions", "limits"} <= set(body)
        field_keys = {f["key"] for f in body["fields"]}
        assert "homework_completion" in field_keys and "risk_level" in field_keys
        assert body["limits"]["max_depth"] >= 1


class TestCrud:
    def test_create_valid(self):
        r = client_for(AdminUserFactory()).post(f"{BASE}rules/", VALID_RULE, format="json")
        assert r.status_code == 201, r.data
        assert r.data["data"]["name"] == "Nudge disengaged"
        assert AutomationRule.objects.count() == 1

    def test_create_rejects_unknown_field(self):
        payload = {**VALID_RULE, "conditions": group("and", leaf("__import__", "eq", 1))}
        r = client_for(AdminUserFactory()).post(f"{BASE}rules/", payload, format="json")
        assert r.status_code == 400

    def test_create_rejects_unknown_action(self):
        payload = {**VALID_RULE, "actions": [{"type": "delete_everything", "params": {}}]}
        r = client_for(AdminUserFactory()).post(f"{BASE}rules/", payload, format="json")
        assert r.status_code == 400

    def test_event_rule_requires_valid_event_key(self):
        payload = {**VALID_RULE, "trigger_type": "event", "event_key": "nonexistent"}
        r = client_for(AdminUserFactory()).post(f"{BASE}rules/", payload, format="json")
        assert r.status_code == 400

    def test_event_rule_ok(self):
        payload = {**VALID_RULE, "trigger_type": "event", "event_key": "homework_submitted"}
        r = client_for(AdminUserFactory()).post(f"{BASE}rules/", payload, format="json")
        assert r.status_code == 201 and r.data["data"]["event_key"] == "homework_submitted"

    def test_list_and_detail(self):
        c = client_for(AdminUserFactory())
        rid = c.post(f"{BASE}rules/", VALID_RULE, format="json").data["data"]["id"]
        assert len(c.get(f"{BASE}rules/").data["data"]) == 1
        assert c.get(f"{BASE}rules/{rid}/").data["data"]["id"] == rid

    def test_patch_disable(self):
        c = client_for(AdminUserFactory())
        rid = c.post(f"{BASE}rules/", VALID_RULE, format="json").data["data"]["id"]
        r = c.patch(f"{BASE}rules/{rid}/", {"enabled": False}, format="json")
        assert r.status_code == 200 and r.data["data"]["enabled"] is False

    def test_soft_delete(self):
        c = client_for(AdminUserFactory())
        rid = c.post(f"{BASE}rules/", VALID_RULE, format="json").data["data"]["id"]
        assert c.delete(f"{BASE}rules/{rid}/").status_code == 204
        assert c.get(f"{BASE}rules/").data["data"] == []
        assert AutomationRule.all_objects.get(id=rid).deleted_at is not None


class TestActions:
    def test_dry_run_endpoint(self):
        c = client_for(AdminUserFactory())
        rid = c.post(f"{BASE}rules/", VALID_RULE, format="json").data["data"]["id"]
        r = c.post(f"{BASE}rules/{rid}/test/", {}, format="json")
        assert r.status_code == 200
        assert set(r.data["data"]) >= {"cohort_size", "matched_count", "sample", "actions"}

    def test_run_sweep_endpoint(self):
        c = client_for(AdminUserFactory())
        c.post(f"{BASE}rules/", VALID_RULE, format="json")
        r = c.post(f"{BASE}run/", {}, format="json")
        assert r.status_code == 200 and "acted" in r.data["data"]

    def test_logs_endpoint(self):
        assert client_for(AdminUserFactory()).get(f"{BASE}logs/").status_code == 200
