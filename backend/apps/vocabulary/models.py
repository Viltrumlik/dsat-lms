"""
DSAT LMS v2 — Vocabulary models
Domain: Vocabulary
Description: Section → Set → Word, plus what a student has done with each word.

The three-level shape is the point. A word list worth studying is 300–700 words
("650 Hard Words", "College Panda"); a *sitting* is twenty-five. So a SECTION is
the list a student chooses, a SET is the deck they actually pick up, and a WORD
belongs to exactly one set. Words are not shared between sets: two lists teaching
"laconic" mean their own wording of it, and a shared row would make editing one
list silently rewrite another.

Flashcards are the only study mode, deliberately. Matching, speed rounds and
multiple-choice tests are all quizzes wearing different clothes; the flashcard —
see the word, recall it, admit whether you knew it — is the one that does the
teaching, and it is the whole of what was asked for. `VocabStudySession`
therefore carries no `mode` column: there is nothing to distinguish.
"""

from django.db import models
from django.utils import timezone

from common.models import BaseModel


class VocabSection(BaseModel):
    """A named word list — the thing a student picks off the shelf."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    title = models.CharField(max_length=200, db_index=True)
    slug = models.SlugField(max_length=220, unique=True)
    description = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.DRAFT, db_index=True
    )
    sort_order = models.PositiveIntegerField(default=0, db_index=True)
    created_by = models.ForeignKey(
        "identity.User",
        on_delete=models.PROTECT,
        related_name="vocab_sections_created",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "vocab_sections"
        ordering = ["sort_order", "title", "id"]

    def __str__(self) -> str:
        return self.title


class VocabSet(BaseModel):
    """One deck inside a section — nominally twenty-five words."""

    TARGET_WORD_COUNT = 25

    section = models.ForeignKey(VocabSection, on_delete=models.CASCADE, related_name="sets")
    title = models.CharField(max_length=200)
    sort_order = models.PositiveIntegerField(default=0, db_index=True)

    class Meta:
        db_table = "vocab_sets"
        ordering = ["sort_order", "id"]
        indexes = [models.Index(fields=["section", "sort_order"])]

    def __str__(self) -> str:
        return self.title


class VocabWord(BaseModel):
    class Part(models.TextChoices):
        NOUN = "noun", "Noun"
        VERB = "verb", "Verb"
        ADJECTIVE = "adjective", "Adjective"
        ADVERB = "adverb", "Adverb"
        OTHER = "other", "Other"

    vocab_set = models.ForeignKey(VocabSet, on_delete=models.CASCADE, related_name="words")
    word = models.CharField(max_length=120, db_index=True)
    definition = models.TextField()
    part_of_speech = models.CharField(max_length=24, choices=Part.choices, default=Part.OTHER)
    example = models.TextField(blank=True, default="")
    synonyms = models.JSONField(default=list, blank=True)
    sort_order = models.PositiveIntegerField(default=0, db_index=True)

    class Meta:
        db_table = "vocab_words"
        ordering = ["sort_order", "word", "id"]
        indexes = [models.Index(fields=["vocab_set", "sort_order"])]

    def __str__(self) -> str:
        return self.word


class VocabWordProgress(BaseModel):
    """One row per (student, word) — what drives New / Learning / Mastered.

    Mastery is a STREAK, not a tally. Counting lifetime rights against lifetime
    wrongs means a word you got wrong five times early on can never be mastered
    however well you know it now; a streak forgets, which is what learning does.
    Any wrong answer drops it back to Learning.
    """

    class Status(models.TextChoices):
        NEW = "new", "New"
        LEARNING = "learning", "Learning"
        MASTERED = "mastered", "Mastered"

    MASTERY_STREAK = 3

    user = models.ForeignKey(
        "identity.User", on_delete=models.CASCADE, related_name="vocab_progress"
    )
    word = models.ForeignKey(VocabWord, on_delete=models.CASCADE, related_name="progress_rows")
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.NEW, db_index=True
    )
    correct_count = models.PositiveIntegerField(default=0)
    wrong_count = models.PositiveIntegerField(default=0)
    streak = models.PositiveIntegerField(default=0)
    last_reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "vocab_word_progress"
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "word"],
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_vocab_progress_user_word",
            )
        ]
        indexes = [models.Index(fields=["user", "status"])]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.word_id} ({self.status})"

    def record(self, *, correct: bool, at=None) -> None:
        """Fold in one verdict. The caller saves."""
        self.last_reviewed_at = at or timezone.now()
        if correct:
            self.correct_count += 1
            self.streak += 1
            self.status = (
                self.Status.MASTERED if self.streak >= self.MASTERY_STREAK else self.Status.LEARNING
            )
        else:
            self.wrong_count += 1
            self.streak = 0
            self.status = self.Status.LEARNING


class VocabStudySession(BaseModel):
    """One run of flashcards over one set.

    Counts ACCUMULATE rather than overwrite: a runner reports the verdicts it has
    when the student leaves and again when the deck is cleared, each batch
    carrying only what it has not sent yet. Completing is a separate step from
    reporting, because quitting halfway must keep the progress without claiming
    the set was finished.
    """

    user = models.ForeignKey(
        "identity.User", on_delete=models.CASCADE, related_name="vocab_sessions"
    )
    vocab_set = models.ForeignKey(VocabSet, on_delete=models.CASCADE, related_name="sessions")
    completed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    correct_count = models.PositiveIntegerField(default=0)
    total_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "vocab_study_sessions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "vocab_set", "completed_at"]),
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.vocab_set_id}"

    @property
    def accuracy_pct(self) -> float:
        return round(self.correct_count / self.total_count * 100, 1) if self.total_count else 0.0
