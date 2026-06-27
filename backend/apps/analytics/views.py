"""
DSAT LMS v2 — Analytics Views
Domain: Analytics
Description: Per-user progress + overall summary (any authenticated user), and an
            academy-only rankings leaderboard.
Permissions: IsAuthenticated (global). Rankings additionally require has_full_access.
"""

from django.db.models import Max, Sum
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import APIView

from common.responses import success_response

from .models import UserCategoryStat
from .serializers import CategoryStatSerializer

RANKINGS_LIMIT = 50


class ProgressView(APIView):
    """The current user's per-category stats."""

    def get(self, request):
        stats = (
            UserCategoryStat.objects.filter(user=request.user)
            .select_related("category")
            .order_by("category__module", "category__name")
        )
        return success_response(CategoryStatSerializer(stats, many=True).data)


class SummaryView(APIView):
    """The current user's overall rollup."""

    def get(self, request):
        agg = UserCategoryStat.objects.filter(user=request.user).aggregate(
            answered=Sum("total_answered"), correct=Sum("total_correct")
        )
        answered = agg["answered"] or 0
        correct = agg["correct"] or 0

        from apps.assessments.models import ExamResult

        results = ExamResult.objects.filter(user=request.user)
        best = results.aggregate(m=Max("accuracy_pct"))["m"]

        return success_response(
            {
                "total_answered": answered,
                "total_correct": correct,
                "overall_accuracy": round(correct / answered * 100, 2) if answered else 0.0,
                "exams_completed": results.count(),
                "best_exam_accuracy": float(best) if best is not None else None,
            }
        )


class RankingsView(APIView):
    """Academy leaderboard — top users by overall accuracy."""

    def get(self, request):
        if not request.user.has_full_access:
            raise PermissionDenied("Rankings are available to academy members only.")

        rows = (
            UserCategoryStat.objects.values("user")
            .annotate(answered=Sum("total_answered"), correct=Sum("total_correct"))
            .filter(answered__gt=0)
        )
        ranking = [
            {
                "user_id": row["user"],
                "answered": row["answered"],
                "accuracy": round(row["correct"] / row["answered"] * 100, 2),
            }
            for row in rows
        ]
        ranking.sort(key=lambda r: (-r["accuracy"], -r["answered"]))
        top = ranking[:RANKINGS_LIMIT]

        from apps.identity.models import User

        names = dict(
            User.objects.filter(id__in=[r["user_id"] for r in top]).values_list("id", "first_name")
        )
        data = [
            {
                "rank": index + 1,
                "name": names.get(row["user_id"], "—"),
                "accuracy": row["accuracy"],
                "total_answered": row["answered"],
                "is_me": str(row["user_id"]) == str(request.user.id),
            }
            for index, row in enumerate(top)
        ]
        return success_response(data)
