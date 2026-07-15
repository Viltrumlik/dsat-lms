"""
DSAT LMS v2 — Permission Classes
Domain: Common

Permission class hierarchy:
    IsAdmin
    IsTeacher
    IsAcademyStudent
    IsPublicUser
    IsReceptionist
    IsAcademicManager
    IsOwner (object-level)

Composite:
    IsAdminOrTeacher
    IsAdminOrOwner
    IsAdminOrAcademicManager
    IsAnyStaff          (teacher/receptionist/academic_manager/admin)
    IsOperationsStaff   (staff who may write operational data; row-scoped)

Object-level:
    CanAccessExam

Row-level student/class scoping lives in apps/academy/scoping.py, not here.
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


class IsReceptionist(BasePermission):
    """Faqat receptionist."""

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and request.user.role == "receptionist"
        )


class IsAcademicManager(BasePermission):
    """Faqat academic manager."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "academic_manager"
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


class IsAdminOrAcademicManager(BasePermission):
    """Full academic authority: admin yoki academic manager (all students)."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("admin", "academic_manager")
        )


class IsAnyStaff(BasePermission):
    """Any academy staff operator: teacher, receptionist, academic_manager, admin.
    Coarse gate only — row visibility is decided by apps/academy/scoping.py."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("teacher", "receptionist", "academic_manager", "admin")
        )


class IsOperationsStaff(BasePermission):
    """Staff who may WRITE operational data (enrollment, attendance, guardians,
    schedule): admin, academic_manager, receptionist, or teacher. Teachers are
    row-scoped to their own classes by apps/academy/scoping.py."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("admin", "academic_manager", "receptionist", "teacher")
        )


class IsFrontOffice(BasePermission):
    """Front-office staff who run the pre-enrollment CRM (leads pipeline): admin,
    academic_manager, receptionist — NOT teachers. Coarse gate only; per-row
    visibility (a receptionist sees only own leads) lives in apps/crm/scoping.py."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("admin", "academic_manager", "receptionist")
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
