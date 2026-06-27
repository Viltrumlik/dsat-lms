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
