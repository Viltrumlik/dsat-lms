"""
DSAT LMS v2 — Announcement fan-out tests (5.2c)
Domain: Notifications
Covers: audience resolution, in-app + email delivery, idempotency, and that a
        channel failure records a failed delivery without aborting the run.
"""

import pytest

from apps.academy.models import ClassEnrollment
from apps.academy.tests.factories import ClassFactory
from apps.identity.tests.factories import UserFactory
from apps.notifications.announcements import send_announcement
from apps.notifications.models import Announcement, AnnouncementDelivery, Notification

pytestmark = pytest.mark.django_db


def _announce(audience_type, audience_ref="", channels=("in_app",)):
    return Announcement.objects.create(
        title="Heads up",
        body="Class is cancelled tomorrow.",
        audience_type=audience_type,
        audience_ref=audience_ref,
        channels=list(channels),
    )


class TestFanOut:
    def test_all_students_in_app(self):
        UserFactory(role="student")
        UserFactory(role="student")
        UserFactory(role="teacher")  # excluded
        a = _announce(Announcement.Audience.ALL_STUDENTS)
        result = send_announcement(a)
        assert result["sent"] == 2
        assert Notification.objects.filter(type=Notification.Type.ANNOUNCEMENT).count() == 2
        a.refresh_from_db()
        assert a.status == Announcement.Status.SENT and a.sent_at is not None

    def test_class_audience_only_enrolled(self):
        klass = ClassFactory()
        inside = UserFactory(role="student")
        ClassEnrollment.objects.create(
            klass=klass, student=inside, status=ClassEnrollment.Status.ACTIVE
        )
        UserFactory(role="student")  # not enrolled
        a = _announce(Announcement.Audience.CLASS, audience_ref=str(klass.id))
        assert send_announcement(a)["sent"] == 1
        assert AnnouncementDelivery.objects.filter(announcement=a).count() == 1

    def test_role_audience(self):
        UserFactory(role="teacher")
        UserFactory(role="student")
        a = _announce(Announcement.Audience.ROLE, audience_ref="teacher")
        assert send_announcement(a)["sent"] == 1

    def test_idempotent(self):
        UserFactory(role="student")
        a = _announce(Announcement.Audience.ALL_STUDENTS)
        send_announcement(a)
        before = AnnouncementDelivery.objects.count()
        second = send_announcement(a)
        assert second["sent"] == 0
        assert AnnouncementDelivery.objects.count() == before

    def test_email_without_address_fails_gracefully(self):
        # A student with a blank email → email delivery fails, but is recorded and
        # the run continues (in_app still succeeds).
        student = UserFactory(role="student")
        student.email = ""
        student.save(update_fields=["email"])
        a = _announce(Announcement.Audience.ALL_STUDENTS, channels=("in_app", "email"))
        result = send_announcement(a)
        assert result["sent"] == 1 and result["failed"] == 1
        assert AnnouncementDelivery.objects.filter(
            announcement=a, channel="email", status="failed"
        ).exists()

    def test_unknown_channel_skipped(self):
        UserFactory(role="student")
        a = _announce(Announcement.Audience.ALL_STUDENTS, channels=("in_app", "sms"))
        result = send_announcement(a)
        # sms has no registered deliverer → skipped, only in_app counts.
        assert result["sent"] == 1
        assert not AnnouncementDelivery.objects.filter(channel="sms").exists()
