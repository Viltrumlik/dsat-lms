"""
DSAT LMS v2 — Academy Views (teacher-facing)
Domain: Academy
Description: A teacher manages their own classes — list/create, view roster, enroll
            a student. Admins may act on any class.
Permissions: IsAdminOrTeacher. Classes are scoped to the requesting teacher (others
             404), enforcing "a teacher sees only their own class".
"""

from django.db.models import Count, Q
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from apps.identity.models import User
from common.exceptions import ValidationError
from common.pagination import CursorPagination
from common.permissions import IsAdminOrTeacher
from common.responses import created_response, success_response

from .models import Class, ClassEnrollment
from .serializers import (
    ClassCreateSerializer,
    ClassSerializer,
    EnrollSerializer,
    RosterEntrySerializer,
    StudentMiniSerializer,
)


def _scoped_classes(request):
    if request.user.is_admin:
        return Class.objects.all()
    return Class.objects.filter(teacher=request.user)


def _owned_class(request, pk):
    try:
        return _scoped_classes(request).get(pk=pk)
    except Class.DoesNotExist:
        raise NotFound("Class not found.") from None


def _scoped_student(request, pk):
    """The user `pk`, but only if the requester may see them: admins see anyone;
    a teacher sees only students actively enrolled in one of their own classes."""
    qs = User.objects.filter(pk=pk)
    if not request.user.is_admin:
        qs = qs.filter(
            enrollments__klass__teacher=request.user,
            enrollments__status=ClassEnrollment.Status.ACTIVE,
        )
    student = qs.distinct().first()
    if student is None:
        raise NotFound("Student not found.")
    return student


class TeacherClassListCreateView(APIView):
    permission_classes = [IsAdminOrTeacher]

    def get(self, request):
        classes = (
            _scoped_classes(request)
            .annotate(
                active_count=Count(
                    "enrollments",
                    filter=Q(enrollments__status=ClassEnrollment.Status.ACTIVE),
                )
            )
            .order_by("-created_at")
        )
        return success_response(ClassSerializer(classes, many=True).data)

    def post(self, request):
        serializer = ClassCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        klass = Class.objects.create(name=serializer.validated_data["name"], teacher=request.user)
        return created_response(ClassSerializer(klass).data)


class TeacherClassRosterView(APIView):
    permission_classes = [IsAdminOrTeacher]

    def get(self, request, pk):
        klass = _owned_class(request, pk)
        enrollments = klass.enrollments.filter(status=ClassEnrollment.Status.ACTIVE).select_related(
            "student"
        )
        return success_response(RosterEntrySerializer(enrollments, many=True).data)


class TeacherClassEnrollView(APIView):
    permission_classes = [IsAdminOrTeacher]

    def post(self, request, pk):
        klass = _owned_class(request, pk)
        serializer = EnrollSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower().strip()

        student = User.objects.filter(email__iexact=email).first()
        if student is None:
            return ValidationError("No user with that email.", field="email").to_response()

        enrollment, _ = ClassEnrollment.objects.update_or_create(
            klass=klass,
            student=student,
            defaults={"status": ClassEnrollment.Status.ACTIVE},
        )
        return success_response(RosterEntrySerializer(enrollment).data)


class TeacherStudentAnalyticsView(APIView):
    """A teacher's read-only analytics drilldown for one of their own students."""

    permission_classes = [IsAdminOrTeacher]

    def get(self, request, pk):
        student = _scoped_student(request, pk)
        # Local import avoids an academy→analytics import at module load.
        from apps.analytics.services import (
            category_progress,
            homework_stats,
            improvement_trend,
            overall_summary,
            recent_score_estimate,
            risk_assessment,
            weak_topics,
        )

        return success_response(
            {
                "student": StudentMiniSerializer(student).data,
                "summary": overall_summary(student),
                "progress": category_progress(student),
                # Insight layer (Phase 4A) — kept alongside the original keys.
                "homework_stats": homework_stats(student),
                "risk_assessment": risk_assessment(student),
                "improvement_trend": improvement_trend(student),
                "weak_topics": weak_topics(student),
                "recent_score_estimate": recent_score_estimate(student),
            }
        )


class TeacherDashboardView(APIView):
    """Teacher home — a lean overview: at-a-glance counts (the TRUE totals) plus a
    short preview of the students who most need attention. The full, growing lists
    (all students, the grading queue, homework) each live on their own paginated
    page, so the dashboard never tries to render everything at once."""

    permission_classes = [IsAdminOrTeacher]
    ATRISK_PREVIEW = 5

    def get(self, request):
        from apps.analytics.services import batch_risk_assessments
        from apps.homework.models import HomeworkSubmission

        class_ids = list(_scoped_classes(request).values_list("id", flat=True))

        enrollments = ClassEnrollment.objects.filter(
            klass_id__in=class_ids, status=ClassEnrollment.Status.ACTIVE
        ).select_related("student")
        students_by_id = {}
        student_class = {}
        for e in enrollments:
            students_by_id.setdefault(e.student_id, e.student)
            student_class.setdefault(e.student_id, e.klass_id)

        # At-risk (non-green) students, worst first — a preview; the full list is
        # /teacher/students. Risk is a batch computation (~7 queries), not per-N.
        risks = batch_risk_assessments(list(students_by_id))
        at_risk = sorted(
            (
                {
                    "student": StudentMiniSerializer(students_by_id[sid]).data,
                    "class_id": str(student_class[sid]),
                    "risk": risk,
                }
                for sid, risk in risks.items()
                if risk["level"] != "green"
            ),
            key=lambda x: x["risk"]["score"],
            reverse=True,
        )

        pending_count = HomeworkSubmission.objects.filter(
            homework__assigned_class_id__in=class_ids,
            status=HomeworkSubmission.Status.SUBMITTED,
        ).count()

        return success_response(
            {
                "counts": {
                    "classes": len(class_ids),
                    "active_students": len(students_by_id),
                    "pending_grading": pending_count,
                    "at_risk_students": len(at_risk),
                },
                "at_risk_students": at_risk[: self.ATRISK_PREVIEW],
            }
        )


