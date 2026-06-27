"""
DSAT LMS v2 — Assessment Services
Domain: Assessments
Description: Server-authoritative timer helpers + session grading.

The server clock is the source of truth: time_remaining reported by the client is
only accepted if it does not exceed what the server computes (cheat detection).
"""

from decimal import Decimal

from django.utils import timezone

from .models import ExamQuestion, ExamResult

# Allowance for network/render latency when validating client-reported time.
TIME_GRACE_SECONDS = 5


def server_time_remaining(session):
    """Seconds left per the server clock, or None for an untimed exam."""
    limit = session.exam.time_limit
    if not limit:
        return None
    elapsed = (timezone.now() - session.started_at).total_seconds()
    return max(0, int(limit * 60 - elapsed))


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

    for exam_question in exam_questions:
        total += 1
        question = exam_question.question
        bucket = categories.setdefault(
            str(question.category_id),
            {"name": question.category.name, "correct": 0, "total": 0},
        )
        bucket["total"] += 1

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
        else:
            incorrect += 1

    for bucket in categories.values():
        bucket["accuracy"] = (
            round(bucket["correct"] / bucket["total"] * 100, 2) if bucket["total"] else 0.0
        )

    accuracy = Decimal(str(round(correct / total * 100, 2))) if total else Decimal("0.00")
    time_spent = int((timezone.now() - session.started_at).total_seconds())

    result, _ = ExamResult.objects.update_or_create(
        session=session,
        defaults={
            "user": session.user,
            "exam": session.exam,
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
