"""
DSAT LMS v2 — Assessment task tests
Domain: Assessments
Covers: abandon_stale_sessions — expired-timed sweep, inactivity sweep for
        paused/untimed sessions, and that live sessions are untouched.
"""

import datetime as dt

import pytest
from django.utils import timezone

from apps.assessments.models import ExamSession
from apps.assessments.tasks import abandon_stale_sessions
from apps.assessments.tests.factories import ExamSessionFactory, ExamTemplateFactory

pytestmark = pytest.mark.django_db


def backdate(session, *, started_days=0, updated_days=0):
    """Bypass auto_now/auto_now_add to age a session."""
    now = timezone.now()
    ExamSession.all_objects.filter(pk=session.pk).update(
        started_at=now - dt.timedelta(days=started_days),
        updated_at=now - dt.timedelta(days=updated_days),
    )
    session.refresh_from_db()


class TestAbandonStaleSessions:
    def test_expired_timed_session_is_abandoned(self):
        exam = ExamTemplateFactory(time_limit=30)
        session = ExamSessionFactory(exam=exam, status=ExamSession.Status.IN_PROGRESS)
        backdate(session, started_days=2, updated_days=2)

        assert abandon_stale_sessions() == 1
        session.refresh_from_db()
        assert session.status == ExamSession.Status.ABANDONED

    def test_active_session_is_untouched(self):
        exam = ExamTemplateFactory(time_limit=30)
        session = ExamSessionFactory(exam=exam, status=ExamSession.Status.IN_PROGRESS)

        assert abandon_stale_sessions() == 0
        session.refresh_from_db()
        assert session.status == ExamSession.Status.IN_PROGRESS

    def test_stale_paused_session_is_abandoned_after_a_week(self):
        exam = ExamTemplateFactory(time_limit=30)
        session = ExamSessionFactory(
            exam=exam, status=ExamSession.Status.PAUSED, paused_at=timezone.now()
        )
        backdate(session, started_days=8, updated_days=8)
        # Freeze the pause clock near the start so time remains on it.
        ExamSession.all_objects.filter(pk=session.pk).update(
            paused_at=timezone.now() - dt.timedelta(days=8) + dt.timedelta(minutes=5)
        )

        assert abandon_stale_sessions() == 1
        session.refresh_from_db()
        assert session.status == ExamSession.Status.ABANDONED

    def test_recently_paused_session_with_time_left_is_kept(self):
        exam = ExamTemplateFactory(time_limit=30)
        session = ExamSessionFactory(
            exam=exam, status=ExamSession.Status.PAUSED, paused_at=timezone.now()
        )
        backdate(session, started_days=2, updated_days=2)
        ExamSession.all_objects.filter(pk=session.pk).update(
            paused_at=timezone.now() - dt.timedelta(days=2) + dt.timedelta(minutes=5)
        )

        assert abandon_stale_sessions() == 0
        session.refresh_from_db()
        assert session.status == ExamSession.Status.PAUSED

    def test_stale_untimed_session_is_abandoned(self):
        exam = ExamTemplateFactory(time_limit=None)
        session = ExamSessionFactory(exam=exam, status=ExamSession.Status.IN_PROGRESS)
        backdate(session, started_days=8, updated_days=8)

        assert abandon_stale_sessions() == 1
        session.refresh_from_db()
        assert session.status == ExamSession.Status.ABANDONED

    def test_completed_session_is_never_touched(self):
        session = ExamSessionFactory(status=ExamSession.Status.COMPLETED)
        backdate(session, started_days=30, updated_days=30)

        assert abandon_stale_sessions() == 0
        session.refresh_from_db()
        assert session.status == ExamSession.Status.COMPLETED
