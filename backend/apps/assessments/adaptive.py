"""
DSAT LMS v2 — Adaptive module routing
Domain: Assessments
Description: What `ExamTemplate.is_adaptive` finally does.

The field existed from the first migration: stored, editable in the Django admin,
published by three serializers — and read by nothing. An admin could tick
"adaptive" on a mock and the paper stayed exactly as static as before. On a
product that is meant to mirror the Digital SAT, that is the headline behaviour
of the real test missing behind a checkbox that says it is there.

The real thing: the first module of a subject is the same for everyone, and the
SECOND is chosen from how the first went — a lower and an upper form of the same
module, so a student who found module 1 hard is not handed the same difficulty
again, and one who found it easy is not left with a ceiling they hit in the first
ten minutes.

## Where the variants live

On `ExamQuestion.routing`, not on a second `ExamSection`. A section carries the
numbering, the clock, the break and the "Section 2, Module 1" label the runner
derives — duplicate the SECTION and every one of those has to learn which twin is
real. Duplicate the QUESTIONS inside one section and none of it changes: module 2
is one module either way, and which questions it contains is what depends on the
routing.

    routing=standard  served to everyone (and the only value a non-adaptive
                      paper ever has, which is why nothing below changes the
                      behaviour of an existing exam)
    routing=lower     served only to a student routed down
    routing=upper     served only to a student routed up

## When the decision is made, and why it is written down

Once, on the advance into the routed module, from the accuracy on the previous
module of the SAME subject. It is stored in `SessionModuleRouting` rather than
recomputed on read, for two reasons: recomputation would let a late write (the
`reconcile_session_answers` sweep) move a student between forms mid-module, and
grading has to count the questions a student was actually SHOWN — a recomputation
that disagreed with what was served would mark them on a module they never saw.

Storing it also means a teacher can be told why: the row keeps the accuracy the
decision was made on.
"""

from decimal import Decimal

from django.db import models

# Fraction of module 1 that must be correct to be routed up.
#
# The College Board does not publish its threshold, and it is not a fixed
# percentage there — module 2 is selected from a raw-score cut that varies by
# form. This is a representative, deterministic stand-in, in the same spirit as
# the scoring curve in scoring.py: pitched at roughly the middle of the score
# distribution, so a student around the median gets the harder form.
UPPER_THRESHOLD = Decimal("0.60")


class Routing(models.TextChoices):
    STANDARD = "standard", "Everyone"
    LOWER = "lower", "Lower form"
    UPPER = "upper", "Upper form"


VARIANTS = (Routing.LOWER, Routing.UPPER)


def section_is_routed(section) -> bool:
    """Whether this section has two forms to choose between.

    Derived from the questions rather than stored on the section: a flag could
    be true while the variant questions were never added, and then the runner
    would serve a module with nothing in it.
    """
    return any(eq.routing in VARIANTS for eq in section.exam_questions.all())


def module_accuracy(session, section) -> Decimal | None:
    """Fraction correct on `section`, from the responses as they stand.

    Computed, not read off `ExamResponse.is_correct`: on a paper that column is
    deliberately left null until submit, so that a student cannot learn anything
    from it mid-exam. Nothing is written here either — the marking still happens
    once, at submit.

    None when the section has no questions, which is not a score of zero.
    """
    # Lazy: services imports this module for grading, so a module-level import
    # would close the loop.
    from .services import answers_match

    exam_questions = [eq for eq in section.exam_questions.all() if eq.routing == Routing.STANDARD]
    if not exam_questions:
        return None

    responses = {
        r.question_id: r.chosen_answer
        for r in session.responses.filter(question_id__in=[eq.question_id for eq in exam_questions])
    }
    correct = sum(
        1
        for eq in exam_questions
        if answers_match(responses.get(eq.question_id) or "", eq.question.correct_answer)
    )
    return Decimal(correct) / Decimal(len(exam_questions))


def previous_module_section(session, section):
    """The section whose result decides `section` — the last one before it in the
    same subject. That is the SAT's own rule and needs no configuration."""
    return (
        session.exam.sections.filter(
            module=section.module, section_number__lt=section.section_number
        )
        .order_by("-section_number")
        .first()
    )


def routing_for(session, section):
    """The variant this session is on for `section`, deciding it if it has not been.

    Returns a `Routing` value, or None when the section is not routed (or the
    paper is not adaptive), which is the signal to serve it unchanged.
    """
    from .models import SessionModuleRouting

    if not session.exam.is_adaptive or not section_is_routed(section):
        return None

    existing = SessionModuleRouting.objects.filter(session=session, section=section).first()
    if existing:
        return existing.variant

    previous = previous_module_section(session, section)
    accuracy = module_accuracy(session, previous) if previous else None
    # No previous module to judge — the lower form is the safer default: a
    # student wrongly given the easier paper loses ceiling, one wrongly given the
    # harder paper loses the ability to show what they know.
    variant = (
        Routing.UPPER if accuracy is not None and accuracy >= UPPER_THRESHOLD else Routing.LOWER
    )
    SessionModuleRouting.objects.create(
        session=session,
        section=section,
        variant=variant,
        decided_on_accuracy=(
            (accuracy * 100).quantize(Decimal("0.01")) if accuracy is not None else None
        ),
    )
    return variant


def served_exam_questions(session, section, variant=None):
    """The ExamQuestions this session is actually shown for `section`.

    Everything standard, plus the variant's own — for a non-adaptive paper that
    is simply all of them, because every row is `standard`.
    """
    if variant is None:
        variant = decided_routing(session, section)
    allowed = {Routing.STANDARD} | ({variant} if variant else set())
    return [eq for eq in section.exam_questions.all() if eq.routing in allowed]


def decided_routing(session, section):
    """The variant already decided for `section`, without deciding one.

    Read-only on purpose: serializing a paper must not be what routes a student
    into a module they have not reached yet.
    """
    from .models import SessionModuleRouting

    row = SessionModuleRouting.objects.filter(session=session, section=section).first()
    return row.variant if row else None


def routed_question_ids(session):
    """Every question id this session is meant to see, across the whole paper.

    Used by grading, so a student is never marked on the form they were not
    given. Sections they never reached are included — an unreached module scores
    as omitted, which is what it is.
    """
    decided = {
        row.section_id: row.variant for row in session.routings.all()  # SessionModuleRouting
    }
    ids = []
    for section in session.exam.sections.prefetch_related("exam_questions"):
        variant = decided.get(section.id)
        allowed = {Routing.STANDARD} | ({variant} if variant else set())
        # A routed module never reached has no decision, so only its standard
        # questions count — which for a fully-routed module is none of them, and
        # correctly so: a student cannot omit what was never selected for them.
        ids.extend(eq.question_id for eq in section.exam_questions.all() if eq.routing in allowed)
    return ids
