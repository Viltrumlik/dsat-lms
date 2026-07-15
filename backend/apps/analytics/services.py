"""
DSAT LMS v2 — Analytics services
Domain: Analytics
Description: Reusable per-user analytics computations shared by the student's own
            views (progress/summary) and the teacher surfaces (per-student
            drilldown, class overview, teacher dashboard).

            The "insight" helpers (homework_stats, improvement_trend, weak_topics,
            recent_score_estimate, risk_assessment) turn data the platform already
            collects into decisions — an at-risk signal with a human-readable "why".
            They add NO new models: everything is computed from existing rows.
"""

from django.db.models import Count, Max, Q, Sum
from django.utils import timezone

from .models import UserCategoryStat
from .serializers import CategoryStatSerializer

# ── Risk heuristic thresholds ────────────────────────────────────────────────
# Single source of truth (tests import these). Each signal is classified
# green/yellow/red; the overall level is worst-wins (§ risk_assessment).
RISK_HW_COMPLETION_RED = 50  # completion % below this → red
RISK_HW_COMPLETION_YELLOW = 75
RISK_ACCURACY_RED = 50  # overall accuracy % below this → red
RISK_ACCURACY_YELLOW = 65
RISK_TREND_DOWN_RED = -10  # accuracy delta (pts) at/below this → red
RISK_TREND_DOWN_YELLOW = -5
RISK_INACTIVE_RED_DAYS = 14  # days since last activity at/above this → red
RISK_INACTIVE_YELLOW_DAYS = 7
RISK_ATTENDANCE_RED = 60  # attendance rate % below this → red
RISK_ATTENDANCE_YELLOW = 80

# improvement_trend classification (up/down/flat)
TREND_UP = 5
TREND_DOWN = -5


# ── Student-facing rollups (unchanged public API) ────────────────────────────
def category_progress(user):
    """Serialized per-category stats for a user (module-ordered)."""
    stats = (
        UserCategoryStat.objects.filter(user=user)
        .select_related("category")
        .order_by("category__module", "category__name")
    )
    return CategoryStatSerializer(stats, many=True).data


def overall_summary(user):
    """A user's overall rollup: answered/correct, accuracy, exams completed, best."""
    agg = UserCategoryStat.objects.filter(user=user).aggregate(
        answered=Sum("total_answered"), correct=Sum("total_correct")
    )
    answered = agg["answered"] or 0
    correct = agg["correct"] or 0

    from apps.assessments.models import ExamResult

    results = ExamResult.objects.filter(user=user)
    best = results.aggregate(m=Max("accuracy_pct"))["m"]

    return {
        "total_answered": answered,
        "total_correct": correct,
        "overall_accuracy": round(correct / answered * 100, 2) if answered else 0.0,
        "exams_completed": results.count(),
        "best_exam_accuracy": float(best) if best is not None else None,
    }


# ── Insight helpers (teacher surfaces) ───────────────────────────────────────
def homework_stats(user):
    """The student's homework picture across classes they are ACTIVE-enrolled in.

    Denominator = published homeworks for those classes (NOT submission-row count:
    submission rows are created lazily when a student starts/submits). Numerator =
    submissions in status submitted|graded.
    """
    from apps.academy.models import ClassEnrollment
    from apps.homework.models import Homework, HomeworkSubmission

    active = ClassEnrollment.Status.ACTIVE
    submitted = HomeworkSubmission.Status.SUBMITTED
    graded = HomeworkSubmission.Status.GRADED

    assigned_qs = Homework.objects.filter(
        is_published=True,
        assigned_class__enrollments__student=user,
        assigned_class__enrollments__status=active,
    ).distinct()
    assigned = assigned_qs.count()

    sub_agg = HomeworkSubmission.objects.filter(
        student=user, homework__is_published=True
    ).aggregate(
        submitted=Count("id", filter=Q(status__in=[submitted, graded])),
        graded=Count("id", filter=Q(status=graded)),
    )
    n_submitted = sub_agg["submitted"] or 0  # includes graded
    n_graded = sub_agg["graded"] or 0

    completion = round(min(n_submitted / assigned * 100, 100), 2) if assigned else 0.0

    overdue_incomplete = (
        assigned_qs.filter(due_at__lt=timezone.now())
        .exclude(submissions__student=user, submissions__status__in=[submitted, graded])
        .distinct()
        .count()
    )

    return {
        "assigned": assigned,
        "submitted": n_submitted,
        "graded": n_graded,
        "completion_pct": completion,
        "overdue_incomplete": overdue_incomplete,
    }


