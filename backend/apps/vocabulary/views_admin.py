"""
DSAT LMS v2 — Vocabulary admin views
Domain: Vocabulary (content studio)
Description: Author word lists — sections, the decks inside them, and the words
    inside those, plus a paste-a-list import. Mounted at /api/v1/admin/.
Permissions: IsAdmin on every view.
"""

from django.db.models import Count, Max, Q
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from common.exceptions import ValidationError
from common.permissions import IsAdmin
from common.responses import created_response, no_content_response, success_response

from .models import VocabSection, VocabSet, VocabWord
from .serializers import (
    AdminSectionSerializer,
    AdminSetSerializer,
    AdminWordSerializer,
    ImportSerializer,
)
from .services import WordListError, import_words


def _counted_sections():
    return VocabSection.objects.annotate(
        set_count=Count("sets", filter=Q(sets__deleted_at__isnull=True), distinct=True),
        word_count=Count(
            "sets__words",
            filter=Q(sets__deleted_at__isnull=True, sets__words__deleted_at__isnull=True),
            distinct=True,
        ),
    )


def _section_or_404(pk):
    try:
        return _counted_sections().get(pk=pk)
    except VocabSection.DoesNotExist:
        raise NotFound("Word list not found.") from None


def _set_or_404(pk):
    try:
        return VocabSet.objects.annotate(
            word_count=Count("words", filter=Q(words__deleted_at__isnull=True))
        ).get(pk=pk)
    except VocabSet.DoesNotExist:
        raise NotFound("Word set not found.") from None


class AdminSectionListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        sections = _counted_sections()
        search = request.query_params.get("search")
        if search:
            sections = sections.filter(title__icontains=search)
        status_filter = request.query_params.get("status")
        if status_filter:
            sections = sections.filter(status=status_filter)
        return success_response(AdminSectionSerializer(sections, many=True).data)

    def post(self, request):
        serializer = AdminSectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        section = serializer.save(created_by=request.user)
        return created_response(AdminSectionSerializer(_section_or_404(section.pk)).data)


class AdminSectionDetailView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return success_response(AdminSectionSerializer(_section_or_404(pk)).data)

    def patch(self, request, pk):
        section = _section_or_404(pk)
        serializer = AdminSectionSerializer(section, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(AdminSectionSerializer(_section_or_404(pk)).data)

    def delete(self, request, pk):
        _section_or_404(pk).soft_delete()
        return no_content_response()


class AdminSectionSetsView(APIView):
    """The decks in one list. Ordering is appended, never chosen by the author."""

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        section = _section_or_404(pk)
        sets = section.sets.annotate(
            word_count=Count("words", filter=Q(words__deleted_at__isnull=True))
        )
        return success_response(AdminSetSerializer(sets, many=True).data)

    def post(self, request, pk):
        section = _section_or_404(pk)
        serializer = AdminSetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        next_order = (section.sets.aggregate(top=Max("sort_order"))["top"] or 0) + 1
        vocab_set = serializer.save(section=section, sort_order=next_order)
        return created_response(AdminSetSerializer(_set_or_404(vocab_set.pk)).data)


class AdminSetDetailView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        vocab_set = _set_or_404(pk)
        serializer = AdminSetSerializer(vocab_set, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(AdminSetSerializer(_set_or_404(pk)).data)

    def delete(self, request, pk):
        _set_or_404(pk).soft_delete()
        return no_content_response()


class AdminSetWordsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        vocab_set = _set_or_404(pk)
        return success_response(AdminWordSerializer(vocab_set.words.all(), many=True).data)

    def post(self, request, pk):
        vocab_set = _set_or_404(pk)
        serializer = AdminWordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        next_order = (vocab_set.words.aggregate(top=Max("sort_order"))["top"] or 0) + 1
        word = serializer.save(vocab_set=vocab_set, sort_order=next_order)
        return created_response(AdminWordSerializer(word).data)


class AdminWordDetailView(APIView):
    permission_classes = [IsAdmin]

    def _word_or_404(self, pk):
        try:
            return VocabWord.objects.get(pk=pk)
        except VocabWord.DoesNotExist:
            raise NotFound("Word not found.") from None

    def patch(self, request, pk):
        word = self._word_or_404(pk)
        serializer = AdminWordSerializer(word, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(AdminWordSerializer(word).data)

    def delete(self, request, pk):
        self._word_or_404(pk).soft_delete()
        return no_content_response()


class AdminSetImportView(APIView):
    """Paste a word list in.

    The per-word form is for corrections. Nobody types six hundred words into it,
    so the import is the primary authoring path, not a convenience.
    """

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        vocab_set = _set_or_404(pk)
        serializer = ImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            created = import_words(vocab_set, serializer.validated_data["text"])
        except WordListError as exc:
            return ValidationError(str(exc), field="text").to_response()
        return success_response({"created": created, "word_count": vocab_set.words.count()})
