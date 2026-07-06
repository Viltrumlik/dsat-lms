"""
DSAT LMS v2 — Academy Celery tasks
Domain: Academy
Description: The weekly mentor check-in reminder (S6). Registered in
    CELERY_BEAT_SCHEDULE (config/settings/base.py) — runs weekly, so mentors get
    at most one nudge per week per overdue mentee.
"""

from celery import shared_task


@shared_task
def send_mentor_checkin_reminders(stale_days=7):
    """Notify mentors of active mentees they haven't checked in on within
    `stale_days` (or ever). Returns the count of reminders sent."""
    import datetime as dt

    from django.db.models import F, Max, Q
    from django.utils import timezone

    from apps.notifications.models import Notification
    from apps.notifications.services import notify

    from .models import StudentProfile

    cutoff = timezone.now() - dt.timedelta(days=stale_days)
    profiles = (
        StudentProfile.objects.filter(
            mentor__isnull=False,
            status=StudentProfile.LifecycleStatus.ACTIVE,
            user__deleted_at__isnull=True,
        )
        .select_related("mentor", "user")
        # Staleness is per the CURRENT mentor: a reassigned student's new mentor
        # must be nudged based on THEIR own last check-in, not a prior mentor's
        # (MentorAssignment is append-only, so old check-in rows survive reassign).
        .annotate(
            last_check_in=Max(
                "mentor_checkins__created_at",
                filter=Q(mentor_checkins__mentor=F("mentor")),
            )
        )
        .filter(Q(last_check_in__isnull=True) | Q(last_check_in__lt=cutoff))
    )
    sent = 0
    for profile in profiles:
        notify(
            profile.mentor,
            Notification.Type.MENTOR_CHECKIN_DUE,
            "Mentee check-in due",
            data={
                "url": "/teacher/mentees",
                "student_id": str(profile.user_id),
                "student_name": profile.user.get_full_name(),
            },
        )
        sent += 1
    return sent
