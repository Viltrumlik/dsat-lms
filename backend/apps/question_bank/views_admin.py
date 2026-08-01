# apps/question_bank/views_admin.py
# Domain: Question Bank
# Description: Admin content studio — question authoring (CRUD, all statuses, inline
#             choices), the review lifecycle (submit / approve / reject), and
#             category/tag management. Mounted at /api/v1/admin/.
# Permissions: IsAdmin on every endpoint. Questions are NOT versioned: an edit
#             applies in place at any status and is live wherever the question is
#             used (every exam template, every exam type).

from django.db.models import Q
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from apps.audit.services import record_activity
from common.exceptions import ValidationError
from common.pagination import CursorPagination
from common.permissions import IsAdmin
from common.responses import created_response, no_content_response, success_response

from .models import Question, QuestionCategory, QuestionReview, QuestionTag
from .serializers_admin import (
    AdminCategorySerializer,
    AdminQuestionDetailSerializer,
    AdminQuestionListSerializer,
    AdminQuestionWriteSerializer,
    AdminTagSerializer,
    QuestionReviewSerializer,
    RejectSerializer,
)


def _get_question(pk):
    question = (
        Question.objects.select_related("category", "created_by", "reviewed_by")
        .prefetch_related("tags", "choices")
        .filter(pk=pk)
        .first()
    )
    if question is None:
        raise NotFound("Question not found.")
    return question


# ─────────────────────────────────────
# Questions
# ─────────────────────────────────────


class AdminQuestionListCreateView(APIView):
    """GET: filterable, cursor-paginated list (all statuses). POST: create a draft."""

    permission_classes = [IsAdmin]

    def get(self, request):
        qs = Question.objects.select_related("category").prefetch_related("tags")

        for param, field in (
            ("status", "status"),
            ("module", "module"),
            ("difficulty", "difficulty"),
        ):
            value = (request.query_params.get(param) or "").strip()
            if value:
                qs = qs.filter(**{field: value})

        category = (request.query_params.get("category") or "").strip()
        if category:
            qs = qs.filter(category_id=category)

        tag = (request.query_params.get("tag") or "").strip()
        if tag:
            qs = qs.filter(tags__slug__iexact=tag)

        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(stem__icontains=search)
                | Q(passage__icontains=search)
                | Q(source_ref__icontains=search)
            )

        qs = qs.distinct().order_by("-created_at")
        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(AdminQuestionListSerializer(page, many=True).data)

    def post(self, request):
        serializer = AdminQuestionWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        question = serializer.save()
        return created_response(AdminQuestionDetailSerializer(question).data)


class AdminQuestionDetailView(APIView):
    """GET / PATCH / DELETE (soft) a single question.

    PATCH edits in place at ANY status — including PUBLISHED. Exams reference
    questions by FK and nothing snapshots their content, so an edit is live
    immediately in every exam template and every exam type that uses it.
    """

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return success_response(AdminQuestionDetailSerializer(_get_question(pk)).data)

    def patch(self, request, pk):
        question = _get_question(pk)
        serializer = AdminQuestionWriteSerializer(
            question, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(AdminQuestionDetailSerializer(_get_question(pk)).data)

    def delete(self, request, pk):
        _get_question(pk).soft_delete()
        return no_content_response()


class AdminQuestionSubmitView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        question = _get_question(pk)
        try:
            question.submit_for_review()
        except ValueError as exc:
            return ValidationError(str(exc)).to_response()
        return success_response(AdminQuestionDetailSerializer(question).data)


class AdminQuestionApproveView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        question = _get_question(pk)
        try:
            question.approve(request.user)
        except ValueError as exc:
            return ValidationError(str(exc)).to_response()
        # approve() (unlike reject()) records no review row — add one for the history.
        QuestionReview.objects.create(
            question=question, reviewer=request.user, status=QuestionReview.Status.APPROVED
        )
        record_activity(
            actor=request.user,
            action="question.approved",
            target=question,
            summary="Approved question",
            request=request,
        )
        return success_response(AdminQuestionDetailSerializer(_get_question(pk)).data)


class AdminQuestionRejectView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        question = _get_question(pk)
        serializer = RejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            question.reject(request.user, serializer.validated_data["note"])
        except ValueError as exc:
            return ValidationError(str(exc)).to_response()
        record_activity(
            actor=request.user,
            action="question.rejected",
            target=question,
            summary="Rejected question",
            request=request,
            note=serializer.validated_data["note"][:255],
        )
        return success_response(AdminQuestionDetailSerializer(_get_question(pk)).data)


class AdminQuestionReviewsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        question = _get_question(pk)
        reviews = question.reviews.select_related("reviewer").all()
        return success_response(QuestionReviewSerializer(reviews, many=True).data)


# ─────────────────────────────────────
# Categories & Tags (reference data — small, unpaginated like the public lists)
# ─────────────────────────────────────


class AdminCategoryListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = QuestionCategory.objects.all()
        module = (request.query_params.get("module") or "").strip()
        if module:
            qs = qs.filter(module=module)
        return success_response(AdminCategorySerializer(qs, many=True).data)

    def post(self, request):
        serializer = AdminCategorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return created_response(serializer.data)


class AdminCategoryDetailView(APIView):
    permission_classes = [IsAdmin]

    def _get(self, pk):
        category = QuestionCategory.objects.filter(pk=pk).first()
        if category is None:
            raise NotFound("Category not found.")
        return category

    def get(self, request, pk):
        return success_response(AdminCategorySerializer(self._get(pk)).data)

    def patch(self, request, pk):
        serializer = AdminCategorySerializer(self._get(pk), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(serializer.data)

    def delete(self, request, pk):
        category = self._get(pk)
        if category.questions.exists() or category.children.exists():
            return ValidationError("Category is in use.").to_response()
        category.soft_delete()
        return no_content_response()


class AdminTagListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return success_response(AdminTagSerializer(QuestionTag.objects.all(), many=True).data)

    def post(self, request):
        serializer = AdminTagSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return created_response(serializer.data)


class AdminTagDetailView(APIView):
    permission_classes = [IsAdmin]

    def _get(self, pk):
        tag = QuestionTag.objects.filter(pk=pk).first()
        if tag is None:
            raise NotFound("Tag not found.")
        return tag

    def get(self, request, pk):
        return success_response(AdminTagSerializer(self._get(pk)).data)

    def patch(self, request, pk):
        serializer = AdminTagSerializer(self._get(pk), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(serializer.data)

    def delete(self, request, pk):
        tag = self._get(pk)
        if tag.questions.exists():
            return ValidationError("Tag is in use.").to_response()
        tag.soft_delete()
        return no_content_response()
