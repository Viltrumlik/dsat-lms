"""
DSAT LMS v2 — Vocabulary student views
Domain: Vocabulary
Description: Browse published word lists, open a deck, and run flashcards over
    it. Mounted at /api/v1/vocabulary/.
Permissions: IsAuthenticated (global default) — word lists are open to every
    registered user, the same as the question bank. Progress is always the
    requester's own; there is no endpoint that reads anyone else's.
"""

from django.db.models import Count, Prefetch, Q
from django.utils import timezone
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from common.responses import created_response, success_response

from . import services
from .models import VocabSection, VocabSet, VocabStudySession, VocabWordProgress
from .serializers import (
    ReportSerializer,
    SectionDetailSerializer,
    SectionSerializer,
    SetDetailSerializer,
    StudySessionSerializer,
    WordSerializer,
)


def _published_sections():
    return VocabSection.objects.filter(status=VocabSection.Status.PUBLISHED)


def _mastered_word_ids(user):
    """Every word this student has mastered. One query, reused across the page."""
    return set(
        VocabWordProgress.objects.filter(
            user=user, status=VocabWordProgress.Status.MASTERED
        ).values_list("word_id", flat=True)
    )


def _annotate_sets(sets, mastered, completed_set_ids):
    """Hang the per-student numbers on rows that only carry content."""
    for vocab_set in sets:
        words = list(vocab_set.words.all())
        vocab_set.word_count = len(words)
        vocab_set.mastered_count = sum(1 for w in words if w.id in mastered)
        vocab_set.is_completed = vocab_set.id in completed_set_ids
    return sets


def _completed_set_ids(user):
    return set(
        VocabStudySession.objects.filter(user=user, completed_at__isnull=False).values_list(
            "vocab_set_id", flat=True
        )
    )


class SectionListView(APIView):
    """The shelf — every published list with how far the student has got."""

    def get(self, request):
        mastered = _mastered_word_ids(request.user)
        sections = list(
            _published_sections()
            .annotate(
                set_count=Count("sets", filter=Q(sets__deleted_at__isnull=True), distinct=True)
            )
            .prefetch_related(Prefetch("sets", queryset=VocabSet.objects.prefetch_related("words")))
        )
        for section in sections:
            words = [w for s in section.sets.all() for w in s.words.all()]
            section.word_count = len(words)
            section.mastered_count = sum(1 for w in words if w.id in mastered)
        return success_response(SectionSerializer(sections, many=True).data)


class SectionDetailView(APIView):
    """One list and its decks."""

    def get(self, request, pk):
        try:
            section = (
                _published_sections()
                .prefetch_related(
                    Prefetch("sets", queryset=VocabSet.objects.prefetch_related("words"))
                )
                .get(pk=pk)
            )
        except VocabSection.DoesNotExist:
            raise NotFound("Word list not found.") from None

        mastered = _mastered_word_ids(request.user)
        sets = _annotate_sets(list(section.sets.all()), mastered, _completed_set_ids(request.user))
        words = [w for s in sets for w in s.words.all()]
        section.set_count = len(sets)
        section.word_count = len(words)
        section.mastered_count = sum(1 for w in words if w.id in mastered)
        return success_response(SectionDetailSerializer(section).data)


def _visible_set_or_404(pk):
    try:
        return (
            VocabSet.objects.select_related("section")
            .prefetch_related("words")
            .get(pk=pk, section__status=VocabSection.Status.PUBLISHED)
        )
    except VocabSet.DoesNotExist:
        raise NotFound("Word set not found.") from None


class SetDetailView(APIView):
    """The deck, with every card and where the student stands on each."""

    def get(self, request, pk):
        vocab_set = _visible_set_or_404(pk)
        statuses = dict(
            VocabWordProgress.objects.filter(
                user=request.user, word__vocab_set=vocab_set
            ).values_list("word_id", "status")
        )
        mastered = {
            wid for wid, status in statuses.items() if status == VocabWordProgress.Status.MASTERED
        }
        _annotate_sets([vocab_set], mastered, _completed_set_ids(request.user))
        return success_response(SetDetailSerializer(vocab_set, context={"statuses": statuses}).data)


class SessionCreateView(APIView):
    """Start a flashcard run.

    A run is per-sitting, not per-set: opening the deck again is a new run, so
    "completed" means "cleared it at least once", never "has opened it".
    """

    def post(self, request):
        set_id = request.data.get("vocab_set")
        if not set_id:
            raise NotFound("Word set not found.")
        vocab_set = _visible_set_or_404(set_id)
        session = VocabStudySession.objects.create(user=request.user, vocab_set=vocab_set)
        return created_response(StudySessionSerializer(session).data)


def _owned_session(request, pk):
    try:
        return VocabStudySession.objects.get(pk=pk, user=request.user)
    except VocabStudySession.DoesNotExist:
        raise NotFound("Study session not found.") from None


class SessionReportView(APIView):
    """Fold in the verdicts the runner has collected so far.

    Reported as the student goes rather than at the end: someone who quits after
    twenty of twenty-five cards keeps those twenty verdicts.
    """

    def post(self, request, pk):
        session = _owned_session(request, pk)
        serializer = ReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        correct, total = services.record_results(request.user, serializer.validated_data["results"])
        session.correct_count += correct
        session.total_count += total
        session.save(update_fields=["correct_count", "total_count", "updated_at"])
        return success_response(StudySessionSerializer(session).data)


class SessionFinishView(APIView):
    def post(self, request, pk):
        session = _owned_session(request, pk)
        if session.completed_at is None:
            session.completed_at = timezone.now()
            session.save(update_fields=["completed_at", "updated_at"])
        return success_response(StudySessionSerializer(session).data)


class MyWordsView(APIView):
    """Everything the student is still learning, across every list.

    The one view that crosses sections: revision is not a per-deck activity.
    """

    def get(self, request):
        rows = VocabWordProgress.objects.filter(
            user=request.user, status=VocabWordProgress.Status.LEARNING
        ).select_related("word")[:200]
        words = [row.word for row in rows]
        statuses = {row.word_id: row.status for row in rows}
        return success_response(
            WordSerializer(words, many=True, context={"statuses": statuses}).data
        )
