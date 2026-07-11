"""
DSAT LMS v2 — Audit services
Domain: Audit
Description: record_activity() — the single seam write views call to append an
    ActivityLog row. Explicit calls (not signals) keep recording testable and
    stop fixtures/imports/migrations from firing phantom log rows. Best-effort:
    an audit failure must never break the user's action.
"""

import logging
import uuid as uuidlib

from .models import ActivityLog

logger = logging.getLogger(__name__)


def _client_ip(request):
    if request is None:
        return None
    # REMOTE_ADDR only — we do not trust client-supplied forwarding headers here.
    return request.META.get("REMOTE_ADDR") or None


def _target_bits(target, target_label):
    """(target_type, target_id, target_label) snapshotted from a model instance."""
    if target is None:
        return "", None, (target_label or "")[:255]
    meta = target._meta
    ttype = f"{meta.app_label}.{meta.object_name}"
    raw_id = getattr(target, "pk", None)
    try:
        tid = uuidlib.UUID(str(raw_id)) if raw_id is not None else None
    except (ValueError, TypeError, AttributeError):
        tid = None
    label = (target_label if target_label is not None else str(target))[:255]
    return ttype, tid, label


def record_activity(
    *, actor, action, target=None, summary="", target_label=None, request=None, **metadata
):
    """Append one audit row. Returns the row (or None if logging failed)."""
    try:
        ttype, tid, label = _target_bits(target, target_label)
        return ActivityLog.objects.create(
            actor=actor if getattr(actor, "is_authenticated", False) else None,
            actor_role=(getattr(actor, "role", "") or ""),
            action=action,
            target_type=ttype,
            target_id=tid,
            target_label=label,
            summary=(summary or "")[:255],
            metadata=metadata or {},
            ip=_client_ip(request),
            user_agent=(request.META.get("HTTP_USER_AGENT", "")[:255] if request else ""),
        )
    except Exception:  # pragma: no cover — audit must never break the request
        logger.exception("record_activity failed for action=%s", action)
        return None
