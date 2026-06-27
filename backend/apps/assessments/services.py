"""
DSAT LMS v2 — Assessment Services
Domain: Assessments
Description: Server-authoritative timer helpers + session grading.

The server clock is the source of truth: time_remaining reported by the client is
only accepted if it does not exceed what the server computes (cheat detection).
"""

from decimal import Decimal

from django.utils import timezone

from .models import ExamQuestion, ExamResult, ExamSession
from .scoring import scaled_section_score

# Allowance for network/render latency when validating client-reported time.
TIME_GRACE_SECONDS = 5


def current_section(session):
    """The ExamSection matching the session's current_section number, if any."""
    return session.exam.sections.filter(section_number=session.current_section).first()


def server_time_remaining(session):
    """Seconds left per the server clock, or None for an untimed exam/section.

    Per-section: if the current section has its own time_limit, the clock runs from
    section_started_at (falling back to started_at). Otherwise the whole-exam limit
    applies. While paused, the clock is frozen at paused_at; resume shifts the start
    timestamps forward by the paused duration so paused time never counts.
    """
    section = current_section(session)
    if section and section.time_limit:
        limit_seconds = section.time_limit * 60
        start = session.section_started_at or session.started_at
    elif session.exam.time_limit:
        limit_seconds = session.exam.time_limit * 60
        start = session.started_at
    else:
        return None

    now = (
        session.paused_at
        if session.status == ExamSession.Status.PAUSED and session.paused_at
        else timezone.now()
    )
    return max(0, int(limit_seconds - (now - start).total_seconds()))


def is_expired(session) -> bool:
    remaining = server_time_remaining(session)
    return remaining is not None and remaining <= 0


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

        is_correct = (
            response.chosen_answer.strip().lower()
            == (question.correct_answer or "").strip().lower()
        )
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
