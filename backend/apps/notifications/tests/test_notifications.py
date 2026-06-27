"""
DSAT LMS v2 — Notifications tests
Domain: Notifications
Covers: list (+ unread filter + isolation), unread count, mark one / all read,
        ownership, and that submitting an exam creates an exam_graded notification.
"""

import pytest

from apps.notifications.models import Notification
from apps.notifications.tests.factories import NotificationFactory

pytestmark = pytest.mark.django_db

BASE = "/api/v1/notifications/"


class TestList:
    def test_requires_auth(self, api_client):
        assert api_client.get(BASE).status_code == 401

    def test_lists_only_my_notifications(self, auth_client):
        NotificationFactory(user=auth_client.user)
        NotificationFactory(user=auth_client.user)
        NotificationFactory()  # someone else's
        r = auth_client.get(BASE)
        assert r.status_code == 200
        assert r.data["success"] is True
        assert len(r.data["data"]) == 2
        assert "pagination" in r.data["meta"]

    def test_unread_filter(self, auth_client):
        NotificationFactory(user=auth_client.user, is_read=True)
        NotificationFactory(user=auth_client.user, is_read=False)
        r = auth_client.get(BASE + "?unread=1")
        assert len(r.data["data"]) == 1
        assert r.data["data"][0]["is_read"] is False


class TestUnreadCount:
    def test_counts_unread(self, auth_client):
        NotificationFactory.create_batch(3, user=auth_client.user, is_read=False)
        NotificationFactory(user=auth_client.user, is_read=True)
        r = auth_client.get(BASE + "unread-count/")
        assert r.data["data"]["unread"] == 3


class TestMarkRead:
    def test_marks_one_read(self, auth_client):
        notification = NotificationFactory(user=auth_client.user, is_read=False)
        r = auth_client.post(f"{BASE}{notification.id}/read/", {}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["is_read"] is True
        notification.refresh_from_db()
        assert notification.is_read and notification.read_at is not None

    def test_cannot_read_others(self, auth_client):
        notification = NotificationFactory()  # other user
        assert (
            auth_client.post(f"{BASE}{notification.id}/read/", {}, format="json").status_code == 404
        )

    def test_mark_all_read(self, auth_client):
        NotificationFactory.create_batch(3, user=auth_client.user, is_read=False)
        r = auth_client.post(f"{BASE}read-all/", {}, format="json")
        assert r.data["data"]["marked_read"] == 3
        assert Notification.objects.filter(user=auth_client.user, is_read=False).count() == 0


class TestSubmitCreatesNotification:
    def test_submit_creates_exam_graded(self, auth_client):
        from apps.assessments.tests.factories import (
            ExamQuestionFactory,
            ExamSectionFactory,
            ExamTemplateFactory,
        )
        from apps.question_bank.tests.factories import QuestionFactory

        exam = ExamTemplateFactory(access_level="public", time_limit=30)
        section = ExamSectionFactory(exam=exam, section_number=1)
        question = QuestionFactory(correct_answer="A")
        ExamQuestionFactory(section=section, question=question, position=1)

        sid = auth_client.post("/api/v1/sessions/", {"exam": str(exam.id)}, format="json").data[
            "data"
        ]["id"]
        auth_client.post(f"/api/v1/sessions/{sid}/submit/", {}, format="json")

        notification = Notification.objects.filter(
            user=auth_client.user, type=Notification.Type.EXAM_GRADED
        ).first()
        assert notification is not None
        assert notification.data["session_id"] == sid
