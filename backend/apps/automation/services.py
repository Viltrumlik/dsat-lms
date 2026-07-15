"""
DSAT LMS v2 — Automation services
Domain: Automation
Description: The engine. Builds a per-student evaluation context in a fixed number
    of grouped queries (N-independent, reusing analytics._batch_signals), applies
    rules with per-(rule,subject,day) idempotency, and exposes the scheduled sweep,
    the event dispatch, and the side-effect-free dry-run.

Rule-storm guards: (1) AutomationLog unique (rule,subject,day) → a rule acts at
most once per subject per day; (2) mutating actions call domain services directly
(never re-dispatch events — see actions.py); (3) a global per-run action budget.
"""

from django.utils import timezone

from .actions import execute_action
from .conditions import evaluate

# Hard ceiling on actions executed in a single sweep/dispatch — a runaway backstop.
MAX_ACTIONS_PER_RUN = 1000


def _subject_label(subject):
    return (getattr(subject, "full_name", "") or subject.email or "")[:255]


def build_contexts(user_ids):
    """{user_id: evaluation-context} for a cohort. Context = analytics signals +
    composed risk level + lifecycle status. Fixed query count regardless of N
    (one _batch_signals pass + one StudentProfile query)."""
    from apps.academy.models import StudentProfile
    from apps.analytics.services import _batch_signals, _compose_risk

    user_ids = list(user_ids)
    if not user_ids:
        return {}
    signals = _batch_signals(user_ids)
    statuses = dict(
        StudentProfile.objects.filter(user_id__in=user_ids).values_list("user_id", "status")
    )
    out = {}
    for uid in user_ids:
        sig = signals.get(uid, {})
        risk = _compose_risk(**sig) if sig else {"level": "green"}
        out[uid] = {
            "signals": sig,
            "risk_level": risk["level"],
            "lifecycle_status": statuses.get(uid),
        }
    return out


def _apply_rule(rule, subject, ctx, run_date, *, budget):
    """Evaluate one rule against one subject; if it matches AND has not already
    fired for this subject today, run its actions. Returns a small summary dict."""
    from .models import AutomationLog

    if not evaluate(rule.conditions, ctx):
        return {"matched": False, "acted": False}

    # Idempotency key: the first matching evaluation of the day creates the row and
    # runs the actions; any later evaluation (repeat event, re-run) is a no-op.
    log, created = AutomationLog.objects.get_or_create(
        rule=rule,
        subject_type=rule.subject_type,
        subject_id=subject.id,
        run_date=run_date,
        defaults={
            "matched": True,
            "subject_label": _subject_label(subject),
            "status": AutomationLog.Status.OK,
        },
    )
    if not created:
        return {"matched": True, "acted": False, "duplicate": True}

    results = []
    status = AutomationLog.Status.OK
    for action in rule.actions:
        if budget["remaining"] <= 0:
            results.append({"type": action.get("type"), "status": "skipped", "detail": "budget"})
            status = AutomationLog.Status.SKIPPED
            continue
        res = execute_action(action, subject, rule=rule)
        budget["remaining"] -= 1
        results.append(res)
        if res.get("status") == "error":
            status = AutomationLog.Status.ERROR
    log.actions_taken = results
    log.status = status
    log.save(update_fields=["actions_taken", "status", "updated_at"])
    return {"matched": True, "acted": True}


def _active_student_ids():
    """Live, active, student-role users with an ACTIVE class enrollment. A plain
    ACTIVE-enrollment query leaks soft-deleted / deactivated accounts (soft-deleting
    a user does NOT close their enrollments, and User uses a plain manager), so we
    intersect with live student users — matching run_event_dispatch's filter."""
    from apps.academy.models import ClassEnrollment
    from apps.identity.models import User

    enrolled = (
        ClassEnrollment.objects.filter(status=ClassEnrollment.Status.ACTIVE)
        .values_list("student_id", flat=True)
        .distinct()
    )
    return list(
        User.objects.filter(
            id__in=enrolled,
            role=User.Role.STUDENT,
            is_active=True,
            deleted_at__isnull=True,
        ).values_list("id", flat=True)
    )


def run_automation_sweep(run_date=None):
    """Daily scheduled pass over the active-enrolled cohort. Reads every student's
    context once, then applies each enabled scheduled rule. Idempotent per day."""
    from apps.identity.models import User

    from .models import AutomationRule

    now = timezone.now()
    run_date = run_date or timezone.localdate()
    rules = list(
        AutomationRule.objects.filter(
            enabled=True, trigger_type=AutomationRule.Trigger.SCHEDULED_DAILY
        )
    )
    if not rules:
        return {"rules": 0, "students": 0, "matched": 0, "acted": 0}

    student_ids = _active_student_ids()
    if not student_ids:
        return {"rules": len(rules), "students": 0, "matched": 0, "acted": 0}

    contexts = build_contexts(student_ids)
    users = User.objects.in_bulk(student_ids)
    budget = {"remaining": MAX_ACTIONS_PER_RUN}
    matched = acted = 0
    for rule in rules:
        for sid in student_ids:
            subject = users.get(sid)
            if subject is None:
                continue
            r = _apply_rule(rule, subject, contexts[sid], run_date, budget=budget)
            matched += 1 if r["matched"] else 0
            acted += 1 if r.get("acted") else 0
        rule.last_run_at = now
        rule.save(update_fields=["last_run_at", "updated_at"])
    return {
        "rules": len(rules),
        "students": len(student_ids),
        "matched": matched,
        "acted": acted,
    }


def run_event_dispatch(event_key, subject_id, run_date=None):
    """Fire enabled EVENT rules for `event_key` against one student subject. Called
    (via a Celery task) from an explicit dispatch seam."""
    from apps.identity.models import User

    from .models import AutomationRule

    run_date = run_date or timezone.localdate()
    rules = list(
        AutomationRule.objects.filter(
            enabled=True, trigger_type=AutomationRule.Trigger.EVENT, event_key=event_key
        )
    )
    if not rules:
        return {"rules": 0, "acted": 0}

    subject = User.objects.filter(
        pk=subject_id, role=User.Role.STUDENT, is_active=True, deleted_at__isnull=True
    ).first()
    if subject is None:
        return {"rules": len(rules), "acted": 0, "detail": "subject_gone"}

    ctx = build_contexts([subject.id]).get(subject.id)
    budget = {"remaining": MAX_ACTIONS_PER_RUN}
    acted = 0
    for rule in rules:
        r = _apply_rule(rule, subject, ctx, run_date, budget=budget)
        acted += 1 if r.get("acted") else 0
    return {"rules": len(rules), "acted": acted}


def dry_run_rule(*, conditions, actions, sample=5):
    """Evaluate a CANDIDATE rule against the active cohort with NO side effects —
    no AutomationLog rows, no actions executed. `conditions`/`actions` are already
    validated by the caller. Returns match count + a sample of matched subjects +
    the actions that would run."""
    from apps.identity.models import User

    student_ids = _active_student_ids()
    contexts = build_contexts(student_ids)
    users = User.objects.in_bulk(student_ids)
    matched_ids = [sid for sid in student_ids if evaluate(conditions, contexts[sid])]
    return {
        "cohort_size": len(student_ids),
        "matched_count": len(matched_ids),
        "sample": [
            {"id": str(sid), "label": _subject_label(users[sid])}
            for sid in matched_ids[:sample]
            if sid in users
        ],
        "actions": actions,
    }
