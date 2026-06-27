"""
DSAT LMS v2 — Question Bank Views
Domain: Question Bank
Description: Public browsing of the question bank — list (filter/search, cursor-
            paginated, newest-first), detail (study view with choices + answer),
            and the category/tag lists used to build filter UIs.
Permissions: IsAuthenticated (global default) — any registered user may browse.
             Only PUBLISHED, non-deleted questions are ever returned.
"""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter
from rest_framework.generics import ListAPIView, RetrieveAPIView

from common.responses import success_response

from .filters import QuestionFilter
from .models import Question, QuestionCategory, QuestionTag
from .serializers import (
    CategorySerializer,
    QuestionDetailSerializer,
    QuestionListSerializer,
    TagSerializer,
)


class QuestionListView(ListAPIView):
    """Cursor-paginated list of published questions (ordering fixed to newest-first)."""

    serializer_class = QuestionListSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_class = QuestionFilter
    search_fields = ["stem", "passage", "source_ref"]

    def get_queryset(self):
        return (
            Question.objects.filter(status=Question.Status.PUBLISHED)
            .select_related("category")
            .prefetch_related("tags")
        )


class QuestionDetailView(RetrieveAPIView):
    serializer_class = QuestionDetailSerializer

    def get_queryset(self):
        return (
            Question.objects.filter(status=Question.Status.PUBLISHED)
            .select_related("category")
            .prefetch_related("tags", "choices")
        )

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()  # 404 for missing/unpublished → enveloped NOT_FOUND
        return success_response(self.get_serializer(instance).data)


class CategoryListView(ListAPIView):
    """Full category tree (no pagination) for filter UIs; filterable by module/parent."""

    serializer_class = CategorySerializer
    pagination_class = None
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["module", "parent"]

    def get_queryset(self):
        return QuestionCategory.objects.all()

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        return success_response(self.get_serializer(queryset, many=True).data)


class TagListView(ListAPIView):
    serializer_class = TagSerializer
    pagination_class = None

    def get_queryset(self):
        return QuestionTag.objects.all()

    def list(self, request, *args, **kwargs):
        return success_response(self.get_serializer(self.get_queryset(), many=True).data)
