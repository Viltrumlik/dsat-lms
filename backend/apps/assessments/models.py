"""
DSAT LMS v2 — Assessment Models
Domain: Assessments
Description: Exam templates, sessions, responses, results
"""

from django.db import models

from common.models import BaseModel


class ExamTemplate(BaseModel):
    """
    Exam template — barcha test turlari uchun asos.

    Types:
        practice   → Public + Academy
        past_paper → Public (limited) + Academy
        mock       → Academy only
        midterm    → Academy only
        assessment → Academy only
        homework   → Academy only (alohida homework app ham bor, lekin session shu orqali)
    """

    class Type(models.TextChoices):
        PRACTICE = "practice", "Practice Test"
        PAST_PAPER = "past_paper", "Past Paper"
        MOCK = "mock", "Mock Exam"
        MIDTERM = "midterm", "Midterm"
        ASSESSMENT = "assessment", "Assessment"
        HOMEWORK = "homework", "Homework"

    class Module(models.TextChoices):
        MATH = "math", "Math Only"
        READING_WRITING = "reading_writing", "Reading & Writing Only"
        FULL = "full", "Full Test"

    class AccessLevel(models.TextChoices):
        PUBLIC = "public", "Public"
        ACADEMY = "academy", "Academy Only"

    type = models.CharField(max_length=20, choices=Type.choices, db_index=True)
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True, null=True)
    module = models.CharField(max_length=20, choices=Module.choices, default=Module.FULL)
    time_limit = models.SmallIntegerField(null=True, blank=True)  # minutes
    is_adaptive = models.BooleanField(default=False)
    access_level = models.CharField(
        max_length=10,
        choices=AccessLevel.choices,
        default=AccessLevel.ACADEMY,
        db_index=True,
    )
    created_by = models.ForeignKey(
        "identity.User",
        on_delete=models.PROTECT,
        related_name="created_exams",
    )

    class Meta:
        db_table = "exam_templates"

    def __str__(self):
        return f"[{self.type.upper()}] {self.title}"


class ExamSection(models.Model):
    """Exam'ning bo'limlari (sections)."""

    class Module(models.TextChoices):
        MATH = "math", "Math"
        READING_WRITING = "reading_writing", "Reading & Writing"

    exam = models.ForeignKey(
        ExamTemplate,
        on_delete=models.CASCADE,
        related_name="sections",
    )
    title = models.CharField(max_length=200, blank=True)
    module = models.CharField(max_length=20, choices=Module.choices)
    section_number = models.SmallIntegerField()
    time_limit = models.SmallIntegerField(null=True, blank=True)  # minutes
    sort_order = models.SmallIntegerField(default=0)

    class Meta:
        db_table = "exam_sections"
        ordering = ["sort_order"]
        unique_together = [("exam", "section_number")]


class ExamQuestion(models.Model):
    """Section ichidagi savollar (tartib bilan)."""

    section = models.ForeignKey(
        ExamSection,
        on_delete=models.CASCADE,
        related_name="exam_questions",
    )
    question = models.ForeignKey(
        "question_bank.Question",
        on_delete=models.PROTECT,
        related_name="exam_appearances",
    )
    position = models.SmallIntegerField()

    class Meta:
        db_table = "exam_questions"
        unique_together = [("section", "position")]
        ordering = ["position"]


