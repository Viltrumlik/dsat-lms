"""
DSAT LMS v2 — Automation actions
Domain: Automation
Description: Validation + execution of the whitelisted action list. `clean_actions`
    rejects anything outside catalog.ACTIONS (checked when a rule is saved);
    `execute_action` runs one action against a subject and returns a small result
    dict for the AutomationLog.

Rule-storm safety: mutating actions (change_status) call the domain service
DIRECTLY, never a wrapper that re-dispatches automation events — so an automation
run can never trigger another automation run synchronously.
"""

import logging

from .catalog import ACTIONS

logger = logging.getLogger(__name__)


class ActionValidationError(ValueError):
    """A malformed / disallowed action (serializer maps this to 400)."""


def clean_actions(actions):
    """Validate + normalize the action list. Returns the cleaned list or raises
    ActionValidationError. Empty list is allowed (a rule that only logs matches)."""
    if not isinstance(actions, list):
        raise ActionValidationError("Actions must be a list.")
    cleaned = []
    for i, action in enumerate(actions):
        if not isinstance(action, dict):
            raise ActionValidationError(f"actions[{i}] must be an object.")
        atype = action.get("type")
        spec = ACTIONS.get(atype)
        if spec is None:
            raise ActionValidationError(f"actions[{i}]: unknown action type {atype!r}.")
        params = action.get("params") or {}
        if not isinstance(params, dict):
            raise ActionValidationError(f"actions[{i}]: params must be an object.")
        extra = set(action) - {"type", "params"}
        if extra:
            raise ActionValidationError(f"actions[{i}]: unexpected keys {sorted(extra)}.")
        clean_params = {}
        for pkey, pspec in spec["params"].items():
            val = params.get(pkey)
            if val in (None, ""):
                if pspec["required"]:
                    raise ActionValidationError(f"actions[{i}]: '{pkey}' is required.")
                continue
            if pspec["kind"] == "enum" and val not in pspec["choices"]:
                raise ActionValidationError(
                    f"actions[{i}]: '{pkey}' must be one of {pspec['choices']}."
                )
            if pspec["kind"] in ("string", "text") and not isinstance(val, str):
                raise ActionValidationError(f"actions[{i}]: '{pkey}' must be a string.")
            clean_params[pkey] = val
        cleaned.append({"type": atype, "params": clean_params})
    return cleaned


# ── Execution ─────────────────────────────────────────────────────────────────


def _do_notify(subject, params, *, rule):
    from apps.notifications.models import Notification
    from apps.notifications.services import notify

    recipient = params.get("recipient", "student")
    target = subject
    if recipient == "mentor":
        from apps.academy.services import get_or_create_student_profile

        profile = get_or_create_student_profile(subject)
        target = profile.mentor
        if target is None:
            return {"status": "skipped", "detail": "no_mentor"}
    message = params.get("message", "")
    # The admin-authored message is the notification title (matches the codebase
    # convention where the human sentence is the title, e.g. support recommendations).
    notify(
        target,
        Notification.Type.SYSTEM,
        message,
        data={"automation_rule": str(rule.id), "url": "/dashboard"},
    )
    return {"status": "ok"}


def _do_add_tag(subject, params, *, rule):
    from django.db import IntegrityError, transaction

    from apps.crm.services import assign_tag
    from apps.crm.tags import Tag

    name = (params.get("tag") or "").strip()
    if not name:
        return {"status": "skipped", "detail": "empty_tag"}
    tag = Tag.all_objects.filter(name__iexact=name).first()
    if tag is not None and tag.deleted_at is not None:
        tag.restore()
    elif tag is None:
        try:
            with transaction.atomic():
                tag = Tag.objects.create(name=name)
        except IntegrityError:
            # A concurrent run won the partial-unique name race — reuse its row.
            tag = Tag.all_objects.filter(name__iexact=name).first()
            if tag is not None and tag.deleted_at is not None:
                tag.restore()
    assign_tag(tag, "student", subject.id)
    return {"status": "ok", "detail": name}


def _do_change_status(subject, params, *, rule):
    from apps.academy.services import change_student_status, get_or_create_student_profile

    profile = get_or_create_student_profile(subject)
    new_status = params.get("status")
    try:
        # Calls the domain service DIRECTLY — never re-dispatches automation events.
        change_student_status(profile, new_status, by=None)
    except ValueError as exc:
        # e.g. same_status / invalid_transition — a benign no-op, not an error.
        return {"status": "skipped", "detail": str(exc)}
    return {"status": "ok", "detail": new_status}


_EXECUTORS = {
    "notify": _do_notify,
    "add_tag": _do_add_tag,
    "change_status": _do_change_status,
}


def execute_action(action, subject, *, rule):
    """Run one cleaned action against a subject. Best-effort: an executor error is
    captured into the result (status='error'), never raised — so one bad action
    can't abort the rest of the run."""
    atype = action.get("type")
    executor = _EXECUTORS.get(atype)
    if executor is None:
        return {"type": atype, "status": "error", "detail": "unknown_action"}
    try:
        result = executor(subject, action.get("params", {}), rule=rule)
    except Exception as exc:  # pragma: no cover — defensive
        logger.exception("automation action %s failed for rule %s", atype, rule.id)
        return {"type": atype, "status": "error", "detail": str(exc)[:200]}
    return {"type": atype, **result}
