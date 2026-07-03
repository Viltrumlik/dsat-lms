"""
DSAT LMS v2 — Analytics services
Domain: Analytics
Description: Reusable per-user analytics computations shared by the student's own
            views (progress/summary) and the teacher per-student drilldown.
"""

from django.db.models import Max, Sum

from .models import UserCategoryStat
from .serializers import CategoryStatSerializer


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
