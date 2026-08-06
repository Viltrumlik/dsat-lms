"""
DSAT LMS v2 — Question-bank practice views
Domain: Question Bank
Description: The drill builder — what is available to practise, and starting a
            session from a selection.

Two endpoints:
    GET  /questions/practice/options/  the category tree with per-category
                                       total / done / correct counts and the
                                       difficulty spread — everything the picker
                                       needs, in one request
    POST /questions/practice/start/    build the set and open the session

Starting returns a full session-detail payload, identical in shape to
POST /sessions/, so the runner is entered in exactly the same way.
"""

from rest_framework import serializers
from rest_framework.views import APIView

from common.exceptions import ValidationError
from common.responses import created_response, success_response

from .models import QuestionCategory
from .practice import (
    MAX_QUESTIONS,
    available_questions,
    build_practice_exam,
    category_counts,
)
from .taxonomy import BANDS


class PracticeStartSerializer(serializers.Serializer):
    """What the picker sends.

    `mode` is the one field with teeth: it decides whether the session marks each
    answer as it is given. It is accepted HERE, at start, and written onto the
    session — never read again mid-run, so a paper cannot be talked into grading
    for the student.
    """

    categories = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    difficulties = serializers.ListField(
        child=serializers.ChoiceField(choices=sorted(BANDS)), required=False, default=list
    )
    exclude_done = serializers.BooleanField(required=False, default=False)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=MAX_QUESTIONS)
    mode = serializers.ChoiceField(choices=["instant", "exam"], required=False, default="instant")


class PracticeOptionsView(APIView):
    """Everything the picker renders: the tree, the counts, the caps."""

    def get(self, request):
        counts = category_counts(request.user)
        categories = (
            QuestionCategory.objects.all()
            .order_by("module", "sort_order", "name")
            .values("id", "module", "name", "parent_id", "sort_order")
        )

        # Domains carry their children's counts as well — picking a domain means
        # picking everything under it, so the number on it has to say so.
        rows = list(categories)
        by_parent: dict = {}
        for row in rows:
            if row["parent_id"]:
                by_parent.setdefault(row["parent_id"], []).append(row["id"])

        def stat(category_id, key):
            own = counts.get(category_id, {}).get(key, 0)
            return own + sum(
                counts.get(child, {}).get(key, 0) for child in by_parent.get(category_id, [])
            )

        payload = [
            {
                "id": str(row["id"]),
                "module": row["module"],
                "name": row["name"],
                "parent": str(row["parent_id"]) if row["parent_id"] else None,
                "total": stat(row["id"], "total"),
                "done": stat(row["id"], "done"),
                "correct": stat(row["id"], "correct"),
                "easy": stat(row["id"], "easy"),
                "medium": stat(row["id"], "medium"),
                "hard": stat(row["id"], "hard"),
            }
            for row in rows
        ]

        published = available_questions(request.user)
        return success_response(
            {
                "categories": payload,
                "total_questions": published.count(),
                "done_questions": sum(bucket["done"] for bucket in counts.values()),
                "correct_questions": sum(bucket["correct"] for bucket in counts.values()),
                "max_questions": MAX_QUESTIONS,
            }
        )


class PracticeStartView(APIView):
    """Build a set from the selection and open the session on it."""

    def post(self, request):
        from apps.assessments.models import ExamSession
        from apps.assessments.serializers import SessionDetailSerializer

        serializer = PracticeStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            exam, count = build_practice_exam(
                request.user,
                category_ids=data["categories"],
                bands=data["difficulties"],
                exclude_done=data["exclude_done"],
                limit=data.get("limit"),
            )
        except ValueError as exc:
            return ValidationError(str(exc), field="categories").to_response()

        session = ExamSession.objects.create(
            user=request.user,
            exam=exam,
            status=ExamSession.Status.IN_PROGRESS,
            feedback_mode=(
                ExamSession.FeedbackMode.INSTANT
                if data["mode"] == "instant"
                else ExamSession.FeedbackMode.NONE
            ),
        )
        payload = SessionDetailSerializer(session).data
        payload["question_count"] = count
        return created_response(payload)


class PracticePreviewView(APIView):
    """How many questions the current selection would yield.

    The picker calls this as boxes are ticked so a student knows what they are
    about to start before they start it.
    """

    def post(self, request):
        serializer = PracticeStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        matching = available_questions(
            request.user,
            category_ids=data["categories"],
            bands=data["difficulties"],
            exclude_done=data["exclude_done"],
        ).count()
        return success_response(
            {"matching": matching, "will_use": min(matching, data.get("limit") or MAX_QUESTIONS)}
        )
