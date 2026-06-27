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


@shared_task
def calculate_percentile(result_id):
    """Percentile = % of peers (same exam) scoring at or below this result's accuracy."""
    from apps.assessments.models import ExamResult

    result = ExamResult.objects.filter(pk=result_id).select_related("exam").first()
    if result is None:
        return None

    peers = ExamResult.objects.filter(exam=result.exam)
    total = peers.count()
    if total <= 1:
        percentile = Decimal("100.00")
    else:
        at_or_below = peers.filter(accuracy_pct__lte=result.accuracy_pct).count()
        percentile = Decimal(str(round(at_or_below / total * 100, 2)))

    result.percentile = percentile
    result.save(update_fields=["percentile"])
    return float(percentile)


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
