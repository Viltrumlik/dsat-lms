"""
DSAT LMS v2 — Admin dashboard data layer (Phase 5.1)
Domain: Analytics (admin)
Description: The executive control-center's aggregation layer. `admin_dashboard_overview`
    composes LIVE platform KPIs, a "today" strip, an action-oriented ALERTS list
    (reusing the analytics risk engine over the active-enrolled cohort), a recent-
    activity feed (from the audit log), and a daily-flow trend series. The trend
    series is backed by `PlatformOpsDaily` (a backfillable rollup mirroring
    support/ops.py). Cross-app models are lazy-imported to keep analytics' import-time
    dependency one-way. Admin-only.

    NOTE: attendance-derived widgets ("classes today", "absent today") are omitted
    until the Classroom cluster (5.2) lands the attendance model — not faked here.
"""

import datetime as dt
from datetime import datetime
from datetime import time as dtime
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone

from .models import PlatformOpsDaily

# Daily flow counters carried into the trend series (zeros for a day with no row).
_DAILY_FIELDS = (
    "new_registrations",
    "exams_taken",
    "homework_submitted",
    "bookings_created",
    "tickets_created",
)
ROLLUP_TRAILING_DAYS = 7


def _day_bounds(target_date):
    """[start, end) aware datetimes spanning target_date in settings.TIME_ZONE."""
    tz = ZoneInfo(settings.TIME_ZONE)
    start = datetime.combine(target_date, dtime.min, tzinfo=tz)
    return start, start + dt.timedelta(days=1)


def build_platform_ops_daily(target_date):
    """Compute + upsert the PlatformOpsDaily flow row for `target_date`. Idempotent."""
    from apps.assessments.models import ExamResult
    from apps.homework.models import HomeworkSubmission
    from apps.identity.models import User
    from apps.support.models import SupportBooking, SupportTicket

    start, end = _day_bounds(target_date)

    def _count(manager, field):
        return manager.filter(**{f"{field}__gte": start, f"{field}__lt": end}).count()

    row, _ = PlatformOpsDaily.objects.update_or_create(
        date=target_date,
        defaults={
            "new_registrations": _count(User.objects, "created_at"),
            "exams_taken": _count(ExamResult.objects, "computed_at"),
            "homework_submitted": _count(HomeworkSubmission.objects, "submitted_at"),
            "bookings_created": _count(SupportBooking.objects, "created_at"),
            "tickets_created": _count(SupportTicket.objects, "created_at"),
        },
    )
    return row


def run_platform_ops_rollup(target_date=None):
    """Roll up a single date (default: today). Returns a summary for the task/command."""
    target_date = target_date or timezone.localdate()
    row = build_platform_ops_daily(target_date)
    return {"date": str(target_date), "new_registrations": row.new_registrations}


def rollup_recent(trailing_days=ROLLUP_TRAILING_DAYS):
    """Re-roll today + a trailing window (idempotent) so late-arriving rows land in
    the right day. Returns a summary."""
    today = timezone.localdate()
    for offset in range(trailing_days + 1):
        build_platform_ops_daily(today - dt.timedelta(days=offset))
    return {"through": today.isoformat(), "days": trailing_days + 1}


# ─────────────────────────────────────
# Live overview
# ─────────────────────────────────────


def _active_student_ids():
    from apps.academy.models import ClassEnrollment

    return list(
        ClassEnrollment.objects.filter(status=ClassEnrollment.Status.ACTIVE)
        .values_list("student_id", flat=True)
        .distinct()
    )


