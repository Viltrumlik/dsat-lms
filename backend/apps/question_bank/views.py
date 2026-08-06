"""
DSAT LMS v2 — Question Bank Views
Domain: Question Bank
Description: Public browsing of the question bank — list (filter/search, cursor-
            paginated, newest-first), detail (study view with choices + answer),
            and the category/tag lists used to build filter UIs.
Permissions: IsAuthenticated (global default) — any registered user may browse.
             Only PUBLISHED, non-deleted questions are ever returned.

ANSWER LEAK: the study view publishes correct_answer and explanation, which is
the whole point of it — and was also a hole straight through the test engine. The
runner is careful to serve questions without their answers, but nothing stopped a
student in a live exam opening a second tab and reading the key here, by the very
question id the runner had just handed them. Questions belonging to a paper the
requester currently has open are therefore locked (see _locked_question_ids).
"""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import BaseFilterBackend
from rest_framework.generics import ListAPIView, RetrieveAPIView

from common.exceptions import PermissionError as StudyLocked
from common.responses import success_response

from . import cache as taxonomy_cache
from .filters import QuestionFilter
from .models import Question, QuestionCategory, QuestionTag
from .practice import attempt_annotations
from .search import search_questions
from .serializers import (
    CategorySerializer,
    QuestionDetailSerializer,
    QuestionListSerializer,
    TagSerializer,
)


class QuestionSearchBackend(BaseFilterBackend):
    """`?search=` via search.search_questions.

    DRF's own SearchFilter is `icontains` and nothing else, which is a table scan
    per keystroke — see search.py. Same query parameter, same place in the filter
    chain; only the predicate changed.
    """

    search_param = "search"

    def filter_queryset(self, request, queryset, view):
        return search_questions(queryset, request.query_params.get(self.search_param))

    def get_schema_operation_parameters(self, view):
        return [
            {
                "name": self.search_param,
                "required": False,
                "in": "query",
                "description": "Full-text search over the stem, passage and source reference.",
                "schema": {"type": "string"},
            }
        ]


def _locked_question_ids(user):
    """Ids the given user must not see the answer to right now.

    Every question in every exam they have an in-progress or paused session on.
    Lazy import: question_bank sits BELOW assessments in the dependency order
    (identity → question_bank → assessments), so a module-level import here would
    invert it.
    """
    from apps.assessments.models import ExamQuestion, ExamSession

    live_exams = ExamSession.objects.filter(
        user=user,
        status__in=(ExamSession.Status.IN_PROGRESS, ExamSession.Status.PAUSED),
        # Only papers. A question-bank drill marks each answer as it is given,
        # so its answers are already on screen — locking the study view there
        # would block a student from the very thing they opened it for.
        feedback_mode=ExamSession.FeedbackMode.NONE,
    ).values_list("exam_id", flat=True)
    if not live_exams:
        return set()
    return set(
        ExamQuestion.objects.filter(section__exam_id__in=live_exams).values_list(
            "question_id", flat=True
        )
    )


class QuestionListView(ListAPIView):
    """Cursor-paginated list of published questions (ordering fixed to newest-first)."""

    serializer_class = QuestionListSerializer
    filter_backends = [DjangoFilterBackend, QuestionSearchBackend]
    filterset_class = QuestionFilter

    def get_queryset(self):
        return (
            Question.objects.filter(status=Question.Status.PUBLISHED)
            .select_related("category")
            .prefetch_related("tags")
            .annotate(**attempt_annotations(self.request.user))
        )

    def get_serializer_context(self):
        # One set for the whole page — the lock is per user, not per question.
        return {
            **super().get_serializer_context(),
            "locked_ids": _locked_question_ids(self.request.user),
        }


class QuestionDetailView(RetrieveAPIView):
    serializer_class = QuestionDetailSerializer

    def get_queryset(self):
        return (
            Question.objects.filter(status=Question.Status.PUBLISHED)
            .select_related("category")
            .prefetch_related("tags", "choices")
            .annotate(**attempt_annotations(self.request.user))
        )

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()  # 404 for missing/unpublished → enveloped NOT_FOUND
        if instance.id in _locked_question_ids(request.user):
            # 403, not 404: the question plainly exists — they are looking at it
            # in the runner. Hiding it would only be confusing.
            return StudyLocked(
                "This question is part of a test you have open. "
                "Finish the test to see the answer."
            ).to_response()
        return success_response(self.get_serializer(instance).data)


class CategoryListView(ListAPIView):
    """Full category tree (no pagination) for filter UIs; filterable by module/parent.

    Cached: it is the SAT taxonomy, it changes when someone edits the syllabus,
    and it is fetched on every load of the bank, the drill builder and the admin
    editor. The filter values go in the cache key — a cached "math only" tree
    served to someone asking for everything is a bug, not a saving.
    """

    serializer_class = CategorySerializer
    pagination_class = None
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["module", "parent"]

    def get_queryset(self):
        return QuestionCategory.objects.all()

    def list(self, request, *args, **kwargs):
        module = request.query_params.get("module") or "all"
        parent = request.query_params.get("parent") or "all"

        def build():
            queryset = self.filter_queryset(self.get_queryset())
            return self.get_serializer(queryset, many=True).data

        return success_response(taxonomy_cache.get_or_set(f"categories:{module}:{parent}", build))


class TagListView(ListAPIView):
    serializer_class = TagSerializer
    pagination_class = None

    def get_queryset(self):
        return QuestionTag.objects.all()

    def list(self, request, *args, **kwargs):
        return success_response(
            taxonomy_cache.get_or_set(
                "tags", lambda: self.get_serializer(self.get_queryset(), many=True).data
            )
        )
