"""
DSAT LMS v2 — CRM tags
Domain: CRM
Description: Cross-entity tags via a GenericForeignKey, so one tag vocabulary can
    label students, leads, and future entities. TaggedItem carries a UUID
    object_id (all our models use UUID PKs). Both tag-name and (tag, entity)
    uniqueness are partial (active rows only), so a soft-deleted row never blocks a
    re-create.
"""

from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.db.models import Q

from common.models import BaseModel


class Tag(BaseModel):
    name = models.CharField(max_length=80)
    color = models.CharField(max_length=7, blank=True, default="")  # hex, e.g. #4F46E5

    class Meta:
        db_table = "crm_tags"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["name"],
                condition=Q(deleted_at__isnull=True),
                name="uniq_active_tag_name",
            )
        ]

    def __str__(self):
        return self.name


class TaggedItem(BaseModel):
    """Links a Tag to any entity (student, lead, …) by content-type + UUID pk."""

    tag = models.ForeignKey(Tag, on_delete=models.CASCADE, related_name="items")
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.UUIDField(db_index=True)
    content_object = GenericForeignKey("content_type", "object_id")

    class Meta:
        db_table = "crm_tagged_items"
        constraints = [
            models.UniqueConstraint(
                fields=["tag", "content_type", "object_id"],
                condition=Q(deleted_at__isnull=True),
                name="uniq_active_tagged_item",
            )
        ]
        indexes = [models.Index(fields=["content_type", "object_id"])]

    def __str__(self):
        return f"{self.tag_id} → {self.content_type_id}:{self.object_id}"
