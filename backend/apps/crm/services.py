"""
DSAT LMS v2 — CRM services
Domain: CRM
Description: Lead stage changes + the atomic lead→student conversion.
"""

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import Lead, LeadActivity
from .tags import TaggedItem

# Entity types that may be tagged → (app_label, model) for the ContentType lookup.
TAGGABLE = {"student": ("identity", "user"), "lead": ("crm", "lead")}


class EntityError(Exception):
    """Raised when an entity_type / entity_id can't be resolved (→ 404)."""


def resolve_entity(entity_type, entity_id):
    """(content_type, object) for a taggable entity, or EntityError. A student must
    be a live student-role user; a lead must be a live lead."""
    from django.contrib.contenttypes.models import ContentType

    from apps.identity.models import User

    if entity_type not in TAGGABLE:
        raise EntityError("unknown_entity")
    app_label, model = TAGGABLE[entity_type]
    if entity_type == "student":
        obj = User.objects.filter(
            pk=entity_id, role=User.Role.STUDENT, deleted_at__isnull=True
        ).first()
    else:  # lead
        obj = Lead.objects.filter(pk=entity_id).first()
    if obj is None:
        raise EntityError("not_found")
    ct = ContentType.objects.get_by_natural_key(app_label, model)
    return ct, obj


def tags_for(entity_type, entity_id):
    """Active Tags assigned to the entity."""
    from .tags import Tag

    ct, obj = resolve_entity(entity_type, entity_id)
    tag_ids = TaggedItem.objects.filter(content_type=ct, object_id=obj.pk).values_list(
        "tag_id", flat=True
    )
    return Tag.objects.filter(id__in=tag_ids)


def assign_tag(tag, entity_type, entity_id):
    """Idempotently tag an entity; reactivates a soft-deleted link if present."""
    ct, obj = resolve_entity(entity_type, entity_id)
    existing = TaggedItem.all_objects.filter(tag=tag, content_type=ct, object_id=obj.pk).first()
    if existing is not None:
        if existing.deleted_at is not None:
            existing.restore()
        return existing
    try:
        with transaction.atomic():
            return TaggedItem.objects.create(tag=tag, content_type=ct, object_id=obj.pk)
    except IntegrityError:
        # A concurrent assign won the partial-unique race — return its row.
        return TaggedItem.all_objects.filter(tag=tag, content_type=ct, object_id=obj.pk).first()


def unassign_tag(tag, entity_type, entity_id):
    ct, obj = resolve_entity(entity_type, entity_id)
    link = TaggedItem.objects.filter(tag=tag, content_type=ct, object_id=obj.pk).first()
    if link is not None:
        link.soft_delete()


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
