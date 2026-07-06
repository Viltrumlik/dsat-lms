"""
DSAT LMS v2 — Support access scoping
Domain: Support
Description: Row-scoping for staff access to support-domain rows, composing the
    academy scoping layer (apps/academy/scoping.py) so the two never diverge.
    Coarse role gating (who may hit an endpoint at all) lives in
    common/permissions.py; this module decides WHICH rows a given staff member
    may see. Out-of-scope rows must surface as 404 (never 403) — callers pair a
    coarse permission class with these helpers, matching the academy pattern.

Two scoping axes are used across the support domain:
  * teacher-owned rows (bookings, availability, office hours) — a teacher sees
    only rows whose `teacher` FK is themselves; full-access staff (admin /
    academic_manager / receptionist) see all. → scope_teacher_rows()
  * student-owned data (analytics-derived, recommendations) — reuse the academy
    student scopers, re-exported here so the support domain has one import site.
"""

# Re-exported from academy so support views import student/class scoping from a
# single place (never reach past this module into academy directly).
from apps.academy.scoping import (
    scoped_classes,
    scoped_student_or_404,
    scoped_students,
)

__all__ = [
    "scoped_classes",
    "scoped_students",
    "scoped_student_or_404",
    "scope_teacher_rows",
]


def scope_teacher_rows(request, queryset, *, teacher_field="teacher"):
    """Restrict a queryset of teacher-owned rows to those the requester may see.

    admin / academic_manager / receptionist → all rows;
    teacher                                 → only rows they own (via `teacher_field`);
    anyone else (student, public)           → nothing.

    Model-agnostic: works for any support model carrying a teacher FK
    (SupportBooking, TeacherAvailability, OfficeHour, …).
    """
    user = request.user
    if user.can_read_all_students:
        return queryset
    if user.is_teacher:
        return queryset.filter(**{teacher_field: user})
    return queryset.none()
