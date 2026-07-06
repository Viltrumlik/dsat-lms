"""
DSAT LMS v2 — Academy services
Domain: Academy
Description: StudentProfile lifecycle + guardian helpers for the CRM person layer.
"""

from django.db import transaction
from django.utils import timezone

from .models import (
    ClassEnrollment,
    MentorAssignment,
    MentorCheckIn,
    ParentContactLog,
    StudentProfile,
)


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
        # Graduating/dropping a student also ends any active mentorship (S6).
        if profile.mentor_id is not None:
            _close_active_mentor(profile, by=by)
    return profile


# ─────────────────────────────────────
# Academic mentor (Phase 4 S6)
# ─────────────────────────────────────


def can_mentor(user, profile):
    """Whether `user` may view/act on this student's mentorship: the assigned
    mentor, or full-access staff (admin / academic_manager / receptionist)."""
    return profile.mentor_id == user.id or bool(getattr(user, "can_read_all_students", False))


def _close_active_mentor(profile, *, by=None):
    """End the active MentorAssignment and clear the profile's mentor mirror."""
    now = timezone.now()
    MentorAssignment.objects.filter(profile=profile, ended_at__isnull=True).update(
        ended_at=now, ended_by=by, updated_at=now
    )
    profile.mentor = None
    profile.mentor_assigned_at = None
    profile.mentor_assigned_by = None
    profile.save(update_fields=["mentor", "mentor_assigned_at", "mentor_assigned_by", "updated_at"])


def assign_mentor(profile, mentor, *, by=None):
    """Assign `mentor` to `profile` — closes any current mentorship, records a new
    MentorAssignment, mirrors it on the profile, and notifies the mentor. Raises
    ValueError('not_staff' | 'same_mentor')."""
    if not mentor.is_academy_staff:
        raise ValueError("not_staff")
    if profile.mentor_id == mentor.id:
        raise ValueError("same_mentor")

    now = timezone.now()
    with transaction.atomic():
        MentorAssignment.objects.filter(profile=profile, ended_at__isnull=True).update(
            ended_at=now, ended_by=by, updated_at=now
        )
        MentorAssignment.objects.create(profile=profile, mentor=mentor, assigned_by=by)
        profile.mentor = mentor
        profile.mentor_assigned_at = now
        profile.mentor_assigned_by = by
        profile.save(
            update_fields=["mentor", "mentor_assigned_at", "mentor_assigned_by", "updated_at"]
        )
    _notify_mentor_assigned(profile, mentor)
    return profile


def unassign_mentor(profile, *, by=None):
    """Remove the student's mentor (ends the active assignment). No-op if none."""
    _close_active_mentor(profile, by=by)
    return profile


def log_mentor_check_in(profile, mentor, note):
    """Record a mentor check-in note."""
    return MentorCheckIn.objects.create(profile=profile, mentor=mentor, note=note)


def log_parent_contact(profile, guardian, *, author, method, note=""):
    """Log a contact with a guardian. Raises ValueError('guardian_mismatch') if the
    guardian doesn't belong to this student's profile."""
    if guardian.profile_id != profile.id:
        raise ValueError("guardian_mismatch")
    return ParentContactLog.objects.create(
        profile=profile, guardian=guardian, author=author, method=method, note=note
    )


def _notify_mentor_assigned(profile, mentor):
    from apps.notifications.models import Notification
    from apps.notifications.services import notify

    notify(
        mentor,
        Notification.Type.MENTOR_ASSIGNED,
        "New mentee assigned",
        data={
            "url": "/teacher/mentees",
            "student_id": str(profile.user_id),
            "student_name": profile.user.get_full_name(),
        },
    )
