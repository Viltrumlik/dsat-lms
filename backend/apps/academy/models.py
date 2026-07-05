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

    class Meta:
        db_table = "student_profiles"
        verbose_name = "Student Profile"
        verbose_name_plural = "Student Profiles"

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
