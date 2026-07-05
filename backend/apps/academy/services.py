"""
DSAT LMS v2 — Academy services
Domain: Academy
Description: StudentProfile lifecycle + guardian helpers for the CRM person layer.
"""

from django.utils import timezone

from .models import ClassEnrollment, StudentProfile


def get_or_create_student_profile(user):
    """The student's CRM profile, created lazily on first access (status=ACTIVE,
    enrolled_at = when the account was created)."""
    profile, _ = StudentProfile.objects.get_or_create(
        user=user,
        defaults={
            "status": StudentProfile.LifecycleStatus.ACTIVE,
            "enrolled_at": user.created_at,
        },
    )
    return profile


# Allowed lifecycle transitions. graduated/dropped are near-terminal but may be
# re-activated; you can't jump graduated→frozen etc.
_ALLOWED_TRANSITIONS = {
    StudentProfile.LifecycleStatus.ACTIVE: {"frozen", "graduated", "dropped"},
    StudentProfile.LifecycleStatus.FROZEN: {"active", "graduated", "dropped"},
    StudentProfile.LifecycleStatus.GRADUATED: {"active"},
    StudentProfile.LifecycleStatus.DROPPED: {"active"},
}

_DEACTIVATING = {
    StudentProfile.LifecycleStatus.GRADUATED,
    StudentProfile.LifecycleStatus.DROPPED,
}


def change_student_status(profile, new_status, *, by=None):
    """Move a student to a new lifecycle status (guarded), stamping when. Moving to
    graduated/dropped deactivates their ACTIVE class enrollments; re-activation
    leaves enrollments untouched (staff re-enrolls). Raises ValueError('same_status'
    | 'invalid_transition') on a rejected move."""
    current = profile.status
    if new_status == current:
        raise ValueError("same_status")
    if new_status not in _ALLOWED_TRANSITIONS.get(current, set()):
        raise ValueError("invalid_transition")

    profile.status = new_status
    profile.status_changed_at = timezone.now()
    profile.status_changed_by = by
    profile.save(update_fields=["status", "status_changed_at", "status_changed_by", "updated_at"])

    if new_status in _DEACTIVATING:
        # Bulk .update() skips auto_now, so refresh updated_at explicitly.
        ClassEnrollment.objects.filter(
            student=profile.user, status=ClassEnrollment.Status.ACTIVE
        ).update(status=ClassEnrollment.Status.INACTIVE, updated_at=timezone.now())
    return profile
