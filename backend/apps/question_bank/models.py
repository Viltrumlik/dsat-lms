"""
DSAT LMS v2 — Question Bank Models
Domain: Question Bank
Description: Questions, Categories, Tags — platformaning asosi

Status lifecycle:
    DRAFT → REVIEW → PUBLISHED
                   ↘ DRAFT (rejected with note)
    PUBLISHED → (edit) → new version → ARCHIVED (old), PUBLISHED (new)
"""

from django.db import models

from common.models import BaseModel


class QuestionCategory(BaseModel):
    """
    Savollar kategoriyasi (tree structure).

    Examples:
        Math > Algebra > Linear Equations
        Reading & Writing > Standard English > Subject-Verb Agreement
    """

    class Module(models.TextChoices):
        MATH = "math", "Math"
        READING_WRITING = "reading_writing", "Reading & Writing"

    module = models.CharField(max_length=20, choices=Module.choices)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200, unique=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="children",
    )
    sort_order = models.SmallIntegerField(default=0)

    class Meta:
        db_table = "qb_categories"
        verbose_name = "Category"
        verbose_name_plural = "Categories"
        ordering = ["module", "sort_order", "name"]

    def __str__(self):
        if self.parent:
            return f"{self.parent.name} > {self.name}"
        return self.name


class QuestionTag(BaseModel):
    """Savollar uchun tag-lar (erkin qo'shiladi)."""

    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    color = models.CharField(max_length=7, blank=True)  # hex, e.g. #4F46E5

    class Meta:
        db_table = "qb_tags"

    def __str__(self):
        return self.name


class Question(BaseModel):
    """
    Savol — platformaning asosiy content birligi.

    Versioning:
        - parent = None → original savol
        - parent = <Question> → revision (yangi versiya)
        - Versiya yaratilib PUBLISHED bo'lganda, parent ARCHIVED bo'ladi

    Math support:
        - has_math = True → frontend KaTeX bilan render qiladi
        - stem va explanation maydoni LaTeX: $x^2$ yoki $$x^2$$

    Answer types:
        - mcq: Multiple choice (A/B/C/D)
        - grid_in: Student-produced response (numeric)
    """

    class Module(models.TextChoices):
        MATH = "math", "Math"
        READING_WRITING = "reading_writing", "Reading & Writing"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        REVIEW = "review", "In Review"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    class AnswerType(models.TextChoices):
        MCQ = "mcq", "Multiple Choice"
        GRID_IN = "grid_in", "Grid-In"

    class Source(models.TextChoices):
        OFFICIAL = "official", "Official SAT"
        CUSTOM = "custom", "Custom"
        IMPORTED = "imported", "Imported"

    # Versioning
    version = models.SmallIntegerField(default=1)
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="versions",
    )

    # Classification
    module = models.CharField(max_length=20, choices=Module.choices, db_index=True)
    category = models.ForeignKey(
        QuestionCategory,
        on_delete=models.PROTECT,
        related_name="questions",
    )
    difficulty = models.SmallIntegerField(
        choices=[(i, str(i)) for i in range(1, 6)],  # 1-5
        db_index=True,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    tags = models.ManyToManyField(QuestionTag, blank=True, related_name="questions")

    # Content
    stem = models.TextField()  # Question text — markdown + LaTeX
    stem_image_url = models.URLField(blank=True, null=True)
    has_math = models.BooleanField(default=False)

    # Passage (Reading questions uchun)
    passage = models.TextField(blank=True, null=True)
    passage_image_url = models.URLField(blank=True, null=True)

    # Answer
    answer_type = models.CharField(
        max_length=10,
        choices=AnswerType.choices,
        default=AnswerType.MCQ,
    )
    correct_answer = models.CharField(max_length=10)  # "A", "B", "C", "D" or numeric

    # Explanation
    explanation = models.TextField(blank=True, null=True)
    explanation_image_url = models.URLField(blank=True, null=True)

    # Source tracking
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.CUSTOM,
    )
    source_ref = models.CharField(max_length=100, blank=True, null=True)  # e.g. "SAT-2024-05 Q12"

    # Workflow
    created_by = models.ForeignKey(
        "identity.User",
        on_delete=models.PROTECT,
        related_name="created_questions",
    )
    reviewed_by = models.ForeignKey(
        "identity.User",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reviewed_questions",
    )
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "questions"
        indexes = [
            models.Index(fields=["status", "module"]),
            models.Index(fields=["status", "category"]),
            models.Index(fields=["status", "difficulty"]),
        ]

    def __str__(self):
        return f"Q{self.pk} [{self.module}] {self.stem[:60]}..."

    def submit_for_review(self):
        """Draft'dan Review'ga o'tkazish."""
        if self.status != self.Status.DRAFT:
            raise ValueError("Only DRAFT questions can be submitted for review.")
        self.status = self.Status.REVIEW
        self.save(update_fields=["status"])

    def approve(self, reviewer):
        """Review'dan Published'ga o'tkazish."""
        from django.utils import timezone

        if self.status != self.Status.REVIEW:
            raise ValueError("Only questions IN REVIEW can be approved.")
        self.status = self.Status.PUBLISHED
        self.reviewed_by = reviewer
        self.published_at = timezone.now()
        self.save(update_fields=["status", "reviewed_by", "published_at"])

    def reject(self, reviewer, note: str):
        """Review'dan Draft'ga qaytarish."""
        if self.status != self.Status.REVIEW:
            raise ValueError("Only questions IN REVIEW can be rejected.")
        self.status = self.Status.DRAFT
        self.reviewed_by = reviewer
        self.save(update_fields=["status", "reviewed_by"])
        # Note saqlanadi QuestionReview orqali
        QuestionReview.objects.create(
            question=self,
            reviewer=reviewer,
            status=QuestionReview.Status.REJECTED,
            note=note,
        )


class QuestionChoice(models.Model):
    """
    MCQ savol uchun javob variantlari (A, B, C, D).
    BaseModel'dan emas — question bilan birga yaratiladi/o'chiriladi.
    """

    question = models.ForeignKey(
        Question,
        on_delete=models.CASCADE,
        related_name="choices",
    )
    label = models.CharField(max_length=1)  # A, B, C, D
    text = models.TextField()  # may contain LaTeX
    image_url = models.URLField(blank=True, null=True)
    sort_order = models.SmallIntegerField(default=0)

    class Meta:
        db_table = "question_choices"
        unique_together = [("question", "label")]
        ordering = ["sort_order"]

    def __str__(self):
        return f"{self.label}. {self.text[:50]}"


class QuestionReview(models.Model):
    """Review workflow tarixi."""

    class Status(models.TextChoices):
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        NEEDS_REVISION = "needs_revision", "Needs Revision"

    question = models.ForeignKey(
        Question,
        on_delete=models.CASCADE,
        related_name="reviews",
    )
    reviewer = models.ForeignKey(
        "identity.User",
        on_delete=models.PROTECT,
        related_name="question_reviews",
    )
    status = models.CharField(max_length=20, choices=Status.choices)
    note = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "question_reviews"
        ordering = ["-created_at"]