def _trend_delta(accs, window=3):
    """accs = accuracy floats, most-recent-first. Compare the recent `w` vs the
    prior `w` (w shrinks when data is thin). Returns
    (delta|None, recent_avg|None, prior_avg|None, results_considered)."""
    w = min(window, len(accs) // 2)
    if w == 0:
        return None, None, None, len(accs)
    recent = accs[:w]
    prior = accs[w : 2 * w]
    recent_avg = round(sum(recent) / len(recent), 2)
    prior_avg = round(sum(prior) / len(prior), 2)
    return round(recent_avg - prior_avg, 2), recent_avg, prior_avg, 2 * w


def improvement_trend(user, window=3):
    """Recent-vs-prior accuracy delta from ExamResult (ordered by computed_at)."""
    from apps.assessments.models import ExamResult

    accs = [
        float(a)
        for a in ExamResult.objects.filter(user=user, accuracy_pct__isnull=False)
        .order_by("-computed_at")
        .values_list("accuracy_pct", flat=True)[: 2 * window]
    ]
    delta, recent_avg, prior_avg, considered = _trend_delta(accs, window)
    if delta is None:
        trend = "insufficient_data"
    elif delta > TREND_UP:
        trend = "up"
    elif delta < TREND_DOWN:
        trend = "down"
    else:
        trend = "flat"
    return {
        "recent_avg_accuracy": recent_avg,
        "prior_avg_accuracy": prior_avg,
        "delta_pct": delta,
        "trend": trend,
        "results_considered": considered,
    }


def weak_topics(user, limit=3, min_attempts=5):
    """Lowest-accuracy categories with a minimum-attempts floor (so a 1/1 topic
    doesn't dominate and a 0/8 does)."""
    stats = (
        UserCategoryStat.objects.filter(
            user=user, total_answered__gte=min_attempts, accuracy_pct__isnull=False
        )
        .select_related("category")
        .order_by("accuracy_pct")[:limit]
    )
    return [
        {
            "category_id": str(s.category_id),
            "category_name": s.category.name,
            "module": s.category.module,
            "accuracy_pct": float(s.accuracy_pct),
            "total_answered": s.total_answered,
        }
        for s in stats
    ]


def batch_weak_topics(user_ids, limit=3, min_attempts=5):
    """Grouped weak_topics for a cohort — a single ordered query bucketed per user
    in Python (avoids N+1 in the support-trigger sweep). Returns {user_id:
    [weak_topic, …]} with each user's `limit` lowest-accuracy categories that have
    at least `min_attempts` answers. Mirrors weak_topics() row-for-row."""
    user_ids = list(user_ids)
    if not user_ids:
        return {}
    per_user = {}
    for s in (
        UserCategoryStat.objects.filter(
            user_id__in=user_ids, total_answered__gte=min_attempts, accuracy_pct__isnull=False
        )
        .select_related("category")
        .order_by("user_id", "accuracy_pct")
    ):
        bucket = per_user.setdefault(s.user_id, [])
        if len(bucket) < limit:
            bucket.append(
                {
                    "category_id": str(s.category_id),
                    "category_name": s.category.name,
                    "module": s.category.module,
                    "accuracy_pct": float(s.accuracy_pct),
                    "total_answered": s.total_answered,
                }
            )
    return per_user


def recent_score_estimate(user, window=3):
    """Average of recent FULL-length mock/past-paper total scores. This is a
    descriptive recent-average, explicitly NOT a prediction/ML model."""
    from apps.assessments.models import ExamResult, ExamTemplate

    results = list(
        ExamResult.objects.filter(
            user=user,
            total_score__isnull=False,
            exam__type__in=[ExamTemplate.Type.MOCK, ExamTemplate.Type.PAST_PAPER],
            exam__module=ExamTemplate.Module.FULL,
        )
        .select_related("exam")
        .order_by("-computed_at")[:window]
    )
    if not results:
        return {
            "estimate": None,
            "based_on": 0,
            "method": "recent_average",
            "latest_total_score": None,
            "latest_math_score": None,
            "latest_rw_score": None,
        }
    scores = [r.total_score for r in results]
    latest = results[0]
    return {
        "estimate": round(sum(scores) / len(scores)),
        "based_on": len(scores),
        "method": "recent_average",
        "latest_total_score": latest.total_score,
        "latest_math_score": latest.math_score,
        "latest_rw_score": latest.rw_score,
    }


# ── Risk composition (single + batch share the same classifier) ──────────────
def _sig_hw_completion(pct):
    level = (
        "red"
        if pct < RISK_HW_COMPLETION_RED
        else "yellow" if pct < RISK_HW_COMPLETION_YELLOW else "green"
    )
    return {
        "signal": "homework_completion",
        "level": level,
        "value": round(pct, 2),
        "unit": "percent",
        "message": f"homework completion {round(pct)}%",
    }


def _sig_accuracy(acc):
    level = (
        "red" if acc < RISK_ACCURACY_RED else "yellow" if acc < RISK_ACCURACY_YELLOW else "green"
    )
    return {
        "signal": "accuracy",
        "level": level,
        "value": round(acc, 2),
        "unit": "percent",
        "message": f"accuracy {round(acc)}%",
    }


def _sig_trend(delta):
    level = (
        "red"
        if delta <= RISK_TREND_DOWN_RED
        else "yellow" if delta <= RISK_TREND_DOWN_YELLOW else "green"
    )
    return {
        "signal": "accuracy_trend",
        "level": level,
        "value": round(delta, 2),
        "unit": "percent_delta",
        "message": f"accuracy trend {round(delta):+d}%",
    }


def _sig_recency(days):
    level = (
        "red"
        if days >= RISK_INACTIVE_RED_DAYS
        else "yellow" if days >= RISK_INACTIVE_YELLOW_DAYS else "green"
    )
    return {
        "signal": "activity_recency",
        "level": level,
        "value": days,
        "unit": "days",
        "message": f"inactive {days} days",
    }


def _sig_attendance(rate):
    level = (
        "red"
        if rate < RISK_ATTENDANCE_RED
        else "yellow" if rate < RISK_ATTENDANCE_YELLOW else "green"
    )
    return {
        "signal": "attendance",
        "level": level,
        "value": rate,
        "unit": "pct",
        "message": f"attendance {rate}%",
    }


def _compose_risk(
    *,
    completion_pct,
    has_homework,
    overall_accuracy,
    has_accuracy,
    delta_pct,
    days_inactive,
    attendance_rate=None,
    has_attendance=False,
):
    """Classify the (up to four) signals and combine worst-wins: any red → red;
    else any yellow → yellow; else green. Only non-green signals become `reasons`
    (the UI joins them into the "why" sentence). Signals with no data are omitted.

    Phase 4B: attendance signal plugs in here — append one more classified dict
    (e.g. `{"signal": "attendance", ...}`) to `signals` with its own thresholds;
    the combination rule already generalizes over N signals, so the response shape
    does not change.
    """
    signals = []
    if has_homework:
        signals.append(_sig_hw_completion(completion_pct))
    if has_accuracy:
        signals.append(_sig_accuracy(overall_accuracy))
    if delta_pct is not None:
        signals.append(_sig_trend(delta_pct))
    if has_attendance and attendance_rate is not None:
        signals.append(_sig_attendance(attendance_rate))
    if days_inactive is not None:
        signals.append(_sig_recency(days_inactive))
    elif has_homework:
        # Enrolled with assigned work but no activity of any kind on record.
        signals.append(
            {
                "signal": "activity_recency",
                "level": "red",
                "value": None,
                "unit": "days",
                "message": "no activity recorded",
            }
        )

    reds = sum(1 for s in signals if s["level"] == "red")
    yellows = sum(1 for s in signals if s["level"] == "yellow")
    level = "red" if reds else "yellow" if yellows else "green"
    return {
        "level": level,
        "score": reds * 2 + yellows,
        "reasons": [s for s in signals if s["level"] != "green"],
    }


def risk_assessment(user, *, precomputed=None):
    """Green/yellow/red risk for one student, with the contributing reasons.

    `precomputed` (from the batch path) supplies the four signal values so this
    issues zero queries; otherwise it computes them itself (fine for the single
    student drilldown).
    """
    if precomputed is None:
        hw = homework_stats(user)
        summ = overall_summary(user)
        trend = improvement_trend(user)
        last = _last_activity(user)
        days_inactive = (timezone.now() - last).days if last is not None else None
        rate = _attendance_rates([user.id]).get(user.id)
        precomputed = {
            "completion_pct": hw["completion_pct"],
            "has_homework": hw["assigned"] > 0,
            "overall_accuracy": summ["overall_accuracy"],
            "has_accuracy": summ["total_answered"] > 0,
            "delta_pct": trend["delta_pct"],
            "days_inactive": days_inactive,
            "attendance_rate": rate,
            "has_attendance": rate is not None,
        }
    return _compose_risk(**precomputed)


def _last_activity(user):
    """Most recent of: homework submitted_at, category last_practiced_at, exam
    result computed_at. None if the student has no activity of any kind."""
    from apps.assessments.models import ExamResult
    from apps.homework.models import HomeworkSubmission

    hw = HomeworkSubmission.objects.filter(student=user).aggregate(m=Max("submitted_at"))["m"]
    cat = UserCategoryStat.objects.filter(user=user).aggregate(m=Max("last_practiced_at"))["m"]
    res = ExamResult.objects.filter(user=user).aggregate(m=Max("computed_at"))["m"]
    cands = [d for d in (hw, cat, res) if d is not None]
    return max(cands) if cands else None


def _attendance_rates(user_ids):
    """{user_id: attendance rate %} = (present + late) / (present + late + absent);
    excused is excluded from the denominator. None when a student has no counted
    marks (so the signal is omitted, not treated as 0%). One grouped query."""
    from apps.academy.models import Attendance

    counted_statuses = [Attendance.Status.PRESENT, Attendance.Status.LATE, Attendance.Status.ABSENT]
    attended_statuses = [Attendance.Status.PRESENT, Attendance.Status.LATE]
    out = {}
    for r in (
        Attendance.objects.filter(student_id__in=user_ids)
        .values("student_id")
        .annotate(
            counted=Count("id", filter=Q(status__in=counted_statuses)),
            attended=Count("id", filter=Q(status__in=attended_statuses)),
        )
    ):
        counted = r["counted"] or 0
        out[r["student_id"]] = round(r["attended"] / counted * 100, 1) if counted else None
    return out


def _batch_signals(user_ids):
    """Compute the four risk signals for a whole cohort in a fixed number of
    grouped queries (NOT per-student). Returns {user_id: precomputed-signal-dict}.
    """
    user_ids = list(user_ids)
    if not user_ids:
        return {}

    from apps.academy.models import ClassEnrollment
    from apps.assessments.models import ExamResult
    from apps.homework.models import Homework, HomeworkSubmission

    active = ClassEnrollment.Status.ACTIVE
    submitted = HomeworkSubmission.Status.SUBMITTED
    graded = HomeworkSubmission.Status.GRADED
    now = timezone.now()

    # 1) Overall accuracy per student.
    acc = {}
    for r in (
        UserCategoryStat.objects.filter(user_id__in=user_ids)
        .values("user_id")
        .annotate(answered=Sum("total_answered"), correct=Sum("total_correct"))
    ):
        answered = r["answered"] or 0
        acc[r["user_id"]] = round((r["correct"] or 0) / answered * 100, 2) if answered else None

    # 2) Homework denominator (published homeworks in the student's active classes)…
    denom = {
        r["assigned_class__enrollments__student_id"]: r["n"]
        for r in Homework.objects.filter(
            is_published=True,
            assigned_class__enrollments__student_id__in=user_ids,
            assigned_class__enrollments__status=active,
        )
        .values("assigned_class__enrollments__student_id")
        .annotate(n=Count("id", distinct=True))
    }
    # …and numerator (submitted-or-graded submissions on published homeworks).
    num = {
        r["student_id"]: r["n"]
        for r in HomeworkSubmission.objects.filter(
            student_id__in=user_ids, homework__is_published=True, status__in=[submitted, graded]
        )
        .values("student_id")
        .annotate(n=Count("id"))
    }

    # 3) Accuracy trend — one ordered scan, bucketed per student in Python.
    per_user_accs = {}
    for uid, a in (
        ExamResult.objects.filter(user_id__in=user_ids, accuracy_pct__isnull=False)
        .order_by("user_id", "-computed_at")
        .values_list("user_id", "accuracy_pct")
    ):
        per_user_accs.setdefault(uid, []).append(float(a))

    # 4) Activity recency — three grouped Max queries, merged in Python.
    hw_last = {
        r["student_id"]: r["m"]
        for r in HomeworkSubmission.objects.filter(student_id__in=user_ids)
        .values("student_id")
        .annotate(m=Max("submitted_at"))
    }
    cat_last = {
        r["user_id"]: r["m"]
        for r in UserCategoryStat.objects.filter(user_id__in=user_ids)
        .values("user_id")
        .annotate(m=Max("last_practiced_at"))
    }
    res_last = {
        r["user_id"]: r["m"]
        for r in ExamResult.objects.filter(user_id__in=user_ids)
        .values("user_id")
        .annotate(m=Max("computed_at"))
    }

    # 5) Attendance rate — one more grouped query.
    attendance = _attendance_rates(user_ids)

    out = {}
    for uid in user_ids:
        assigned = denom.get(uid, 0)
        completion = round(min(num.get(uid, 0) / assigned * 100, 100), 2) if assigned else 0.0
        overall_accuracy = acc.get(uid)
        cands = [
            d for d in (hw_last.get(uid), cat_last.get(uid), res_last.get(uid)) if d is not None
        ]
        last = max(cands) if cands else None
        out[uid] = {
            "completion_pct": completion,
            "has_homework": assigned > 0,
            "overall_accuracy": overall_accuracy if overall_accuracy is not None else 0.0,
            "has_accuracy": overall_accuracy is not None,
            "delta_pct": _trend_delta(per_user_accs.get(uid, []))[0],
            "days_inactive": (now - last).days if last is not None else None,
            "attendance_rate": attendance.get(uid),
            "has_attendance": attendance.get(uid) is not None,
        }
    return out


def batch_risk_assessments(user_ids):
    """{user_id: risk dict} for a cohort — ~7 grouped queries regardless of N."""
    return {uid: _compose_risk(**sig) for uid, sig in _batch_signals(user_ids).items()}


def batch_student_metrics(user_ids):
    """Per-student roster metrics for the class overview: risk + the raw figures
    the UI shows alongside the badge (accuracy, homework completion, inactivity)."""
    return {
        uid: {
            "overall_accuracy": sig["overall_accuracy"] if sig["has_accuracy"] else None,
            "homework_completion_pct": sig["completion_pct"] if sig["has_homework"] else None,
            "attendance_pct": sig["attendance_rate"] if sig["has_attendance"] else None,
            "days_inactive": sig["days_inactive"],
            "risk": _compose_risk(**sig),
        }
        for uid, sig in _batch_signals(user_ids).items()
    }
