"""
DSAT LMS v2 — Courses Models
Domain: Courses
Description: Course → Unit → Lesson content tree with a publish lifecycle, lesson
    attachments, assignment to a class/student, and per-student lesson progress.

Structure:
    Course (draft → published → archived)
      └─ Unit (ordered)
           └─ Lesson (ordered; markdown + optional video / linked exam / homework)
                └─ LessonAttachment (→ files.Attachment)

Ordering + uniqueness:
    Unit.position is unique per course, Lesson.position unique per unit — but only
    among ACTIVE (non-soft-deleted) rows (partial UniqueConstraint), so a
    soft-deleted row never blocks a new one and reorder operates on live rows only.
"""

from django.db import models
from django.db.models import Q
from django.utils import timezone

from common.models import BaseModel


class Course(BaseModel):
    """A course — the top of the content tree. Publishing gates student visibility."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    class Subject(models.TextChoices):
        MATH = "math", "Math"
        READING_WRITING = "reading_writing", "Reading & Writing"
        GENERAL = "general", "General"

    title = models.CharField(max_length=300)
    slug = models.SlugField(max_length=320, blank=True)
    description = models.TextField(blank=True, default="")  # markdown + KaTeX
    subject = models.CharField(max_length=20, choices=Subject.choices, default=Subject.GENERAL)
    cover_image_url = models.URLField(blank=True, null=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True
    )
    created_by = models.ForeignKey(
        "identity.User", on_delete=models.PROTECT, related_name="created_courses"
    )
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "courses"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["slug"],
                condition=Q(deleted_at__isnull=True),
                name="uniq_active_course_slug",
            )
        ]

    def __str__(self):
        return f"[{self.status}] {self.title}"

    def publish(self):
        """Draft/archived → published (idempotent stamp of published_at)."""
        self.status = self.Status.PUBLISHED
        if self.published_at is None:
            self.published_at = timezone.now()
        self.save(update_fields=["status", "published_at", "updated_at"])

    def archive(self):
        """Any state → archived (hides from students without deleting)."""
        self.status = self.Status.ARCHIVED
        self.save(update_fields=["status", "updated_at"])


class Unit(BaseModel):
    """An ordered section of a course."""

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="units")
    title = models.CharField(max_length=300)
    position = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "course_units"
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(
                fields=["course", "position"],
                condition=Q(deleted_at__isnull=True),
                name="uniq_active_unit_position",
            )
        ]

    def __str__(self):
        return f"{self.course_id} · U{self.position} {self.title}"


class Lesson(BaseModel):
    """A single lesson — markdown/KaTeX body plus optional video and links to an
    exam template or a homework assignment the student can launch inline."""

    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="lessons")
    title = models.CharField(max_length=300)
    position = models.PositiveIntegerField(default=1)
    content_md = models.TextField(blank=True, default="")  # markdown + KaTeX
    video_url = models.URLField(blank=True, null=True)
    linked_exam = models.ForeignKey(
        "assessments.ExamTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    linked_homework = models.ForeignKey(
        "homework.Homework",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        db_table = "course_lessons"
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(
                fields=["unit", "position"],
                condition=Q(deleted_at__isnull=True),
                name="uniq_active_lesson_position",
            )
        ]

    def __str__(self):
        return f"{self.unit_id} · L{self.position} {self.title}"


class LessonAttachment(BaseModel):
    """Links a files.Attachment to a lesson (slides, worksheets, PDFs)."""

    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name="attachments")
    attachment = models.ForeignKey("files.Attachment", on_delete=models.PROTECT, related_name="+")
    caption = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "course_lesson_attachments"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.lesson_id} → {self.attachment_id}"


class CourseAssignment(BaseModel):
    """A course assigned to a whole class or one student, with an optional open/close
    window (both null = open-ended, available immediately). Mirrors
    assessments.ExamAssignment. Exactly one of class/student is set (serializer-guarded)."""

    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="assignments")
    assigned_by = models.ForeignKey(
        "identity.User", on_delete=models.PROTECT, related_name="assigned_courses"
    )
    assigned_class = models.ForeignKey(
        "academy.Class",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="course_assignments",
    )
    assigned_student = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="individual_course_assignments",
    )
    opens_at = models.DateTimeField(null=True, blank=True)
    closes_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True, default="")

    class Meta:
        db_table = "course_assignments"
        ordering = ["-created_at"]

    def __str__(self):
        target = self.assigned_class_id or self.assigned_student_id
        return f"{self.course_id} → {target}"


class LessonProgress(BaseModel):
    """A student's progress on one lesson. Completion % is derived per-course against
    the currently-published lessons (not stored), so it stays correct as lessons change."""

    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"

    student = models.ForeignKey(
        "identity.User", on_delete=models.CASCADE, related_name="lesson_progress"
    )
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name="progress")
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.IN_PROGRESS, db_index=True
    )
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "course_lesson_progress"
        constraints = [
            models.UniqueConstraint(fields=["student", "lesson"], name="uniq_student_lesson")
        ]
        indexes = [models.Index(fields=["student", "status"])]

    def __str__(self):
        return f"{self.student_id} · {self.lesson_id} ({self.status})"
