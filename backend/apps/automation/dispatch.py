"""
DSAT LMS v2 — Automation event dispatch seam
Domain: Automation
Description: `dispatch(event_key, subject_id)` — the single public entry point that
    domain services call at an event seam (e.g. homework submit). Best-effort and
    cheap: it does one EXISTS check and returns immediately when no enabled event
    rule listens for the key, otherwise it enqueues a Celery task so the request
    path stays fast and the rule run happens off the transaction.
"""

import logging

logger = logging.getLogger(__name__)


def dispatch(event_key, subject_id):
    """Fire event-triggered automation for a subject. Never raises — an automation
    failure must not break the caller's action."""
    try:
        from .models import AutomationRule

        has_rule = AutomationRule.objects.filter(
            enabled=True,
            trigger_type=AutomationRule.Trigger.EVENT,
            event_key=event_key,
        ).exists()
        if not has_rule:
            return
        from .tasks import dispatch_automation_event

        dispatch_automation_event.delay(event_key, str(subject_id))
    except Exception:  # pragma: no cover — dispatch is best-effort
        logger.exception("automation.dispatch failed for event=%s", event_key)
