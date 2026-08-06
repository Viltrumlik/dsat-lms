"""
DSAT LMS v2 — Analytics Tasks
Domain: Analytics
Description: Async post-processing for exam results. Default task names
            (apps.analytics.tasks.*) match the CELERY_TASK_ROUTES "analytics" queue.

Note: ExamResult is imported lazily to keep the domain dependency one-way
      (analytics depends on assessments, never the reverse at import time).
"""

from decimal import Decimal

from celery import shared_task


def _percentile(at_or_below: int, total: int) -> Decimal:
    if total <= 1:
        return Decimal("100.00")
    return Decimal(str(round(at_or_below / total * 100, 2)))


@shared_task
def calculate_percentile(result_id):
    """Percentile = % of peers (same exam) scoring at or below this result's accuracy.

    Computed at submit so the score card has a number immediately. It is a
    snapshot of the cohort AS IT WAS at that second, which for the first student
    to sit a new paper means 100th percentile against nobody — so it is not the
    final word. `refresh_exam_percentiles` re-ranks the whole cohort nightly; see
    its docstring for why that is not optional.
    """
    from apps.assessments.models import ExamResult

    result = ExamResult.objects.filter(pk=result_id).select_related("exam").first()
    if result is None:
        return None

    peers = ExamResult.objects.filter(exam=result.exam)
    total = peers.count()
    at_or_below = (
        peers.filter(accuracy_pct__lte=result.accuracy_pct).count() if total > 1 else total
    )
    result.percentile = _percentile(at_or_below, total)
    result.save(update_fields=["percentile"])
    return float(result.percentile)


def rerank_exam(exam_id) -> int:
    """Re-rank every result for one exam in a single pass. Returns rows written.

    One query out, one bulk_update back — not one `calculate_percentile` per row,
    which would be two COUNTs per result and turn a popular paper into an O(n²)
    sweep.
    """
    from apps.assessments.models import ExamResult

    rows = list(
        ExamResult.objects.filter(exam_id=exam_id)
        .exclude(accuracy_pct__isnull=True)
        .values_list("id", "accuracy_pct", "percentile")
    )
    total = len(rows)
    if not total:
        return 0

    # Ties share a percentile: everyone on 70% counts as "at or below 70%", so
    # they must all rank identically. Walking the sorted list and only advancing
    # the rank when the accuracy actually changes is what gives that.
    rows.sort(key=lambda row: row[1])
    changed = []
    index = 0
    while index < total:
        end = index
        while end + 1 < total and rows[end + 1][1] == rows[index][1]:
            end += 1
        percentile = _percentile(end + 1, total)
        for row_id, _accuracy, current in rows[index : end + 1]:
            if current != percentile:
                changed.append(ExamResult(id=row_id, percentile=percentile))
        index = end + 1

    if changed:
        ExamResult.objects.bulk_update(changed, ["percentile"], batch_size=1000)
    return len(changed)


@shared_task
def refresh_exam_percentiles():
    """Nightly: re-rank every cohort, because a percentile decays where it stands.

    A percentile is a statement about a group, and the group keeps growing. The
    figure written at submit was true against the peers who existed at that
    second — so the first student to sit a paper is recorded at the 100th
    percentile forever, and the tenth is ranked against nine people while the
    hundredth is ranked against ninety-nine. Without this, the number on an old
    score card is not stale so much as measuring a different population from the
    one it claims to.

    Generated drills are skipped: each belongs to one student, so a "percentile"
    there compares them to themselves (the results page already hides it).
    """
    from apps.assessments.models import ExamResult

    exam_ids = (
        ExamResult.objects.filter(exam__is_generated=False)
        .values_list("exam_id", flat=True)
        .distinct()
    )
    return sum(rerank_exam(exam_id) for exam_id in exam_ids)


@shared_task
def update_category_stats(user_id):
    """Recompute the user's per-category stats from their graded responses."""
    from django.db.models import Count, Max, Q

    from apps.assessments.models import ExamResponse

    from .models import UserCategoryStat

    rows = (
        ExamResponse.objects.filter(session__user_id=user_id, is_correct__isnull=False)
        .values("question__category")
        .annotate(
            answered=Count("id"),
            correct=Count("id", filter=Q(is_correct=True)),
            last=Max("answered_at"),
        )
    )

    touched = 0
    for row in rows:
        answered = row["answered"]
        correct = row["correct"]
        accuracy = Decimal(str(round(correct / answered * 100, 2))) if answered else None
        UserCategoryStat.objects.update_or_create(
            user_id=user_id,
            category_id=row["question__category"],
            defaults={
                "total_answered": answered,
                "total_correct": correct,
                "accuracy_pct": accuracy,
                "last_practiced_at": row["last"],
            },
        )
        touched += 1
    return touched


@shared_task
def generate_platform_ops_daily():
    """Daily: re-roll the trailing window of platform flow metrics into
    PlatformOpsDaily for the admin dashboard trend chart (5.1). Idempotent."""
    from .admin_ops import rollup_recent

    return rollup_recent()
