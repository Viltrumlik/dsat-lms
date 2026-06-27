"""
DSAT LMS v2 — Academy Models
Domain: Academy
Description: Classes (owned by a teacher) and student enrollment.
"""

from django.db import models

from common.models import BaseModel


class Class(BaseModel):
    """An academy class, owned by a teacher."""

    name = models.CharField(max_length=200)
    teacher = models.ForeignKey(
        "identity.User",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="teaching_classes",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "classes"
        verbose_name = "Class"
        verbose_name_plural = "Classes"

    def __str__(self):
        return self.name


class ClassEnrollment(BaseModel):
    """A student's membership in a class (created_at = enrolled-at)."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"
        REMOVED = "removed", "Removed"

    klass = models.ForeignKey(
        Class,
        on_delete=models.CASCADE,
        related_name="enrollments",
    )
    student = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="enrollments",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        db_table = "class_enrollments"
        unique_together = [("klass", "student")]
        indexes = [models.Index(fields=["klass", "status"])]

    def __str__(self):
        return f"{self.student_id} in {self.klass_id} ({self.status})"
