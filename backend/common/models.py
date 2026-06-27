"""
DSAT LMS v2 — Common Base Model
Domain: Common (shared across all apps)

Barcha Django modellar shu classdan meros oladi.
"""

import uuid

from django.db import models
from django.utils import timezone


class ActiveManager(models.Manager):
    """Default manager — soft-deleted recordlarni filtrlab tashlab beradi."""

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class AllObjectsManager(models.Manager):
    """Soft-deleted recordlarni ham qaytaradi."""

    def get_queryset(self):
        return super().get_queryset()


class BaseModel(models.Model):
    """
    Barcha modellar uchun base class.

    Fields:
        id:         UUID primary key
        created_at: Yaratilgan vaqt
        updated_at: Oxirgi yangilangan vaqt
        deleted_at: Soft-delete vaqti (NULL = o'chirilmagan)
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    # Default: soft-deleted recordlarni ko'rsatmaydi
    objects = ActiveManager()

    # Hammasi (including soft-deleted)
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True
        ordering = ["-created_at"]

    def soft_delete(self, commit: bool = True) -> None:
        """
        Soft delete — hech qachon .delete() ishlatmang.
        """
        self.deleted_at = timezone.now()
        if commit:
            self.save(update_fields=["deleted_at"])

    def restore(self, commit: bool = True) -> None:
        """Soft-deleted recordni qayta tiklash."""
        self.deleted_at = None
        if commit:
            self.save(update_fields=["deleted_at"])

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None
