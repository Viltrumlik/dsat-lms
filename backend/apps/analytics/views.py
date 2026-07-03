"""
DSAT LMS v2 — Analytics Views
Domain: Analytics
Description: Per-user progress + overall summary (any authenticated user), and an
            academy-only rankings leaderboard.
Permissions: IsAuthenticated (global). Rankings additionally require has_full_access.
"""

from django.db.models import Sum
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import APIView

from common.responses import success_response

from .models import UserCategoryStat
from .services import category_progress, overall_summary

RANKINGS_LIMIT = 50


class ProgressView(APIView):
    """The current user's per-category stats."""

    def get(self, request):
        return success_response(category_progress(request.user))


class SummaryView(APIView):
    """The current user's overall rollup."""

    def get(self, request):
        return success_response(overall_summary(request.user))


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
