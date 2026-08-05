"""
DSAT LMS v2 — Homework Models
Domain: Homework
Description: A teacher assigns homework to a class (optionally backed by an exam);
            each enrolled student gets a submission record.

Homework used to be a switch: the student pressed a button and the row flipped to
`submitted`. There was nothing to hand IN — no written answer, no file — and
nothing to hand BACK, so a teacher who wanted a correction had no move except to
grade it badly. The models below add the two directions:

    student  -> response_text, HomeworkSubmissionFile (their work)
    teacher  -> HomeworkAttachment on the brief (materials), and RETURNED, which
                reopens the submission for another go

and a HomeworkEvent trail, because once work can be handed back and forth the
question "what actually happened here" needs an answer that isn't inference from
three nullable timestamps.
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


class HomeworkAttachment(BaseModel):
    """A file the teacher attached to the brief — a worksheet, a reading, a rubric.

    Mirrors courses.LessonAttachment: the blob lives in files.Attachment and this
    is only the link, so uploads, quotas, soft-delete and the purge beat are all
    the one pipeline.
    """

    homework = models.ForeignKey(Homework, on_delete=models.CASCADE, related_name="attachments")
    attachment = models.ForeignKey(
        "files.Attachment", on_delete=models.CASCADE, related_name="homework_links"
    )
    added_by = models.ForeignKey(
        "identity.User", on_delete=models.PROTECT, related_name="homework_attachments"
    )

    class Meta:
        db_table = "homework_attachments"
        unique_together = [("homework", "attachment")]
        ordering = ["created_at"]


class HomeworkSubmission(BaseModel):
    class Status(models.TextChoices):
        ASSIGNED = "assigned", "Assigned"
        SUBMITTED = "submitted", "Submitted"
        # Handed back for another go. Distinct from ASSIGNED: the student has
        # already done the work once and there is feedback waiting on it.
        RETURNED = "returned", "Returned for revision"
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

    # What the student actually handed in. Files hang off HomeworkSubmissionFile.
    response_text = models.TextField(blank=True, default="")
    # Stamped from the server clock against Homework.due_at at submit time, not
    # computed on read — the due date can be moved afterwards and that must not
    # retroactively rewrite whether someone was late.
    is_late = models.BooleanField(default=False)
    # Counts submissions, so a returned-and-resubmitted piece is visibly a 2nd go.
    attempt_number = models.PositiveSmallIntegerField(default=0)
    returned_at = models.DateTimeField(null=True, blank=True)

    session = models.ForeignKey(
        "assessments.ExamSession",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="homework_submissions",
    )
    # Manual grading (5.3a). A manual grade lets non-exam homework be graded; when
    # null the gradebook falls back to the linked session's ExamResult score.
    grade = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    grade_scale = models.PositiveSmallIntegerField(default=100)
    feedback = models.TextField(blank=True, default="")
    graded_by = models.ForeignKey(
        "identity.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="graded_submissions",
    )
    graded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "homework_submissions"
        unique_together = [("homework", "student")]
        indexes = [models.Index(fields=["homework", "status"])]

    def __str__(self):
        return f"{self.student_id} · {self.homework_id} ({self.status})"

    @property
    def is_open_for_work(self):
        """Whether the student may (re)submit right now.

        A graded piece is closed — reopening it is the teacher's call, via
        RETURNED — so the two states a student can act in are the first attempt
        and a hand-back.
        """
        return self.status in (self.Status.ASSIGNED, self.Status.RETURNED)


class HomeworkSubmissionFile(BaseModel):
    """One file the student handed in.

    The Attachment must be owned by the submitting student — enforced in the
    service, not just here — so a student cannot attach somebody else's file by
    id and thereby hand a teacher a link to it.
    """

    submission = models.ForeignKey(
        HomeworkSubmission, on_delete=models.CASCADE, related_name="files"
    )
    attachment = models.ForeignKey(
        "files.Attachment", on_delete=models.CASCADE, related_name="homework_submission_links"
    )
    # Which go this file was handed in on, so a resubmission doesn't erase the
    # history of what was originally sent.
    attempt_number = models.PositiveSmallIntegerField(default=1)

    class Meta:
        db_table = "homework_submission_files"
        unique_together = [("submission", "attachment")]
        ordering = ["created_at"]


class HomeworkEvent(BaseModel):
    """Append-only trail of what happened to one submission.

    Once work goes back and forth, the nullable timestamps on the submission
    only remember the LAST of each kind. This remembers all of it — who
    submitted when, who handed it back and why, who graded it and to what.
    """

    class Kind(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        RETURNED = "returned", "Returned for revision"
        GRADED = "graded", "Graded"

    submission = models.ForeignKey(
        HomeworkSubmission, on_delete=models.CASCADE, related_name="events"
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    actor = models.ForeignKey(
        "identity.User", on_delete=models.SET_NULL, null=True, related_name="homework_events"
    )
    # The teacher's words on a return, or the feedback recorded with a grade.
    note = models.TextField(blank=True, default="")
    attempt_number = models.PositiveSmallIntegerField(default=1)

    class Meta:
        db_table = "homework_events"
        ordering = ["created_at"]
        indexes = [models.Index(fields=["submission", "created_at"])]

    def __str__(self):
        return f"{self.kind} · {self.submission_id}"
