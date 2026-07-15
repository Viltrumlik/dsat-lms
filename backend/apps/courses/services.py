"""
DSAT LMS v2 — Courses services
Domain: Courses
Description: Slug generation, position assignment, and reorder-as-permutation
    helpers (active rows only, soft-delete-aware). Mirrors the shift-by-offset
    reorder in assessments/views_admin.py but scoped to active rows.
"""

from django.db import transaction
from django.db.models import Count, F, Max
from django.utils.text import slugify

# Positions temporarily shift into this band during a reorder so the swap never
# collides with the (parent, position) partial-unique constraint mid-update.
_REORDER_OFFSET = 100000


def unique_course_slug(title, *, exclude_pk=None):
    """A slug unique among ACTIVE courses (soft-deleted slugs are free to reuse)."""
    from .models import Course

    base = slugify(title)[:300] or "course"
    slug = base
    n = 2
    qs = Course.objects.all()
    if exclude_pk is not None:
        qs = qs.exclude(pk=exclude_pk)
    while qs.filter(slug=slug).exists():
        slug = f"{base}-{n}"
        n += 1
    return slug


def next_position(queryset):
    """Next append position among active rows of the given queryset."""
    return (queryset.aggregate(m=Max("position"))["m"] or 0) + 1


@transaction.atomic
def reorder(queryset, ordered_ids):
    """Apply an explicit permutation of `ordered_ids` to `queryset` rows' positions.

    `ordered_ids` must be exactly the active rows' ids (any order). Positions are
    first shifted out of the 1..N band to dodge the partial-unique constraint, then
    reassigned 1..N in the requested order. Raises ValueError on a mismatch.
    """
    existing = list(queryset.values_list("id", flat=True))
    if sorted(str(i) for i in ordered_ids) != sorted(str(i) for i in existing):
        raise ValueError("order must list exactly the current items.")
    model = queryset.model
    queryset.update(position=F("position") + _REORDER_OFFSET)
    for index, obj_id in enumerate(ordered_ids, start=1):
        model.objects.filter(pk=obj_id).update(position=index)


# ─────────────────────────────────────
# Progress (cohort completion)
# ─────────────────────────────────────
def course_lesson_ids(course):
    """Active lesson ids for a course (active units only) — the completion denominator."""
    from .models import Lesson

    return list(
        Lesson.objects.filter(unit__course=course, unit__deleted_at__isnull=True).values_list(
            "id", flat=True
        )
    )


def assignment_cohort_ids(assignment):
    """The user ids an assignment targets: a class's active, live students, or the one
    assigned student. Filters soft-deleted / inactive users (the User plain manager
    does not, so we filter explicitly)."""
    from apps.academy.models import ClassEnrollment

    if assignment.assigned_student_id:
        return [assignment.assigned_student_id]
    if assignment.assigned_class_id:
        return list(
            ClassEnrollment.objects.filter(
                klass_id=assignment.assigned_class_id,
                status=ClassEnrollment.Status.ACTIVE,
                student__deleted_at__isnull=True,
                student__is_active=True,
            ).values_list("student_id", flat=True)
        )
    return []


def assignment_progress(assignment):
    """Per-student completion for an assignment's cohort — completed/total/pct.
    Constant number of queries regardless of cohort size (no N+1)."""
    from apps.identity.models import User

    from .models import LessonProgress

    lesson_ids = course_lesson_ids(assignment.course)
    total = len(lesson_ids)
    student_ids = assignment_cohort_ids(assignment)
    if not student_ids:
        return []

    completed_by = {}
    if lesson_ids:
        rows = (
            LessonProgress.objects.filter(
                lesson_id__in=lesson_ids,
                student_id__in=student_ids,
                status=LessonProgress.Status.COMPLETED,
            )
            .values("student_id")
            .annotate(n=Count("id"))
        )
        completed_by = {r["student_id"]: r["n"] for r in rows}

    users = User.objects.filter(id__in=student_ids)
    out = []
    for u in users:
        done = completed_by.get(u.id, 0)
        out.append(
            {
                "student": {"id": str(u.id), "full_name": u.get_full_name(), "email": u.email},
                "completed": done,
                "total": total,
                "pct": round(done / total * 100, 1) if total else 0.0,
            }
        )
    out.sort(key=lambda r: r["pct"])
    return out


# ─────────────────────────────────────
# Student visibility + progress
# ─────────────────────────────────────
def visible_course_qs(user):
    """Published courses assigned to `user` — via an active class enrollment or an
    individual assignment — whose open window has started (opens_at null or past).
    A closed window (past closes_at) stays visible for review."""
    from django.db.models import Q
    from django.utils import timezone

    from apps.academy.models import ClassEnrollment

    from .models import Course, CourseAssignment

    now = timezone.now()
    class_ids = ClassEnrollment.objects.filter(
        student=user, status=ClassEnrollment.Status.ACTIVE
    ).values_list("klass_id", flat=True)
    assigned_course_ids = (
        CourseAssignment.objects.filter(
            Q(assigned_student=user) | Q(assigned_class_id__in=class_ids)
        )
        .filter(Q(opens_at__isnull=True) | Q(opens_at__lte=now))
        .values_list("course_id", flat=True)
    )
    return Course.objects.filter(
        id__in=assigned_course_ids, status=Course.Status.PUBLISHED
    ).distinct()


def student_course_completion(user, course_ids):
    """Map course_id → {completed, total, pct} for a student, in grouped queries."""
    from django.db.models import Count

    from .models import Lesson, LessonProgress

    # Total published lessons per course (active units).
    totals = {
        r["unit__course_id"]: r["n"]
        for r in Lesson.objects.filter(
            unit__course_id__in=course_ids, unit__deleted_at__isnull=True
        )
        .values("unit__course_id")
        .annotate(n=Count("id"))
    }
    # Completed lessons per course for this student.
    completed = {
        r["lesson__unit__course_id"]: r["n"]
        for r in LessonProgress.objects.filter(
            student=user,
            status=LessonProgress.Status.COMPLETED,
            lesson__unit__course_id__in=course_ids,
            lesson__unit__deleted_at__isnull=True,
        )
        .values("lesson__unit__course_id")
        .annotate(n=Count("id"))
    }
    out = {}
    for cid in course_ids:
        total = totals.get(cid, 0)
        done = completed.get(cid, 0)
        out[cid] = {
            "completed": done,
            "total": total,
            "pct": round(done / total * 100, 1) if total else 0.0,
        }
    return out


def completion_summary():
    """Platform-wide course KPIs for the admin dashboard (one grouped pass each):
    published course count + total completed lessons. Cheap; no per-student scan."""
    from .models import Course, LessonProgress

    return {
        "published_courses": Course.objects.filter(status=Course.Status.PUBLISHED).count(),
        "lessons_completed": LessonProgress.objects.filter(
            status=LessonProgress.Status.COMPLETED
        ).count(),
    }
