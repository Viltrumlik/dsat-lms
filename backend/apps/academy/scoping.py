"""
DSAT LMS v2 — Academy access scoping
Domain: Academy
Description: The ONE shared row-scoping layer for staff access to classes and
    students, replacing the ad-hoc per-view _scoped_* helpers. Coarse role gating
    (who may hit an endpoint at all) lives in common/permissions.py; this module
    decides WHICH rows a given staff member may see.

Row-visibility matrix (locked Phase 4 decision):
    admin, academic_manager, receptionist → all classes / all students
    teacher                               → own classes / own-class active students
    anyone else (student, public)         → nothing
"""

from rest_framework.exceptions import NotFound

from apps.identity.models import User

from .models import Class, ClassEnrollment


def scoped_classes(request):
    """Classes the requester may act on, as a Class queryset."""
    user = request.user
    if user.can_read_all_students:
        return Class.objects.all()
    if user.is_teacher:
        return Class.objects.filter(teacher=user)
    return Class.objects.none()


def scoped_students(request):
    """LIVE student-role users the requester may see, as a User queryset. Never
    returns non-students or soft-deleted accounts (User uses a plain manager, so
    the deleted_at guard must be explicit — CLAUDE.md §15.5 soft-delete)."""
    user = request.user
    base = User.objects.filter(role=User.Role.STUDENT, deleted_at__isnull=True)
    if user.can_read_all_students:
        return base
    if user.is_teacher:
        return base.filter(
            enrollments__klass__teacher=user,
            enrollments__status=ClassEnrollment.Status.ACTIVE,
        ).distinct()
    return User.objects.none()


def scoped_student_or_404(request, pk):
    """The student `pk`, but only if the requester may see them: full-access staff
    (admin / academic_manager / receptionist) see any live student; a teacher sees
    only students actively enrolled in one of their own classes. Non-students and
    soft-deleted accounts are never returned (delegates to scoped_students)."""
    student = scoped_students(request).filter(pk=pk).distinct().first()
    if student is None:
        raise NotFound("Student not found.")
    return student
