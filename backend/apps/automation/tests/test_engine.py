"""
DSAT LMS v2 — Automation engine tests (5.6b)
Domain: Automation
Covers: scheduled sweep acts + is idempotent per day; add_tag / notify /
        change_status actions; event dispatch acts once per subject per day;
        change_status action doesn't re-enter automation; dry-run has no side
        effects; sweep query count is independent of the non-matching cohort size.
"""

import datetime

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.academy.services import get_or_create_student_profile
from apps.academy.tests.factories import ClassEnrollmentFactory
from apps.automation.models import AutomationLog, AutomationRule
from apps.automation.services import run_automation_sweep, run_event_dispatch
from apps.crm.tags import Tag, TaggedItem
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db

D1 = datetime.date(2026, 7, 15)
D2 = datetime.date(2026, 7, 16)


def leaf(field, op, value):
    return {"type": "condition", "field": field, "op": op, "value": value}


def group(op, *children):
    return {"type": "group", "op": op, "children": list(children)}


def matching_student(status="active"):
    """An active-enrolled student whose lifecycle status makes the test rule match."""
    enr = ClassEnrollmentFactory()
    profile = get_or_create_student_profile(enr.student)
    if profile.status != status:
        profile.status = status
        profile.save(update_fields=["status"])
    return enr.student


def make_rule(actions, *, trigger="scheduled_daily", event_key="", conditions=None):
    return AutomationRule.objects.create(
        name="Test rule",
        trigger_type=trigger,
        event_key=event_key,
        conditions=conditions or group("and", leaf("lifecycle_status", "eq", "active")),
        actions=actions,
    )


class TestSweep:
    def test_add_tag_acts_and_is_idempotent(self):
        student = matching_student()
        make_rule([{"type": "add_tag", "params": {"tag": "at-risk"}}])

        summary = run_automation_sweep(run_date=D1)
        assert summary["acted"] == 1
        tag = Tag.objects.get(name="at-risk")
        assert TaggedItem.objects.filter(tag=tag, object_id=student.id).count() == 1
        assert AutomationLog.objects.filter(subject_id=student.id, run_date=D1).count() == 1

        # Same day, second run → no new log, no duplicate tag.
        again = run_automation_sweep(run_date=D1)
        assert again["acted"] == 0
        assert AutomationLog.objects.filter(subject_id=student.id, run_date=D1).count() == 1
        assert TaggedItem.objects.filter(tag=tag, object_id=student.id).count() == 1

    def test_notify_action(self):
        student = matching_student()
        make_rule([{"type": "notify", "params": {"recipient": "student", "message": "Check in!"}}])
        run_automation_sweep(run_date=D1)
        # The admin message is the notification title (codebase convention).
        assert Notification.objects.filter(user=student, title="Check in!").count() == 1

    def test_change_status_action_applies_without_reentrancy(self):
        student = matching_student(status="active")
        # active → frozen is a valid transition.
        make_rule([{"type": "change_status", "params": {"status": "frozen"}}])
        run_automation_sweep(run_date=D1)
        student.student_profile.refresh_from_db()
        assert student.student_profile.status == "frozen"
        # Exactly one log — the status change didn't loop back into automation.
        assert AutomationLog.objects.filter(subject_id=student.id).count() == 1

    def test_change_status_invalid_transition_is_skipped_not_error(self):
        student = matching_student(status="active")
        make_rule([{"type": "change_status", "params": {"status": "active"}}])  # same_status
        run_automation_sweep(run_date=D1)
        log = AutomationLog.objects.get(subject_id=student.id)
        assert log.status == "ok"  # skipped-action, but the run itself is fine
        assert log.actions_taken[0]["status"] == "skipped"

    def test_non_matching_student_not_acted(self):
        matching_student(status="frozen")  # rule wants active → no match
        make_rule([{"type": "add_tag", "params": {"tag": "x"}}])
        summary = run_automation_sweep(run_date=D1)
        assert summary["acted"] == 0
        assert AutomationLog.objects.count() == 0

    def test_no_rules_no_op(self):
        matching_student()
        assert run_automation_sweep(run_date=D1)["rules"] == 0

    def test_disabled_rule_skipped(self):
        matching_student()
        rule = make_rule([{"type": "add_tag", "params": {"tag": "x"}}])
        rule.enabled = False
        rule.save(update_fields=["enabled"])
        assert run_automation_sweep(run_date=D1)["rules"] == 0

    def test_no_homework_does_not_match_completion_rule(self):
        # Review finding: a student with NO assigned homework has completion_pct=0.0
        # (missing-data sentinel) — a 'homework_completion < 50' rule must NOT match.
        matching_student()  # active enrolled, but no homework assigned
        make_rule(
            [{"type": "add_tag", "params": {"tag": "behind"}}],
            conditions=group("and", leaf("homework_completion", "lt", 50)),
        )
        assert run_automation_sweep(run_date=D1)["acted"] == 0

    def test_soft_deleted_student_excluded_from_sweep(self):
        # Review finding: soft-deleting a user does not close their ACTIVE
        # enrollment, so the cohort query must exclude dead accounts (as the event
        # path does) — no actions on a removed student.
        student = matching_student()
        make_rule([{"type": "add_tag", "params": {"tag": "x"}}])
        student.soft_delete()
        summary = run_automation_sweep(run_date=D1)
        assert summary["students"] == 0 and summary["acted"] == 0
        assert AutomationLog.objects.count() == 0


