"""
DSAT LMS v2 — Notification task tests
Domain: Notifications
Covers: homework due-soon reminders — 24h window, submitted students skipped,
        dedupe on re-run, structured data payload.
"""

import datetime as dt

import pytest
from django.utils import timezone

from apps.academy.models import ClassEnrollment
from apps.academy.tests.factories import ClassFactory
from apps.homework.models import HomeworkSubmission
from apps.homework.tests.factories import HomeworkFactory
from apps.identity.tests.factories import UserFactory
from apps.notifications.models import Notification
from apps.notifications.tasks import send_homework_due_reminders

pytestmark = pytest.mark.django_db


def enrolled_student(klass):
    student = UserFactory(role="student")
    ClassEnrollment.objects.create(
        klass=klass, student=student, status=ClassEnrollment.Status.ACTIVE
    )
    return student


class TestHomeworkDueReminders:
    def test_reminds_assigned_student_within_window(self):
        klass = ClassFactory()
        student = enrolled_student(klass)
        homework = HomeworkFactory(
            assigned_class=klass, due_at=timezone.now() + dt.timedelta(hours=6)
        )

        assert send_homework_due_reminders() == 1

        notification = Notification.objects.get(user=student)
        assert notification.type == "homework_due"
        assert notification.data["homework_id"] == str(homework.id)
        assert notification.data["homework_title"] == homework.title
        assert notification.data["class_name"] == klass.name

    def test_rerun_is_deduped(self):
        klass = ClassFactory()
        enrolled_student(klass)
        HomeworkFactory(assigned_class=klass, due_at=timezone.now() + dt.timedelta(hours=6))

        assert send_homework_due_reminders() == 1
        assert send_homework_due_reminders() == 0
        assert Notification.objects.count() == 1

    def test_skips_submitted_student(self):
        klass = ClassFactory()
        student = enrolled_student(klass)
        homework = HomeworkFactory(
            assigned_class=klass, due_at=timezone.now() + dt.timedelta(hours=6)
        )
        HomeworkSubmission.objects.create(
            homework=homework,
            student=student,
            status=HomeworkSubmission.Status.SUBMITTED,
            submitted_at=timezone.now(),
        )

        assert send_homework_due_reminders() == 0

    def test_skips_homework_outside_window(self):
        klass = ClassFactory()
        enrolled_student(klass)
        HomeworkFactory(assigned_class=klass, due_at=timezone.now() + dt.timedelta(days=3))
        HomeworkFactory(assigned_class=klass, due_at=timezone.now() - dt.timedelta(hours=1))

        assert send_homework_due_reminders() == 0