class ExamSession(BaseModel):
    """
    O'quvchining aktiv test sessiyasi.

    client_session_data (JSONB) — test davomida lokaldi saqlanadigan ma'lumot:
    {
        "questions": {
            "<question_id>": {
                "flagged": true,
                "note": "...",
                "crossed_out": ["A", "C"],
                "highlight": { ... }
            }
        }
    }

    Timer:
        Server-side authoritative. Client countdown uchun.
        started_at + section.time_limit = absolute deadline.
        Auto-save da time_remaining yuboriladi, server tekshiradi.
    """

    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "In Progress"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"
        ABANDONED = "abandoned", "Abandoned"

    user = models.ForeignKey(
        "identity.User",
        on_delete=models.PROTECT,
        related_name="exam_sessions",
    )
    exam = models.ForeignKey(
        ExamTemplate,
        on_delete=models.PROTECT,
        related_name="sessions",
    )
    assignment = models.ForeignKey(
        "ExamAssignment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sessions",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.IN_PROGRESS,
        db_index=True,
    )

    # Navigation state
    current_section = models.SmallIntegerField(default=1)
    current_question = models.SmallIntegerField(default=1)

    # Timer
    started_at = models.DateTimeField(auto_now_add=True)
    paused_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    time_remaining = models.IntegerField(null=True, blank=True)  # seconds

    # Client-side state (JSONB)
    client_session_data = models.JSONField(default=dict)

    class Meta:
        db_table = "exam_sessions"
        indexes = [
            models.Index(fields=["user", "status"]),
        ]


class ExamResponse(models.Model):
    """O'quvchining har bir savolga javob."""

    session = models.ForeignKey(
        ExamSession,
        on_delete=models.CASCADE,
        related_name="responses",
    )
    question = models.ForeignKey(
        "question_bank.Question",
        on_delete=models.PROTECT,
        related_name="responses",
    )
    chosen_answer = models.CharField(max_length=10, blank=True, null=True)
    is_correct = models.BooleanField(null=True)
    time_spent = models.SmallIntegerField(null=True, blank=True)  # seconds
    answered_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "exam_responses"
        unique_together = [("session", "question")]


class ExamResult(models.Model):
    """
    Test yakunlangandan keyin hisoblangan natijalar.
    Celery task tomonidan async hisoblangan.
    """

    session = models.OneToOneField(
        ExamSession,
        on_delete=models.CASCADE,
        related_name="result",
    )
    user = models.ForeignKey(
        "identity.User",
        on_delete=models.PROTECT,
        related_name="results",
    )
    exam = models.ForeignKey(
        ExamTemplate,
        on_delete=models.PROTECT,
        related_name="results",
    )

    # Scores (SAT scale where applicable)
    total_score = models.SmallIntegerField(null=True, blank=True)
    math_score = models.SmallIntegerField(null=True, blank=True)
    rw_score = models.SmallIntegerField(null=True, blank=True)

    # Counts
    total_correct = models.SmallIntegerField(default=0)
    total_incorrect = models.SmallIntegerField(default=0)
    total_skipped = models.SmallIntegerField(default=0)
    total_questions = models.SmallIntegerField(default=0)

    # Stats
    accuracy_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True)
    time_spent_secs = models.IntegerField(default=0)
    percentile = models.DecimalField(max_digits=5, decimal_places=2, null=True)

    # Breakdown (JSONB — per-category stats)
    score_breakdown = models.JSONField(default=dict)
    """
    score_breakdown example:
    {
        "categories": {
            "<category_id>": {
                "name": "Algebra",
                "correct": 8,
                "total": 10,
                "accuracy": 80.0
            }
        }
    }
    """

    computed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "exam_results"


class ExamAssignment(BaseModel):
    """
    Teacher/Admin tomonidan class yoki individual o'quvchiga tayinlangan exam.
    """

    exam = models.ForeignKey(
        ExamTemplate,
        on_delete=models.PROTECT,
        related_name="assignments",
    )
    assigned_by = models.ForeignKey(
        "identity.User",
        on_delete=models.PROTECT,
        related_name="assigned_exams",
    )

    # Target (class yoki individual)
    assigned_class = models.ForeignKey(
        "academy.Class",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="exam_assignments",
    )
    assigned_student = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="individual_assignments",
    )

    # Schedule
    opens_at = models.DateTimeField()
    closes_at = models.DateTimeField()
    max_attempts = models.SmallIntegerField(default=1)
    instructions = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "exam_assignments"
