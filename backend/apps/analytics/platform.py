"""
DSAT LMS v2 — Platform analytics (5.3c)
Domain: Analytics (admin)
Description: Platform-wide admin insights — the most at-risk students, the most
    active teachers, exam difficulty (avg accuracy), and attendance by class.
    Reuses the risk engine + grouped queries. Admin-only surface.
"""

from django.db.models import Avg, Count, Q


def weak_students(limit=15):
    """The most at-risk active-enrolled students (worst-risk first), with figures."""
    from apps.academy.models import ClassEnrollment
    from apps.identity.models import User

    from .services import batch_student_metrics

    ids = list(
        User.objects.filter(
            role=User.Role.STUDENT,
            is_active=True,
            deleted_at__isnull=True,
            enrollments__status=ClassEnrollment.Status.ACTIVE,
        )
        .distinct()
        .values_list("id", flat=True)
    )
    if not ids:
        return []
    metrics = batch_student_metrics(ids)
    users = User.objects.in_bulk(ids)
    ranked = sorted(metrics.items(), key=lambda kv: kv[1]["risk"]["score"], reverse=True)
    out = []
    for uid, m in ranked:
        if m["risk"]["level"] == "green":
            continue
        u = users.get(uid)
        if u is None:
            continue
        out.append(
            {
                "student": {"id": str(u.id), "full_name": u.get_full_name(), "email": u.email},
                "accuracy": m["overall_accuracy"],
                "homework": m["homework_completion_pct"],
                "attendance": m["attendance_pct"],
                "days_inactive": m["days_inactive"],
                "risk": m["risk"]["level"],
            }
        )
        if len(out) >= limit:
            break
    return out


def active_teachers(limit=10):
    """Teachers ranked by active students taught."""
    from apps.academy.models import ClassEnrollment
    from apps.identity.models import User

    rows = (
        User.objects.filter(role=User.Role.TEACHER, is_active=True, deleted_at__isnull=True)
        .annotate(
            classes=Count(
                "teaching_classes",
                filter=Q(
                    teaching_classes__is_active=True,
                    teaching_classes__deleted_at__isnull=True,
                ),
                distinct=True,
            ),
            # `__` traversal bypasses the soft-delete ActiveManager, so exclude
            # soft-deleted enrollments AND soft-deleted/inactive students explicitly
            # (mirrors weak_students; otherwise the ranking inflates).
            students=Count(
                "teaching_classes__enrollments",
                filter=Q(
                    teaching_classes__enrollments__status=ClassEnrollment.Status.ACTIVE,
                    teaching_classes__enrollments__deleted_at__isnull=True,
                    teaching_classes__enrollments__student__deleted_at__isnull=True,
                    teaching_classes__enrollments__student__is_active=True,
                ),
                distinct=True,
            ),
        )
        .order_by("-students", "-classes")[:limit]
    )
    return [
        {
            "teacher": {"id": str(r.id), "full_name": r.get_full_name(), "email": r.email},
            "classes": r.classes,
            "students": r.students,
        }
        for r in rows
    ]


def exam_difficulty(limit=10):
    """Exams by average accuracy (hardest — lowest accuracy — first)."""
    from apps.assessments.models import ExamResult

    rows = (
        ExamResult.objects.values("exam_id", "exam__title")
        .annotate(avg_accuracy=Avg("accuracy_pct"), attempts=Count("id"))
        .filter(attempts__gt=0)
        .order_by("avg_accuracy")[:limit]
    )
    return [
        {
            "exam": r["exam__title"],
            "avg_accuracy": float(r["avg_accuracy"]) if r["avg_accuracy"] is not None else None,
            "attempts": r["attempts"],
        }
        for r in rows
    ]


def attendance_by_class(limit=15):
    """Per-class attendance rate (present+late)/(present+late+absent), lowest first."""
    from apps.academy.models import Attendance, Class

    st = Attendance.Status
    counted = [st.PRESENT, st.LATE, st.ABSENT]
    attended = [st.PRESENT, st.LATE]
    rows = Class.objects.filter(is_active=True).annotate(
        counted=Count("sessions__attendances", filter=Q(sessions__attendances__status__in=counted)),
        attended=Count(
            "sessions__attendances", filter=Q(sessions__attendances__status__in=attended)
        ),
    )
    out = []
    for c in rows:
        if not c.counted:
            continue
        out.append(
            {"class": c.name, "rate": round(c.attended / c.counted * 100, 1), "marked": c.counted}
        )
    out.sort(key=lambda x: x["rate"])
    return out[:limit]


def admin_analytics():
    return {
        "weak_students": weak_students(),
        "active_teachers": active_teachers(),
        "exam_difficulty": exam_difficulty(),
        "attendance_by_class": attendance_by_class(),
    }
