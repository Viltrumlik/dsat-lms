"""
DSAT LMS v2 — User Model
Domain: Identity
Description: Custom user model — auth.User'ni to'liq almashtiradi
"""

import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


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
        public  → Ro'yxatdan o'tgan, lekin akademiya a'zosi emas
        student → Akademiya o'quvchisi (to'liq kirish)
        teacher → O'qituvchi
        admin   → To'liq nazorat
    """

    class Role(models.TextChoices):
        PUBLIC = "public", "Public User"
        STUDENT = "student", "Academy Student"
        TEACHER = "teacher", "Teacher"
        ADMIN = "admin", "Admin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Core
    email = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.PUBLIC)

    # Status
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # Django admin access
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
    def has_full_access(self):
        """Academy-only content'ga kirish huquqi."""
        return self.role in (self.Role.STUDENT, self.Role.TEACHER, self.Role.ADMIN)

    def soft_delete(self):
        self.deleted_at = timezone.now()
        self.is_active = False
        self.save(update_fields=["deleted_at", "is_active"])