class TestEventDispatch:
    def test_event_rule_acts_once_per_day(self):
        student = matching_student()
        make_rule(
            [{"type": "add_tag", "params": {"tag": "submitted"}}],
            trigger="event",
            event_key="homework_submitted",
        )
        r1 = run_event_dispatch("homework_submitted", student.id, run_date=D1)
        assert r1["acted"] == 1
        # Repeat event same day → idempotent.
        r2 = run_event_dispatch("homework_submitted", student.id, run_date=D1)
        assert r2["acted"] == 0
        assert AutomationLog.objects.filter(subject_id=student.id, run_date=D1).count() == 1

    def test_scheduled_rule_ignored_by_event_dispatch(self):
        student = matching_student()
        make_rule([{"type": "add_tag", "params": {"tag": "x"}}])  # scheduled
        assert run_event_dispatch("homework_submitted", student.id, run_date=D1)["rules"] == 0

    def test_dispatch_for_missing_student(self):
        make_rule(
            [{"type": "add_tag", "params": {"tag": "x"}}],
            trigger="event",
            event_key="homework_submitted",
        )
        import uuid

        r = run_event_dispatch("homework_submitted", uuid.uuid4(), run_date=D1)
        assert r["acted"] == 0


class TestDispatchSeam:
    def test_dispatch_noop_without_event_rule(self):
        from apps.automation.dispatch import dispatch

        student = matching_student()
        make_rule([{"type": "add_tag", "params": {"tag": "x"}}])  # scheduled, not event
        dispatch("homework_submitted", student.id)  # no matching event rule
        assert AutomationLog.objects.count() == 0

    def test_dispatch_fires_event_rule(self):
        # dispatch() enqueues a Celery task; eager mode runs it inline in tests.
        from apps.automation.dispatch import dispatch

        student = matching_student()
        make_rule(
            [{"type": "add_tag", "params": {"tag": "submitted"}}],
            trigger="event",
            event_key="homework_submitted",
        )
        dispatch("homework_submitted", student.id)
        assert AutomationLog.objects.filter(subject_id=student.id).count() == 1
        assert TaggedItem.objects.filter(object_id=student.id).count() == 1


class TestDryRun:
    def test_dry_run_no_side_effects(self):
        from apps.automation.services import dry_run_rule

        student = matching_student()
        rule = make_rule([{"type": "add_tag", "params": {"tag": "x"}}])
        result = dry_run_rule(conditions=rule.conditions, actions=rule.actions)
        assert result["matched_count"] == 1
        assert result["sample"][0]["id"] == str(student.id)
        # Nothing persisted.
        assert AutomationLog.objects.count() == 0
        assert Tag.objects.count() == 0


class TestQueryScaling:
    def test_sweep_query_count_independent_of_nonmatching_cohort(self):
        # One matching student + a few non-matching, then many more non-matching:
        # the sweep's query COUNT must not grow with the non-matching cohort. Use a
        # notify action (constant per-run cost — unlike add_tag, which would create
        # the tag only on the first run and confound the comparison).
        matching_student()
        for _ in range(2):
            ClassEnrollmentFactory()  # enrolled, no active profile → non-matching
        make_rule([{"type": "notify", "params": {"recipient": "student", "message": "hi"}}])

        with CaptureQueriesContext(connection) as ctx_small:
            run_automation_sweep(run_date=D1)
        n_small = len(ctx_small.captured_queries)

        for _ in range(10):
            ClassEnrollmentFactory()
        # Fresh day so the matching student re-acts identically (same work).
        with CaptureQueriesContext(connection) as ctx_big:
            run_automation_sweep(run_date=D2)
        n_big = len(ctx_big.captured_queries)

        assert n_small == n_big, f"query count grew with cohort: {n_small} → {n_big}"
