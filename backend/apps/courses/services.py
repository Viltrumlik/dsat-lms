"""
DSAT LMS v2 — Courses services
Domain: Courses
Description: Slug generation, position assignment, and reorder-as-permutation
    helpers (active rows only, soft-delete-aware). Mirrors the shift-by-offset
    reorder in assessments/views_admin.py but scoped to active rows.
"""

from django.db import transaction
from django.db.models import F, Max
from django.utils.text import slugify

# Positions temporarily shift into this band during a reorder so the swap never
# collides with the (parent, position) partial-unique constraint mid-update.
_REORDER_OFFSET = 100000


def unique_course_slug(title, *, exclude_pk=None):
    """A slug unique among ACTIVE courses (soft-deleted slugs are free to reuse)."""
    from .models import Course

    base = slugify(title)[:300] or "course"
    slug = base
    n = 2
    qs = Course.objects.all()
    if exclude_pk is not None:
        qs = qs.exclude(pk=exclude_pk)
    while qs.filter(slug=slug).exists():
        slug = f"{base}-{n}"
        n += 1
    return slug


def next_position(queryset):
    """Next append position among active rows of the given queryset."""
    return (queryset.aggregate(m=Max("position"))["m"] or 0) + 1


@transaction.atomic
def reorder(queryset, ordered_ids):
    """Apply an explicit permutation of `ordered_ids` to `queryset` rows' positions.

    `ordered_ids` must be exactly the active rows' ids (any order). Positions are
    first shifted out of the 1..N band to dodge the partial-unique constraint, then
    reassigned 1..N in the requested order. Raises ValueError on a mismatch.
    """
    existing = list(queryset.values_list("id", flat=True))
    if sorted(str(i) for i in ordered_ids) != sorted(str(i) for i in existing):
        raise ValueError("order must list exactly the current items.")
    model = queryset.model
    queryset.update(position=F("position") + _REORDER_OFFSET)
    for index, obj_id in enumerate(ordered_ids, start=1):
        model.objects.filter(pk=obj_id).update(position=index)
