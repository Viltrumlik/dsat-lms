"""
DSAT LMS v2 — Question-bank practice sets
Domain: Question Bank
Description: Turn a filter (categories · difficulty bands · skip-what-I've-done)
            into a real exam session, so a self-built drill runs in exactly the
            same engine as a past paper.

Why an ExamTemplate rather than a new kind of session: the runner, the timer,
auto-save, grading, the result card and the answer review all already exist and
all hang off ExamSession → ExamTemplate. A parallel "practice attempt" model
would mean reimplementing every one of them and keeping the two in step forever.
So a practice set builds a real (but `is_generated`) template owned by the
student who asked for it, and everything downstream just works. Generated
templates are hidden from the exam lists — nobody else is meant to find them.

The one thing practice does differently is FEEDBACK. On a paper you learn
nothing until you submit; drilling a skill is worthless without knowing straight
away. `ExamSession.feedback_mode = instant` opts a session into per-question
marking, and that is the only condition under which the answer endpoint tells
you anything (see assessments.views.SessionAnswerView).
"""

from __future__ import annotations

import random

from .models import Question, QuestionCategory
from .taxonomy import band_of, difficulties_for

# A drill is a sitting, not a syllabus — cap it so a student who ticks every box
# gets something they can actually finish.
MAX_QUESTIONS = 50
DEFAULT_QUESTIONS = 20


def descendant_ids(category_ids) -> set:
    """Every category at or under the given ones.

    Picking a domain means "anything in it", so a selection of
    "Algebra" has to resolve to its five skills as well. The tree is two deep by
    construction (domain → skill), so one extra query does it — no recursion.
    """
    ids = set(category_ids or [])
    if not ids:
        return ids
    children = QuestionCategory.objects.filter(parent_id__in=ids).values_list("id", flat=True)
    return ids | set(children)


def answered_question_ids(user, *, correct_only=False) -> set:
    """Questions this user has already answered, across every session of theirs.

    "Done" is deliberately account-wide rather than per-set: a student who got a
    question right in a mock has done it, and shouldn't meet it again the moment
    they open a drill.
    """
    from apps.assessments.models import ExamResponse

    responses = ExamResponse.objects.filter(session__user=user).exclude(chosen_answer="")
    if correct_only:
        responses = responses.filter(is_correct=True)
    return set(responses.values_list("question_id", flat=True))


def available_questions(user, *, category_ids=None, bands=None, exclude_done=False):
    """The published questions matching a practice filter."""
    queryset = Question.objects.filter(status=Question.Status.PUBLISHED)

    resolved = descendant_ids(category_ids)
    if resolved:
        queryset = queryset.filter(category_id__in=resolved)

    difficulties = difficulties_for(bands)
    if difficulties:
        queryset = queryset.filter(difficulty__in=difficulties)

    if exclude_done:
        queryset = queryset.exclude(id__in=answered_question_ids(user))

    return queryset


def category_counts(user):
    """Per-category totals for the picker: how many there are, how many are done.

    One pass over the user's answered ids and one over the published questions —
    the tree is small (8 domains, 24 skills), so this stays two queries however
    many categories exist.
    """
    done = answered_question_ids(user)
    correct = answered_question_ids(user, correct_only=True)

    rows = Question.objects.filter(status=Question.Status.PUBLISHED).values_list(
        "id", "category_id", "difficulty"
    )

    per_category: dict = {}
    for question_id, category_id, difficulty in rows:
        bucket = per_category.setdefault(
            category_id, {"total": 0, "done": 0, "correct": 0, "easy": 0, "medium": 0, "hard": 0}
        )
        bucket["total"] += 1
        if question_id in done:
            bucket["done"] += 1
        if question_id in correct:
            bucket["correct"] += 1
        bucket[band_of(difficulty)] += 1
    return per_category


def build_practice_exam(user, *, category_ids=None, bands=None, exclude_done=False, limit=None):
    """Materialise a practice set as a generated ExamTemplate + section.

    Returns (exam, question_count). Raises ValueError when the filter matches
    nothing — a session with no questions is a dead end, and saying so is far
    more useful than opening an empty paper.
    """
    from apps.assessments.models import ExamQuestion, ExamSection, ExamTemplate

    pool = list(
        available_questions(
            user, category_ids=category_ids, bands=bands, exclude_done=exclude_done
        ).values_list("id", "module")
    )

    if not pool:
        raise ValueError("No questions match that selection.")

    limit = min(int(limit or DEFAULT_QUESTIONS), MAX_QUESTIONS)
    random.shuffle(pool)
    chosen = pool[:limit]

    # A set spanning both subjects is a mixed drill; label it as such rather than
    # claiming to be a Math or an R&W paper.
    modules = {module for _, module in chosen}
    exam_module = modules.pop() if len(modules) == 1 else ExamTemplate.Module.FULL

    exam = ExamTemplate.objects.create(
        type=ExamTemplate.Type.PRACTICE,
        title=_title(category_ids, bands, len(chosen)),
        description="Generated from the question bank.",
        module=exam_module,
        time_limit=None,  # a drill is untimed; the point is to think, not to race
        access_level=ExamTemplate.AccessLevel.PUBLIC,
        allow_pause=True,
        is_generated=True,
        created_by=user,
    )
    section = ExamSection.objects.create(
        exam=exam,
        title="Practice",
        module=(
            exam_module
            if exam_module in (ExamSection.Module.MATH, ExamSection.Module.READING_WRITING)
            else ExamSection.Module.MATH
        ),
        section_number=1,
    )
    ExamQuestion.objects.bulk_create(
        [
            ExamQuestion(section=section, question_id=question_id, position=position)
            for position, (question_id, _) in enumerate(chosen, start=1)
        ]
    )
    return exam, len(chosen)


def _title(category_ids, bands, count) -> str:
    names = list(
        QuestionCategory.objects.filter(id__in=(category_ids or [])).values_list("name", flat=True)
    )
    if names:
        label = names[0] if len(names) == 1 else f"{names[0]} +{len(names) - 1}"
    else:
        label = "Mixed practice"
    band_label = f" ({', '.join(bands)})" if bands else ""
    return f"{label}{band_label} — {count} questions"


def cleanup_generated_exams(older_than):
    """Retire generated templates whose sessions are all finished and stale.

    They are one-shot scaffolding; without a sweep the template table grows by
    one row per drill forever. Only templates with no live session are touched,
    and the soft delete keeps finished sessions readable.
    """
    from apps.assessments.models import ExamSession, ExamTemplate

    stale = ExamTemplate.objects.filter(
        is_generated=True, created_at__lt=older_than, deleted_at__isnull=True
    ).exclude(sessions__status__in=(ExamSession.Status.IN_PROGRESS, ExamSession.Status.PAUSED))
    count = 0
    for exam in stale:
        exam.soft_delete()
        count += 1
    return count
