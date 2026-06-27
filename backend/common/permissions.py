"""
DSAT LMS v2 — Permission Classes
Domain: Common

Permission class hierarchy:
    IsAdmin
    IsTeacher
    IsAcademyStudent
    IsPublicUser
    IsOwner (object-level)

Composite:
    IsAdminOrTeacher
    IsAdminOrOwner

Object-level:
    CanAccessExam
    CanViewStudentData
"""

from rest_framework.permissions import BasePermission

# ─────────────────────────────────────
# Role-based
# ─────────────────────────────────────


class IsAdmin(BasePermission):
    """Faqat admin."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "admin")


class IsTeacher(BasePermission):
    """Faqat teacher."""

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and request.user.role == "teacher"
        )


class IsAcademyStudent(BasePermission):
    """Faqat academy studenti (role == 'student')."""

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and request.user.role == "student"
        )


class IsPublicUser(BasePermission):
    """Public user (role == 'public')."""

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and request.user.role == "public"
        )


class IsStudentOrPublic(BasePermission):
    """Academy student yoki public user."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("student", "public")
        )


# ─────────────────────────────────────
# Composite
# ─────────────────────────────────────


class IsAdminOrTeacher(BasePermission):
    """Admin yoki teacher."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("admin", "teacher")
        )


class IsAdminOrOwner(BasePermission):
    """Admin yoki object egasi."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.role == "admin":
            return True
        # obj.user_id yoki obj.user — qaysi biri mavjud bo'lsa
        owner_id = getattr(obj, "user_id", None) or getattr(getattr(obj, "user", None), "id", None)
        return str(owner_id) == str(request.user.id)


class IsOwner(BasePermission):
    """Faqat object egasi."""

    def has_object_permission(self, request, view, obj):
        owner_id = getattr(obj, "user_id", None) or getattr(getattr(obj, "user", None), "id", None)
        return str(owner_id) == str(request.user.id)


# ─────────────────────────────────────
# Domain-specific
# ─────────────────────────────────────


class CanAccessExam(BasePermission):
    """
    Exam'ga kirish huquqi:
    - access_level == 'public' → barcha authenticated userlar
    - access_level == 'academy' → faqat academy students
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if obj.access_level == "public":
            return True
        # Academy-only
        return request.user.role in ("student", "teacher", "admin")


class CanViewStudentData(BasePermission):
    """
    Student ma'lumotlarini ko'rish:
    - Admin: hamma student
    - Teacher: faqat o'z sinfidagi studentlar
    - Student: faqat o'zining
    """

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("admin", "teacher", "student")
        )
