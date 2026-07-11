"""
DSAT LMS v2 — User Model
Domain: Identity
Description: Custom user model — auth.User'ni to'liq almashtiradi
"""

import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from common.models import BaseModel


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email required.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("role", "admin")
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_email_verified", True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    DSAT platformasining asosiy foydalanuvchi modeli.

    Role hierarchy:
        public           → Ro'yxatdan o'tgan, lekin akademiya a'zosi emas
        student          → Akademiya o'quvchisi (to'liq kirish)
        teacher          → O'qituvchi (faqat o'z sinfi)
        receptionist     → Front-desk operatsiyalar (barcha studentni ko'radi)
        academic_manager → Akademik boshqaruvchi (barcha studentga to'liq akademik)
        admin            → To'liq nazorat
    """

    class Role(models.TextChoices):
        PUBLIC = "public", "Public User"
        STUDENT = "student", "Academy Student"
        TEACHER = "teacher", "Teacher"
        RECEPTIONIST = "receptionist", "Receptionist"
        ACADEMIC_MANAGER = "academic_manager", "Academic Manager"
        ADMIN = "admin", "Admin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Core
    email = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.PUBLIC, db_index=True)

    # Status
    is_active = models.BooleanField(default=True)
    # NOTE: Django-admin access flag — ORTHOGONAL to the academy staff roles above.
    # Do not add a role-cluster property named `is_staff`; use `is_academy_staff`.
    is_staff = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)

    # Profile
    avatar_url = models.URLField(blank=True, null=True)

    # SAT personalization (optional)
    sat_target_score = models.SmallIntegerField(null=True, blank=True)
    exam_date = models.DateField(null=True, blank=True)

    # Meta
    timezone = models.CharField(max_length=50, default="Asia/Tashkent")
    last_login_at = models.DateTimeField(null=True, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        db_table = "users"
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return f"{self.get_full_name()} ({self.email})"

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self):
        return self.first_name

    # Role checks
    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN

    @property
    def is_teacher(self):
        return self.role == self.Role.TEACHER

    @property
    def is_academy_student(self):
        return self.role == self.Role.STUDENT

    @property
    def is_public_user(self):
        return self.role == self.Role.PUBLIC

    @property
    def is_receptionist(self):
        return self.role == self.Role.RECEPTIONIST

    @property
    def is_academic_manager(self):
        return self.role == self.Role.ACADEMIC_MANAGER

    @property
    def is_academy_staff(self):
        """Any staff operator (teacher/receptionist/academic_manager/admin).
        Orthogonal to Django's `is_staff` (admin-panel) flag."""
        return self.role in (
            self.Role.TEACHER,
            self.Role.RECEPTIONIST,
            self.Role.ACADEMIC_MANAGER,
            self.Role.ADMIN,
        )

    @property
    def can_read_all_students(self):
        """Staff who see EVERY student, not just their own class: admin, academic
        manager, receptionist. Teachers are own-class-scoped (see academy/scoping)."""
        return self.role in (self.Role.ADMIN, self.Role.ACADEMIC_MANAGER, self.Role.RECEPTIONIST)

    @property
    def has_full_access(self):
        """Academy-only content'ga kirish huquqi (all academy members + staff)."""
        return self.role in (
            self.Role.STUDENT,
            self.Role.TEACHER,
            self.Role.RECEPTIONIST,
            self.Role.ACADEMIC_MANAGER,
            self.Role.ADMIN,
        )

    def soft_delete(self):
        self.deleted_at = timezone.now()
        self.is_active = False
        self.save(update_fields=["deleted_at", "is_active"])


def default_grading_thresholds():
    """Default letter-grade bands (minimum percentage for each letter)."""
    return {"A": 90, "B": 80, "C": 70, "D": 60}


class OrgSetting(BaseModel):
    """Single-row organization configuration — academy branding, academic year,
    grading scheme, and feature flags. Access via ``OrgSetting.load()``; never
    soft-deleted. Only presentation-level config lives here — secrets, the broker
    URL, and the server-canonical TIME_ZONE stay in settings/.env.
    """

    # Sentinel that pins the table to a single row (DB-enforced via the unique key).
    key = models.CharField(max_length=16, unique=True, default="org", editable=False)

    academy_name = models.CharField(max_length=200, blank=True, default="")
    academic_year = models.CharField(max_length=20, blank=True, default="")
    # Presentation-only display timezone; server-canonical TIME_ZONE stays in settings.
    display_timezone = models.CharField(max_length=64, default="Asia/Tashkent")
    grading_thresholds = models.JSONField(default=default_grading_thresholds)
    logo_url = models.URLField(max_length=500, blank=True, default="")
    default_email_sender = models.EmailField(blank=True, default="")
    feature_flags = models.JSONField(default=dict)

    class Meta:
        db_table = "org_settings"

    def __str__(self):
        return self.academy_name or "Org settings"

    @classmethod
    def load(cls):
        """Return the singleton row, creating it (with defaults) on first access."""
        obj, _ = cls.objects.get_or_create(key="org")
        return obj
