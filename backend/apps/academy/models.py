"""
DSAT LMS v2 — Academy Models
Domain: Academy
Description: PHASE 0 STUB. Only `Class` is defined here so that
            assessments.ExamAssignment.assigned_class (FK -> "academy.Class")
            resolves and the system check passes. Enrollment, attendance,
            schedules, teacher↔class wiring, etc. are added in a later phase.
"""

from django.db import models

from common.models import BaseModel


class Class(BaseModel):
    """Akademiya sinfi — Phase 0 stub (minimal fields only)."""

    name = models.CharField(max_length=200)

    class Meta:
        db_table = "classes"
        verbose_name = "Class"
        verbose_name_plural = "Classes"

    def __str__(self):
        return self.name
