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


class StudentProfile(BaseModel):
    """Per-student CRM record: demographics + lifecycle status. 1:1 with a
    role='student' User — kept in academy so identity.User stays auth-only. The
    profile photo IS User.avatar_url (managed by the files pipeline), so there is
    no separate photo field here."""

    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        OTHER = "other", "Other"

    class LifecycleStatus(models.TextChoices):
        # Account funnel state — orthogonal to the (future) Journey funnel stage and
        # to User.is_active / soft-delete.
        ACTIVE = "active", "Active"
        FROZEN = "frozen", "Frozen"
        GRADUATED = "graduated", "Graduated"
        DROPPED = "dropped", "Dropped"

    user = models.OneToOneField(
        "identity.User", on_delete=models.CASCADE, related_name="student_profile"
    )
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True, default="")
    date_of_birth = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=32, blank=True, default="")
    address = models.CharField(max_length=255, blank=True, default="")
    school = models.CharField(max_length=150, blank=True, default="")
    grade = models.CharField(max_length=50, blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=LifecycleStatus.choices,
        default=LifecycleStatus.ACTIVE,
        db_index=True,
    )
    status_changed_at = models.DateTimeField(null=True, blank=True)
    status_changed_by = models.ForeignKey(
        "identity.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    enrolled_at = models.DateTimeField(null=True, blank=True)
    # Academic mentor (Phase 4 S6). Set via services.assign_mentor (which also
    # writes the MentorAssignment history row); read-only on the serializer.
    mentor = models.ForeignKey(
        "identity.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mentee_profiles",
    )
    mentor_assigned_at = models.DateTimeField(null=True, blank=True)
    mentor_assigned_by = models.ForeignKey(
        "identity.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        db_table = "student_profiles"
        verbose_name = "Student Profile"
        verbose_name_plural = "Student Profiles"
        indexes = [models.Index(fields=["mentor"])]

    def __str__(self):
        return f"Profile<{self.user_id}> ({self.status})"


class Guardian(BaseModel):
    """A parent/guardian contact attached to a student profile."""

    class Relation(models.TextChoices):
        FATHER = "father", "Father"
        MOTHER = "mother", "Mother"
        GUARDIAN = "guardian", "Guardian"
        OTHER = "other", "Other"

    profile = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name="guardians")
    relation = models.CharField(max_length=20, choices=Relation.choices, default=Relation.GUARDIAN)
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=32, blank=True, default="")
    telegram = models.CharField(max_length=100, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    is_emergency = models.BooleanField(default=False)

    class Meta:
        db_table = "guardians"
        ordering = ["-is_emergency", "-created_at"]
        indexes = [models.Index(fields=["profile", "is_emergency"])]

    def __str__(self):
        return f"{self.name} ({self.relation})"


class MentorAssignment(BaseModel):
    """Append-only history of who mentored a student and when (S6). At most one
    ACTIVE assignment (ended_at IS NULL) per student — enforced by a partial unique
    constraint. StudentProfile.mentor mirrors the active one for fast reads."""

    profile = models.ForeignKey(
        StudentProfile, on_delete=models.CASCADE, related_name="mentor_assignments"
    )
    mentor = models.ForeignKey(
        "identity.User", on_delete=models.PROTECT, related_name="mentor_assignments"
    )
    assigned_by = models.ForeignKey(
        "identity.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    ended_at = models.DateTimeField(null=True, blank=True)
    ended_by = models.ForeignKey(
        "identity.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        db_table = "mentor_assignments"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["profile"],
                condition=models.Q(ended_at__isnull=True, deleted_at__isnull=True),
                name="uniq_active_mentor_per_student",
            )
        ]
        indexes = [models.Index(fields=["mentor", "ended_at"])]

    def __str__(self):
        return f"Mentorship<{self.profile_id}> by {self.mentor_id}"


class MentorCheckIn(BaseModel):
    """A mentor's periodic (≈weekly) check-in note on a mentee."""

    profile = models.ForeignKey(
        StudentProfile, on_delete=models.CASCADE, related_name="mentor_checkins"
    )
    mentor = models.ForeignKey(
        "identity.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    note = models.TextField()

    class Meta:
        db_table = "mentor_checkins"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["profile", "created_at"])]

    def __str__(self):
        return f"CheckIn<{self.profile_id}>"