def _kpis():
    from apps.academy.models import Class
    from apps.assessments.models import ExamAssignment
    from apps.homework.models import HomeworkSubmission
    from apps.identity.models import User
    from apps.support.analytics_services import booking_metrics
    from apps.support.models import SupportBooking

    now = timezone.now()
    active_users = User.objects.filter(is_active=True, deleted_at__isnull=True)
    done = [HomeworkSubmission.Status.SUBMITTED, HomeworkSubmission.Status.GRADED]
    total_sub = HomeworkSubmission.objects.count()
    done_sub = HomeworkSubmission.objects.filter(status__in=done).count()

    return {
        "total_students": active_users.filter(role=User.Role.STUDENT).count(),
        "total_teachers": active_users.filter(role=User.Role.TEACHER).count(),
        "active_classes": Class.objects.filter(is_active=True).count(),
        "upcoming_exams": ExamAssignment.objects.filter(opens_at__gte=now).count(),
        # Assignment completion rate = submitted-or-graded / all submissions.
        "completion_rate": round(done_sub / total_sub * 100, 1) if total_sub else None,
        # Satisfaction = avg support-session rating (null, never 0.0, when unrated).
        "satisfaction": booking_metrics(SupportBooking.objects.all())["avg_rating"],
    }


def _today():
    from apps.assessments.models import ExamAssignment
    from apps.homework.models import Homework, HomeworkSubmission
    from apps.identity.models import User
    from apps.support.models import SupportBooking

    today = timezone.localdate()
    start, end = _day_bounds(today)
    now = timezone.now()

    return {
        "new_registrations": User.objects.filter(created_at__gte=start, created_at__lt=end).count(),
        "homework_due": Homework.objects.filter(
            is_published=True, due_at__gte=start, due_at__lt=end
        ).count(),
        "homework_submitted": HomeworkSubmission.objects.filter(
            submitted_at__gte=start, submitted_at__lt=end
        ).count(),
        "bookings": SupportBooking.objects.filter(
            scheduled_at__gte=start, scheduled_at__lt=end
        ).count(),
        "upcoming_exams_week": ExamAssignment.objects.filter(
            opens_at__gte=now, opens_at__lt=now + dt.timedelta(days=7)
        ).count(),
    }


def _alerts():
    """Action-oriented alerts, computed live. Returns [{kind, severity, count, url}]
    for each condition with count > 0 (the client renders localized text per kind)."""
    from apps.homework.models import HomeworkSubmission
    from apps.support.analytics_services import ticket_metrics
    from apps.support.models import SupportTicket

    from .services import batch_risk_assessments

    student_ids = _active_student_ids()
    risks = batch_risk_assessments(student_ids) if student_ids else {}
    at_risk = sum(1 for r in risks.values() if r["level"] == "red")
    inactive = sum(
        1
        for r in risks.values()
        if any(
            reason["signal"] == "activity_recency" and reason["level"] == "red"
            for reason in r["reasons"]
        )
    )
    ungraded = HomeworkSubmission.objects.filter(status=HomeworkSubmission.Status.SUBMITTED).count()
    open_tickets = ticket_metrics(SupportTicket.objects.all())["open"]

    candidates = [
        ("at_risk_students", "red", at_risk, "/admin/users?role=student"),
        ("inactive_students", "red", inactive, "/admin/users?role=student"),
        ("ungraded_submissions", "yellow", ungraded, "/admin/assignments"),
        ("open_tickets", "yellow", open_tickets, "/admin/support-ops"),
    ]
    return [
        {"kind": kind, "severity": sev, "count": count, "url": url}
        for kind, sev, count, url in candidates
        if count
    ]


def _recent_activity(limit=8):
    from apps.audit.models import ActivityLog
    from apps.audit.serializers_admin import ActivityLogSerializer

    rows = ActivityLog.objects.select_related("actor")[:limit]
    return ActivityLogSerializer(rows, many=True).data


def _trends(days):
    today = timezone.localdate()
    start_date = today - dt.timedelta(days=days - 1)
    rows = {
        r.date: r for r in PlatformOpsDaily.objects.filter(date__gte=start_date, date__lte=today)
    }
    series = []
    for i in range(days):
        d = start_date + dt.timedelta(days=i)
        row = rows.get(d)
        point = {f: (getattr(row, f) if row else 0) for f in _DAILY_FIELDS}
        point["date"] = d.isoformat()
        series.append(point)
    return series


def admin_dashboard_overview(days=30):
    """The full control-center payload in one call."""
    return {
        "kpis": _kpis(),
        "today": _today(),
        "alerts": _alerts(),
        "trends": _trends(days),
        "recent_activity": _recent_activity(),
    }
