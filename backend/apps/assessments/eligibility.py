"""
DSAT LMS v2 — Session start eligibility
Domain: Assessments
Description: Everything that must be true before a student may open a paper.

This module exists because the rules it enforces were, until now, written down
in three places and enforced in none:

  * ``PUBLIC_PRACTICE_TEST_LIMIT_PER_WEEK`` / ``PUBLIC_PAST_PAPER_LIMIT`` were
    declared in settings and read by nobody — public users had unlimited access
    to content the product describes as limited.
  * ``ExamAssignment.opens_at`` / ``closes_at`` / ``max_attempts`` were stored,
    validated on write, surfaced in the admin — and never once consulted on the
    way in. An assigned midterm could be sat early, late, and repeatedly.
  * Nothing stopped a student holding several live sessions on the SAME paper.
    That is the cheapest timer exploit there is: every new session starts a fresh
    clock, so a student could open a mock five times and keep the best run. We
    now hand back the session they already have instead of minting another.

Attempts are counted over sessions that reached a terminal state plus any that
are still live, so abandoning a paper does not buy a free retry.
"""

from __future__ import annotations

import datetime as dt

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from .models import ExamAssignment, ExamSession, ExamTemplate

LIVE_STATUSES = (ExamSession.Status.IN_PROGRESS, ExamSession.Status.PAUSED)
# An abandoned paper still consumed an attempt — otherwise "close the tab" is a
# free reroll on any capped assessment.
SPENT_STATUSES = (
    ExamSession.Status.COMPLETED,
    ExamSession.Status.ABANDONED,
    *LIVE_STATUSES,
)


class NotEligibleError(Exception):
    """Raised with a student-facing reason why this paper cannot be started."""

    def __init__(self, message: str, code: str = "EXAM_NOT_AVAILABLE"):
        super().__init__(message)
        self.message = message
        self.code = code


def live_session_for(user, exam: ExamTemplate):
    """The session this user already has open on this paper, if any."""
    return (
        ExamSession.objects.filter(user=user, exam=exam, status__in=LIVE_STATUSES)
        .order_by("-created_at")
        .first()
    )


def _assignments_for(user, exam: ExamTemplate):
    """Assignments of this exam targeting this user, directly or via a class."""
    targets_user = Q(assigned_student=user) | Q(
        assigned_class__enrollments__student=user,
        assigned_class__enrollments__status="active",
        assigned_class__enrollments__deleted_at__isnull=True,
    )
    return ExamAssignment.objects.filter(targets_user, exam=exam, deleted_at__isnull=True)


def _check_assignment_window(user, exam: ExamTemplate):
    """Enforce opens_at / closes_at / max_attempts for an ASSIGNED paper.

    Returns the assignment the session should be filed under, or None when the
    exam is not assigned to this user at all (an open practice paper).

    An exam can be assigned more than once (a class assignment plus a personal
    one). We take the most permissive open window, which is what a student would
    expect when a teacher grants them an individual extension.
    """
    assignments = list(_assignments_for(user, exam).distinct())
    if not assignments:
        return None

    now = timezone.now()
    open_now = [a for a in assignments if a.opens_at <= now <= a.closes_at]
    if not open_now:
        upcoming = [a for a in assignments if a.opens_at > now]
        if upcoming:
            opens = min(a.opens_at for a in upcoming)
            raise NotEligibleError(
                f"This test opens on {opens:%d %b %Y, %H:%M}.",
                code="EXAM_NOT_OPEN_YET",
            )
        raise NotEligibleError("This test is closed.", code="EXAM_CLOSED")

    # Cheapest-to-satisfy first: the assignment with the most attempts allowed.
    open_now.sort(key=lambda a: a.max_attempts, reverse=True)
    assignment = open_now[0]

    used = ExamSession.objects.filter(user=user, exam=exam, status__in=SPENT_STATUSES).count()
    if used >= assignment.max_attempts:
        raise NotEligibleError(
            f"You have used all {assignment.max_attempts} attempt(s) for this test.",
            code="EXAM_ATTEMPTS_EXHAUSTED",
        )
    return assignment


def _check_public_quota(user, exam: ExamTemplate):
    """Free-tier caps for users without academy access.

    Practice tests are capped per rolling week; past papers are capped for the
    lifetime of the account. Both numbers come from settings so they can be
    tuned without a deploy.
    """
    if user.has_full_access:
        return

    if exam.type == ExamTemplate.Type.PRACTICE:
        limit = getattr(settings, "PUBLIC_PRACTICE_TEST_LIMIT_PER_WEEK", 0)
        if not limit:
            return
        since = timezone.now() - dt.timedelta(days=7)
        used = ExamSession.objects.filter(
            user=user,
            exam__type=ExamTemplate.Type.PRACTICE,
            status__in=SPENT_STATUSES,
            created_at__gte=since,
        ).count()
        if used >= limit:
            raise NotEligibleError(
                f"Free accounts can start {limit} practice tests per week. "
                "Join the academy for unlimited access.",
                code="PRACTICE_LIMIT_REACHED",
            )

    elif exam.type == ExamTemplate.Type.PAST_PAPER:
        limit = getattr(settings, "PUBLIC_PAST_PAPER_LIMIT", 0)
        if not limit:
            return
        used = (
            ExamSession.objects.filter(
                user=user,
                exam__type=ExamTemplate.Type.PAST_PAPER,
                status__in=SPENT_STATUSES,
            )
            .values("exam_id")
            .distinct()
            .count()
        )
        if used >= limit:
            raise NotEligibleError(
                f"Free accounts can open {limit} past papers. "
                "Join the academy for the full archive.",
                code="PAST_PAPER_LIMIT_REACHED",
            )


def check_can_start(user, exam: ExamTemplate):
    """Gate a start request. Returns the ExamAssignment to file under, or None.

    Raises NotEligibleError with a student-facing message when the paper is barred.
    Access level is checked by the caller (it is a 403, not a 400).
    """
    _check_public_quota(user, exam)
    return _check_assignment_window(user, exam)
