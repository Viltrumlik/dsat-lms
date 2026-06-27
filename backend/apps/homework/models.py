"""
DSAT LMS v2 — Homework Models
Domain: Homework
Description: A teacher assigns homework to a class (optionally backed by an exam);
            each enrolled student gets a submission record.
"""

from django.db import models

from common.models import BaseModel


class Homework(BaseModel):
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    assigned_class = models.ForeignKey(
        "academy.Class",
        on_delete=models.CASCADE,
        related_name="homeworks",
    )
    assigned_by = models.ForeignKey(
        "identity.User",
        on_delete=models.PROTECT,
        related_name="assigned_homeworks",
    )
    exam = models.ForeignKey(
        "assessments.ExamTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="homeworks",
    )
    due_at = models.DateTimeField()
    is_published = models.BooleanField(default=True)

    class Meta:
        db_table = "homeworks"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class HomeworkSubmission(BaseModel):
    class Status(models.TextChoices):
        ASSIGNED = "assigned", "Assigned"
        SUBMITTED = "submitted", "Submitted"
        GRADED = "graded", "Graded"

    homework = models.ForeignKey(
        Homework,
        on_delete=models.CASCADE,
        related_name="submissions",
    )
    student = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="homework_submissions",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ASSIGNED)
    submitted_at = models.DateTimeField(null=True, blank=True)
    session = models.ForeignKey(
        "assessments.ExamSession",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="homework_submissions",
    )

    class Meta:
        db_table = "homework_submissions"
        unique_together = [("homework", "student")]
        indexes = [models.Index(fields=["homework", "status"])]

    def __str__(self):
        return f"{self.student_id} · {self.homework_id} ({self.status})"