class TeacherStudentsView(APIView):
    """All active students across the teacher's classes, cursor-paginated, each
    carrying their risk badge + headline metrics. Risk is computed per page (batch),
    so this scales as the student body grows."""

    permission_classes = [IsAdminOrTeacher]

    def get(self, request):
        from apps.analytics.services import batch_student_metrics

        qs = User.objects.filter(
            enrollments__klass__in=_scoped_classes(request),
            enrollments__status=ClassEnrollment.Status.ACTIVE,
        ).distinct()

        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )
        qs = qs.order_by("-created_at")

        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        metrics = batch_student_metrics([u.id for u in page])
        data = [
            {
                "student": StudentMiniSerializer(u).data,
                "risk": metrics[u.id]["risk"],
                "overall_accuracy": metrics[u.id]["overall_accuracy"],
                "homework_completion_pct": metrics[u.id]["homework_completion_pct"],
                "days_inactive": metrics[u.id]["days_inactive"],
            }
            for u in page
        ]
        return paginator.get_paginated_response(data)


class TeacherGradingView(APIView):
    """Homework submissions across the teacher's classes, cursor-paginated, newest
    first. ?status=pending (default) → only ungraded submissions (the grading
    queue); any other value → submitted + graded (a recent-submissions feed)."""

    permission_classes = [IsAdminOrTeacher]

    def get(self, request):
        from apps.homework.models import HomeworkSubmission

        submitted = HomeworkSubmission.Status.SUBMITTED
        graded = HomeworkSubmission.Status.GRADED
        statuses = (
            [submitted]
            if request.query_params.get("status", "pending") == "pending"
            else [submitted, graded]
        )

        class_ids = list(_scoped_classes(request).values_list("id", flat=True))
        qs = (
            HomeworkSubmission.objects.filter(
                homework__assigned_class_id__in=class_ids, status__in=statuses
            )
            .select_related("student", "homework")
            .order_by("-created_at")
        )

        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        data = [
            {
                "submission_id": str(s.id),
                "homework_id": str(s.homework_id),
                "homework_title": s.homework.title,
                "student": StudentMiniSerializer(s.student).data,
                "status": s.status,
                "submitted_at": s.submitted_at,
                "class_id": str(s.homework.assigned_class_id),
            }
            for s in page
        ]
        return paginator.get_paginated_response(data)


class TeacherClassOverviewView(APIView):
    """Group stats + a per-student roster carrying each student's risk badge, for
    one of the teacher's own classes. Roster is bounded by class size (like the
    sibling roster endpoint), so it is returned whole."""

    permission_classes = [IsAdminOrTeacher]

    def get(self, request, pk):
        from apps.analytics.services import batch_student_metrics

        klass = _owned_class(request, pk)
        enrollments = klass.enrollments.filter(status=ClassEnrollment.Status.ACTIVE).select_related(
            "student"
        )
        students_by_id = {e.student_id: e.student for e in enrollments}
        metrics = batch_student_metrics(list(students_by_id))

        accs = [
            m["overall_accuracy"] for m in metrics.values() if m["overall_accuracy"] is not None
        ]
        comps = [
            m["homework_completion_pct"]
            for m in metrics.values()
            if m["homework_completion_pct"] is not None
        ]
        roster = sorted(
            (
                {
                    "student": StudentMiniSerializer(students_by_id[sid]).data,
                    "risk": m["risk"],
                    "overall_accuracy": m["overall_accuracy"],
                    "homework_completion_pct": m["homework_completion_pct"],
                    "days_inactive": m["days_inactive"],
                }
                for sid, m in metrics.items()
            ),
            key=lambda r: (-r["risk"]["score"], (r["student"]["full_name"] or "").lower()),
        )

        return success_response(
            {
                "class": {
                    "id": str(klass.id),
                    "name": klass.name,
                    "student_count": len(students_by_id),
                },
                "group": {
                    "avg_accuracy": round(sum(accs) / len(accs), 2) if accs else None,
                    "homework_completion_rate": round(sum(comps) / len(comps), 2) if comps else 0.0,
                    "at_risk_count": sum(
                        1 for m in metrics.values() if m["risk"]["level"] != "green"
                    ),
                },
                "roster": roster,
            }
        )
