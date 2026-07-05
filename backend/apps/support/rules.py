"""
DSAT LMS v2 — Support trigger rules (S4)
Domain: Support
Description: The hardcoded RULE_REGISTRY that turns a student's analytics signals
    into support recommendations. Thresholds mirror analytics.RISK_* (locked
    Phase 4 decision) so the trigger and the risk badge stay consistent; the only
    support-specific constant is SUPPORT_CATEGORY_ACCURACY_RED (per-category, ≠ the
    overall RISK_ACCURACY_RED). Each rule yields at most ONE recommendation dict
    per student (dedupe in the sweep is keyed on (student, rule_key)); severity
    maps the RISK_* red/yellow bands to critical/warning.
"""

from apps.analytics.services import (
    RISK_HW_COMPLETION_RED,
    RISK_HW_COMPLETION_YELLOW,
    RISK_INACTIVE_RED_DAYS,
    RISK_INACTIVE_YELLOW_DAYS,
    RISK_TREND_DOWN_RED,
    RISK_TREND_DOWN_YELLOW,
)

from .enums import RecSeverity

# Per-category accuracy floor (%) below which a topic-level nudge fires. Distinct
# from the overall RISK_ACCURACY_RED (50) — a weak topic is flagged earlier.
SUPPORT_CATEGORY_ACCURACY_RED = 55
# A category this far below the floor escalates the nudge to critical.
_CATEGORY_ACCURACY_CRITICAL = 40


def _rule_category_accuracy_low(signals, weak):
    """Weakest category below the accuracy floor → book help in that topic."""
    candidates = [w for w in weak if w["accuracy_pct"] < SUPPORT_CATEGORY_ACCURACY_RED]
    if not candidates:
        return None
    worst = min(candidates, key=lambda w: w["accuracy_pct"])
    severity = (
        RecSeverity.CRITICAL
        if worst["accuracy_pct"] < _CATEGORY_ACCURACY_CRITICAL
        else RecSeverity.WARNING
    )
    return {
        "rule_key": "category_accuracy_low",
        "severity": severity,
        "subject": worst["module"],  # 'math' | 'reading_writing' — a valid Subject
        "topic": worst["category_name"],
        "evidence": {
            "category_id": worst["category_id"],
            "accuracy_pct": worst["accuracy_pct"],
            "total_answered": worst["total_answered"],
        },
    }


def _rule_score_trend_declining(signals, weak):
    """Practice-accuracy trend over all ExamResults is falling."""
    delta = signals.get("delta_pct")
    if delta is None or delta > RISK_TREND_DOWN_YELLOW:
        return None
    severity = RecSeverity.CRITICAL if delta <= RISK_TREND_DOWN_RED else RecSeverity.WARNING
    return {
        "rule_key": "score_trend_declining",
        "severity": severity,
        "subject": "",
        "topic": "",
        "evidence": {"delta_pct": delta},
    }


def _rule_inactive_days(signals, weak):
    """No practice/homework/exam activity for a while (skips never-active students,
    whose days_inactive is None)."""
    days = signals.get("days_inactive")
    if days is None or days < RISK_INACTIVE_YELLOW_DAYS:
        return None
    severity = RecSeverity.CRITICAL if days >= RISK_INACTIVE_RED_DAYS else RecSeverity.WARNING
    return {
        "rule_key": "inactive_days",
        "severity": severity,
        "subject": "",
        "topic": "",
        "evidence": {"days_inactive": days},
    }


def _rule_homework_completion_low(signals, weak):
    """Homework completion is low (only for students who actually have homework)."""
    if not signals.get("has_homework"):
        return None
    pct = signals.get("completion_pct", 0.0)
    if pct >= RISK_HW_COMPLETION_YELLOW:
        return None
    severity = RecSeverity.CRITICAL if pct < RISK_HW_COMPLETION_RED else RecSeverity.WARNING
    return {
        "rule_key": "homework_completion_low",
        "severity": severity,
        "subject": "",
        "topic": "",
        "evidence": {"completion_pct": pct},
    }


RULE_REGISTRY = [
    _rule_category_accuracy_low,
    _rule_score_trend_declining,
    _rule_inactive_days,
    _rule_homework_completion_low,
]


def evaluate_rules(signals, weak):
    """Run every rule for one student's signals + weak topics → list of rec dicts
    (at most one per rule)."""
    recs = []
    for rule in RULE_REGISTRY:
        result = rule(signals, weak)
        if result is not None:
            recs.append(result)
    return recs
