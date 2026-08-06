"""
DSAT LMS v2 — Announcement delivery (5.2c)
Domain: Notifications
Description: Resolve an announcement's audience and fan it out over a PLUGGABLE
    channel layer. `CHANNELS` maps a channel key → a deliver(announcement, user)
    function; SMS/Telegram/push drop in here later without touching the fan-out.
    The in-app channel reuses notify() (so students render announcements in the
    existing feed); email uses the same backend as auth mail. Delivery is idempotent
    — a re-run skips (announcement, user, channel) rows already recorded.
"""

import logging

from django.utils import timezone

from .models import Announcement, AnnouncementDelivery, Notification

logger = logging.getLogger(__name__)


def _audience_users(announcement):
    """The live User queryset an announcement targets (active, non-soft-deleted)."""
    from apps.identity.models import User

    a = announcement
    base = User.objects.filter(is_active=True, deleted_at__isnull=True)
    if a.audience_type == Announcement.Audience.ALL_STUDENTS:
        return base.filter(role=User.Role.STUDENT)
    if a.audience_type == Announcement.Audience.ALL_STAFF:
        return base.filter(
            role__in=[
                User.Role.TEACHER,
                User.Role.RECEPTIONIST,
                User.Role.ACADEMIC_MANAGER,
                User.Role.ADMIN,
            ]
        )
    if a.audience_type == Announcement.Audience.ROLE:
        return base.filter(role=a.audience_ref)
    if a.audience_type == Announcement.Audience.CLASS:
        from apps.academy.models import ClassEnrollment

        student_ids = ClassEnrollment.objects.filter(
            klass_id=a.audience_ref, status=ClassEnrollment.Status.ACTIVE
        ).values_list("student_id", flat=True)
        return base.filter(id__in=student_ids)
    return User.objects.none()


def _deliver_in_app(announcement, user):
    from .services import notify

    notify(
        user,
        Notification.Type.ANNOUNCEMENT,
        announcement.title,
        announcement.body,
        data={"announcement_id": str(announcement.id)},
    )


def _deliver_email(announcement, user):
    """Through the mailer, never `send_mail` directly.

    An announcement is the single biggest way to waste an email allowance —
    one click, one row per student, and a suppressed or bounced address written
    to again for every announcement forever. Routing it through the outbox gets
    it the suppression list and the daily cap for free.

    `send_quietly` because nobody is waiting on a broadcast: a recipient over
    quota is a suppressed row to look at later, not an exception that aborts the
    fan-out for everyone after them.
    """
    if not user.email:
        raise ValueError("no email address")
    from apps.mailer import service
    from apps.mailer.models import EmailMessage

    service.send_quietly(
        user.email,
        announcement.title,
        announcement.body,
        kind=EmailMessage.Kind.ANNOUNCEMENT,
        user=user,
    )


# The pluggable channel registry — add "sms"/"telegram"/"push" here later.
CHANNELS = {
    "in_app": _deliver_in_app,
    "email": _deliver_email,
}


def send_announcement(announcement):
    """Fan out to the resolved audience over the announcement's channels. Idempotent
    (skips already-recorded deliveries); records a delivery row per attempt. Marks
    the announcement sent. Returns {sent, failed}."""
    sent = failed = 0
    existing = {
        (d.user_id, d.channel)
        for d in AnnouncementDelivery.objects.filter(announcement=announcement)
    }
    for user in _audience_users(announcement).iterator():
        for channel in announcement.channels:
            deliver = CHANNELS.get(channel)
            if deliver is None or (user.id, channel) in existing:
                continue
            status, error = AnnouncementDelivery.Status.SENT, ""
            try:
                deliver(announcement, user)
            except Exception as exc:  # a bad address / channel error must not abort the run
                status, error = AnnouncementDelivery.Status.FAILED, str(exc)[:255]
                logger.warning("announcement %s → %s failed: %s", announcement.id, user.id, exc)
            AnnouncementDelivery.objects.create(
                announcement=announcement, user=user, channel=channel, status=status, error=error
            )
            if status == AnnouncementDelivery.Status.SENT:
                sent += 1
            else:
                failed += 1

    announcement.status = Announcement.Status.SENT
    announcement.sent_at = timezone.now()
    announcement.save(update_fields=["status", "sent_at", "updated_at"])
    return {"sent": sent, "failed": failed}
