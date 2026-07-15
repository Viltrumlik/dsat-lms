"""
DSAT LMS v2 — Gradebook read-service (5.3a)
Domain: Academy
Description: Assemble a class's students × homework-items matrix in a fixed number
    of grouped queries (never per-student). Each cell resolves the grade by
    precedence: a manual grade wins; else the linked ExamSession's ExamResult
    accuracy; else none. Read-only — no gradebook table.
"""

from django.core.exceptions import ObjectDoesNotExist

from apps.identity.models import User

from .models import ClassEnrollment


def _resolve_grade(sub):
    """(grade, source) for a submission. source ∈ {manual, session, none}."""
    if sub.grade is not None:
        return float(sub.grade), "manual"
    if sub.session_id:
        try:
            result = sub.session.result  # select_related-populated reverse O2O
        except ObjectDoesNotExist:
            result = None
        if result is not None and result.accuracy_pct is not None:
            return float(result.accuracy_pct), "session"
    return None, "none"


def _cell(sub):
    if sub is None:
        return {"submission_id": None, "status": None, "grade": None, "grade_source": "none"}
    grade, source = _resolve_grade(sub)
    return {
        "submission_id": str(sub.id),
        "status": sub.status,
        "grade": grade,
        "grade_source": source,
    }


def class_gradebook(klass):
    """Return {items: [...homework columns...], rows: [{student, cells}]} for a class.
    Three grouped queries: students, homeworks, submissions (with the session result
    select_related so grade resolution issues no per-cell query)."""
    from apps.homework.models import Homework, HomeworkSubmission

    students = list(
        User.objects.filter(
            enrollments__klass=klass,
            enrollments__status=ClassEnrollment.Status.ACTIVE,
            deleted_at__isnull=True,
        )
        .distinct()
        .order_by("first_name", "last_name")
    )
    homeworks = list(
        Homework.objects.filter(assigned_class=klass, is_published=True).order_by("due_at")
    )
    hw_ids = [h.id for h in homeworks]
    student_ids = [s.id for s in students]

    subs = {}
    if hw_ids and student_ids:
        for s in HomeworkSubmission.objects.filter(
            homework_id__in=hw_ids, student_id__in=student_ids
        ).select_related("session__result"):
            subs[(s.student_id, s.homework_id)] = s

    rows = []
    for student in students:
        rows.append(
            {
                "student": {
                    "id": str(student.id),
                    "email": student.email,
                    "full_name": student.get_full_name(),
                },
                "cells": [_cell(subs.get((student.id, hw.id))) for hw in homeworks],
            }
        )

    items = [
        {
            "id": str(hw.id),
            "title": hw.title,
            "due_at": hw.due_at,
            "is_exam": hw.exam_id is not None,
        }
        for hw in homeworks
    ]
    return {"items": items, "rows": rows}