class ParentContactLog(BaseModel):
    """A logged contact with a student's guardian. The guardian must belong to the
    student's profile (validated server-side)."""

    class Method(models.TextChoices):
        CALL = "call", "Call"
        MESSAGE = "message", "Message"
        MEETING = "meeting", "Meeting"
        OTHER = "other", "Other"

    profile = models.ForeignKey(
        StudentProfile, on_delete=models.CASCADE, related_name="parent_contacts"
    )
    guardian = models.ForeignKey(Guardian, on_delete=models.PROTECT, related_name="contacts")
    author = models.ForeignKey(
        "identity.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    method = models.CharField(max_length=10, choices=Method.choices, default=Method.CALL)
    note = models.TextField(blank=True, default="")

    class Meta:
        db_table = "parent_contact_logs"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["profile", "created_at"])]

    def __str__(self):
        return f"ParentContact<{self.profile_id}> ({self.method})"


class ClassSession(BaseModel):
    """A dated occurrence of a class — the unit attendance is marked against.
    `teacher` and `title` are SNAPSHOTTED so later Class edits don't rewrite the
    history (mirrors support.OfficeHourSession). Sessions are created ad hoc; a
    recurring weekly schedule (5.2b) will materialize them."""

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        COMPLETED = "completed", "Completed"
        CANCELED = "canceled", "Canceled"

    klass = models.ForeignKey(Class, on_delete=models.CASCADE, related_name="sessions")
    teacher = models.ForeignKey(
        "identity.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    title = models.CharField(max_length=200, blank=True, default="")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)
    location = models.CharField(max_length=200, blank=True, default="")
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.SCHEDULED, db_index=True
    )

    class Meta:
        db_table = "class_sessions"
        ordering = ["-starts_at"]
        unique_together = [("klass", "starts_at")]
        indexes = [models.Index(fields=["klass", "starts_at"])]

    def __str__(self):
        return f"{self.klass_id} @ {self.starts_at:%Y-%m-%d %H:%M}"


class Attendance(BaseModel):
    """One student's attendance mark for a class session."""

    class Status(models.TextChoices):
        PRESENT = "present", "Present"
        ABSENT = "absent", "Absent"
        LATE = "late", "Late"
        EXCUSED = "excused", "Excused"

    session = models.ForeignKey(ClassSession, on_delete=models.CASCADE, related_name="attendances")
    student = models.ForeignKey(
        "identity.User", on_delete=models.CASCADE, related_name="attendances"
    )
    status = models.CharField(max_length=20, choices=Status.choices)
    marked_by = models.ForeignKey(
        "identity.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    note = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "attendances"
        unique_together = [("session", "student")]
        indexes = [models.Index(fields=["session", "status"])]

    def __str__(self):
        return f"{self.student_id} @ {self.session_id}: {self.status}"


class ClassScheduleRule(BaseModel):
    """A recurring weekly slot for a class — the template a daily task materializes
    into dated ClassSessions (mirrors support.OfficeHour → OfficeHourSession).
    `weekday` uses Python's convention (0=Mon … 6=Sun, matching date.weekday());
    slots are materialized in settings.TIME_ZONE."""

    klass = models.ForeignKey(Class, on_delete=models.CASCADE, related_name="schedule_rules")
    weekday = models.PositiveSmallIntegerField()  # 0=Mon … 6=Sun (date.weekday())
    start_time = models.TimeField()
    end_time = models.TimeField(null=True, blank=True)
    title = models.CharField(max_length=200, blank=True, default="")
    location = models.CharField(max_length=200, blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "class_schedule_rules"
        ordering = ["weekday", "start_time"]
        indexes = [models.Index(fields=["klass", "is_active"])]

    def __str__(self):
        return f"{self.klass_id} wd={self.weekday} {self.start_time}"


class StudentNote(BaseModel):
    """A free-form, pinnable staff note on a student — distinct from mentor
    check-ins (MentorCheckIn) and parent-contact logs (ParentContactLog); a
    general CRM annotation surfaced on the Student-360 timeline (Phase 5.5b)."""

    student = models.ForeignKey("identity.User", on_delete=models.CASCADE, related_name="notes")
    author = models.ForeignKey(
        "identity.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    body = models.TextField()
    pinned = models.BooleanField(default=False)

    class Meta:
        db_table = "student_notes"
        ordering = ["-pinned", "-created_at"]
        indexes = [models.Index(fields=["student", "-created_at"])]

    def __str__(self):
        return f"note on {self.student_id}"
