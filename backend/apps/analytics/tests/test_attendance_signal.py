"""
DSAT LMS v2 — Attendance risk-signal tests (5.2a)
Domain: Analytics
Covers: the attendance signal folds into risk_assessment / batch_risk_assessments
        (low attendance → red reason; good attendance → no attendance reason; no
        marks → signal omitted).
"""

import pytest

from apps.academy.models import Attendance, ClassEnrollment, ClassSession
from apps.academy.tests.factories import ClassFactory
from apps.analytics.services import batch_risk_assessments, risk_assessment
from apps.identity.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def _student_with_attendance(marks):
    """A student enrolled in a class, marked across len(marks) dated sessions."""
    teacher = UserFactory(role="teacher")
    klass = ClassFactory(teacher=teacher)
    student = UserFactory(role="student")
    ClassEnrollment.objects.create(
        klass=klass, student=student, status=ClassEnrollment.Status.ACTIVE
    )
    for i, status in enumerate(marks):
        session = ClassSession.objects.create(
            klass=klass, starts_at=f"2026-02-{i + 1:02d}T09:00:00Z"
        )
        Attendance.objects.create(session=session, student=student, status=status)
    return student


def _attendance_reason(risk):
    return next((r for r in risk["reasons"] if r["signal"] == "attendance"), None)


class TestAttendanceSignal:
    def test_low_attendance_is_red(self):
        # 1/4 present → 25% → red.
        student = _student_with_attendance(["present", "absent", "absent", "absent"])
        reason = _attendance_reason(risk_assessment(student))
        assert reason is not None and reason["level"] == "red"

    def test_good_attendance_no_reason(self):
        student = _student_with_attendance(["present", "present", "present", "late"])
        assert _attendance_reason(risk_assessment(student)) is None

    def test_no_marks_omits_signal(self):
        student = UserFactory(role="student")
        assert _attendance_reason(risk_assessment(student)) is None

    def test_excused_excluded_from_denominator(self):
        # 1 present + 3 excused → counted=1, attended=1 → 100% → no reason.
        student = _student_with_attendance(["present", "excused", "excused", "excused"])
        assert _attendance_reason(risk_assessment(student)) is None

    def test_batch_matches_single(self):
        student = _student_with_attendance(["absent", "absent", "present"])
        batch = batch_risk_assessments([student.id])[student.id]
        assert _attendance_reason(batch) is not None
