"""
DSAT LMS v2 — CRM services
Domain: CRM
Description: Lead stage changes + the atomic lead→student conversion.
"""

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import Lead, LeadActivity


class ConversionError(Exception):
    """Raised by convert_lead with a machine code (email_required | email_exists |
    already_converted) the view maps to a 4xx."""

    def __init__(self, code):
        self.code = code
        super().__init__(code)


def _split_name(full_name):
    parts = (full_name or "").strip().split(None, 1)
    if not parts:
        return "", ""
    return (parts[0], parts[1] if len(parts) > 1 else "")


def log_activity(lead, *, kind, body="", author=None):
    return LeadActivity.objects.create(lead=lead, kind=kind, body=body, author=author)


def set_lead_stage(lead, new_stage, *, by=None):
    """Move a lead to a new pipeline stage (free-form) and log a stage_change
    activity. No-op if the stage is unchanged."""
    if new_stage == lead.stage:
        return lead
    old = lead.stage
    lead.stage = new_stage
    lead.save(update_fields=["stage", "updated_at"])
    log_activity(
        lead,
        kind=LeadActivity.Kind.STAGE_CHANGE,
        body=f"{old} → {new_stage}",
        author=by,
    )
    return lead


@transaction.atomic
def convert_lead(lead, *, by=None):
    """Atomically convert a lead into a student account + profile.

    Guards: the lead must have an email and not already be converted; a LIVE user
    with that email must not exist (dedupe → ConversionError('email_exists'), which
    the view returns as 409). Sets stage=registered, links converted_user, stamps
    converted_at, and logs a stage_change activity. Returns the new User.
    """
    from apps.academy.services import get_or_create_student_profile
    from apps.identity.models import User

    if lead.converted_user_id is not None:
        raise ConversionError("already_converted")
    email = (lead.email or "").strip().lower()
    if not email:
        raise ConversionError("email_required")
    if User.objects.filter(email__iexact=email, deleted_at__isnull=True).exists():
        raise ConversionError("email_exists")

    first_name, last_name = _split_name(lead.name)
    try:
        # password=None → unusable password; the student sets one via password-reset.
        user = User.objects.create_user(
            email=email,
            password=None,
            first_name=first_name,
            last_name=last_name,
            role=User.Role.STUDENT,
        )
    except IntegrityError as exc:  # unique-email race between the check and create
        raise ConversionError("email_exists") from exc

    get_or_create_student_profile(user)

    lead.converted_user = user
    lead.converted_at = timezone.now()
    lead.stage = Lead.Stage.REGISTERED
    lead.save(update_fields=["converted_user", "converted_at", "stage", "updated_at"])
    log_activity(
        lead,
        kind=LeadActivity.Kind.STAGE_CHANGE,
        body="converted → registered",
        author=by,
    )
    return user
