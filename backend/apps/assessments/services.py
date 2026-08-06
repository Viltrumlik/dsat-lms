"""
DSAT LMS v2 — Assessment Services
Domain: Assessments
Description: Server-authoritative timer helpers + session grading.

TIMER CONTRACT — the client never gets a say. It reports nothing about time and
it is told nothing it could profit from lying about; every clock below is derived
from timestamps the server stamped itself (started_at, section_started_at,
paused_at). The browser countdown is a display of the last server figure, not an
input to it.

Two independent clocks can apply to one session and BOTH bind:

    exam clock     ExamTemplate.time_limit, running from session.started_at
    section clock  ExamSection.time_limit, running from session.section_started_at

`server_time_remaining` is the tighter of the two, which is what gates every
write. They are exposed separately as well because they mean different things
when one runs out: a spent SECTION clock means "move on to the next module",
while a spent EXAM clock means "the paper is over". Collapsing them is what
previously left a student bricked — unable to answer and unable to advance.
"""

from decimal import Decimal
from fractions import Fraction

from django.utils import timezone

from .models import ExamQuestion, ExamResult, ExamSession
from .scoring import scaled_section_score

# Allowance for network/render latency when validating client-reported time.
TIME_GRACE_SECONDS = 5

# Ceiling on the auto-saved client blob (flags, notes, highlights, annotations).
# It is user-controlled text that goes straight into a JSONB column, so it needs
# a bound; ~256 KB is far more than a full 98-question paper of annotations.
MAX_CLIENT_SESSION_BYTES = 256 * 1024


def answers_match(chosen, correct) -> bool:
    """Whether a response matches the correct answer.

    Numeric answers (grid-ins) compare as exact rationals so equivalent forms all
    count: 7/2 == 3.5, .5 == 0.5, 36.0 == 36. Anything non-numeric (MCQ letters,
    text) falls back to case-insensitive string equality.
    """
    chosen = (chosen or "").strip()
    correct = (correct or "").strip()
    try:
        return Fraction(chosen) == Fraction(correct)
    except (ValueError, ZeroDivisionError):
        return chosen.lower() == correct.lower()


def current_section(session):
    """The ExamSection matching the session's current_section number, if any."""
    return session.exam.sections.filter(section_number=session.current_section).first()


def _clock_now(session):
    """The instant the clocks are read at.

    While paused the clock is frozen at paused_at; resume shifts the start
    timestamps forward by the paused span so paused time never counts.
    """
    if session.status == ExamSession.Status.PAUSED and session.paused_at:
        return session.paused_at
    return timezone.now()


def _remaining(session, limit_minutes, start):
    if not limit_minutes or start is None:
        return None
    return max(0, int(limit_minutes * 60 - (_clock_now(session) - start).total_seconds()))


def exam_time_remaining(session):
    """Seconds left on the whole-exam clock, or None if the exam is untimed."""
    return _remaining(session, session.exam.time_limit, session.started_at)


def section_time_remaining(session, section=None):
    """Seconds left on the current section's clock, or None if it is untimed.

    Section 1 has no section_started_at of its own — the paper's start IS its
    start — so it falls back to started_at.
    """
    if section is None:
        section = current_section(session)
    if section is None:
        return None
    return _remaining(session, section.time_limit, session.section_started_at or session.started_at)


def server_time_remaining(session):
    """The binding clock: the tighter of the section and whole-exam clocks.

    None only when neither applies (a genuinely untimed paper).
    """
    clocks = [
        c for c in (section_time_remaining(session), exam_time_remaining(session)) if c is not None
    ]
    return min(clocks) if clocks else None


def is_expired(session) -> bool:
    remaining = server_time_remaining(session)
    return remaining is not None and remaining <= 0


def exam_is_over(session) -> bool:
    """Whether the WHOLE paper is finished on the clock (not just this section)."""
    remaining = exam_time_remaining(session)
    return remaining is not None and remaining <= 0


def next_section_number(session):
    """The section a forward advance would land on, or None if this is the last."""
    return (
        session.exam.sections.filter(section_number__gt=session.current_section)
        .order_by("section_number")
        .values_list("section_number", flat=True)
        .first()
    )


def grade_session(session):
    """Grade every response, compute counts + per-category breakdown, upsert ExamResult.

    Scaled SAT scores (total/math/rw) are left null — they require official scaling
    tables and are computed in a later phase. Raw counts + accuracy are authoritative.
    """
    exam_questions = ExamQuestion.objects.filter(section__exam=session.exam).select_related(
        "question", "question__category"
    )
    responses = {r.question_id: r for r in session.responses.all()}

    correct = incorrect = skipped = total = 0
    categories = {}
    modules = {}  # module -> {correct, total} for scaled section scores

    for exam_question in exam_questions:
        total += 1
        question = exam_question.question
        bucket = categories.setdefault(
            str(question.category_id),
            {"name": question.category.name, "correct": 0, "total": 0},
        )
        bucket["total"] += 1
        module_bucket = modules.setdefault(question.module, {"correct": 0, "total": 0})
        module_bucket["total"] += 1

        response = responses.get(question.id)
        if response is None or not (response.chosen_answer or "").strip():
            skipped += 1
            if response is not None and response.is_correct is not None:
                response.is_correct = None
                response.save(update_fields=["is_correct"])
            continue

        is_correct = answers_match(response.chosen_answer, question.correct_answer)
        response.is_correct = is_correct
        response.save(update_fields=["is_correct"])
        if is_correct:
            correct += 1
            bucket["correct"] += 1
            module_bucket["correct"] += 1
        else:
            incorrect += 1

    for bucket in categories.values():
        bucket["accuracy"] = (
            round(bucket["correct"] / bucket["total"] * 100, 2) if bucket["total"] else 0.0
        )

    # Scaled section scores (200–800) and SAT total (400–1600 for a full test).
    math = modules.get("math", {"correct": 0, "total": 0})
    rw = modules.get("reading_writing", {"correct": 0, "total": 0})
    math_score = scaled_section_score(math["correct"], math["total"]) if math["total"] else None
    rw_score = scaled_section_score(rw["correct"], rw["total"]) if rw["total"] else None
    section_scores = [s for s in (math_score, rw_score) if s is not None]
    total_score = sum(section_scores) if section_scores else None

    accuracy = Decimal(str(round(correct / total * 100, 2))) if total else Decimal("0.00")
    time_spent = int((timezone.now() - session.started_at).total_seconds())

    result, _ = ExamResult.objects.update_or_create(
        session=session,
        defaults={
            "user": session.user,
            "exam": session.exam,
            "total_score": total_score,
            "math_score": math_score,
            "rw_score": rw_score,
            "total_correct": correct,
            "total_incorrect": incorrect,
            "total_skipped": skipped,
            "total_questions": total,
            "accuracy_pct": accuracy,
            "time_spent_secs": time_spent,
            "score_breakdown": {"categories": categories},
        },
    )
    return result
