"""
DSAT LMS v2 — Classroom workspace
Domain: Academy
Description: The class as a place rather than a feed — who is in it, what has
    been set, and what you may do about it. Mounted at /api/v1/classes/,
    alongside the stream.

ONE surface for both roles, the way Google Classroom has one. The teacher and
the student open the same class and see the same tabs; what differs is what the
server sends and what it lets them write, which is published as `my_role` +
`capabilities` so the client never has to guess from a role string. A second,
teacher-only copy of this screen would be two things to keep in step forever —
and /teacher/classes/ already exists for MANAGEMENT (creating classes, enrolling
by email), which is a different job from being in one.

Access is `_member_class_or_404`, shared with the stream: the class's teacher, an
actively enrolled student, or full-access staff. Everyone else gets 404.
"""

from django.db.models import Count, Prefetch, Q
from rest_framework.views import APIView

from common.responses import success_response

from .models import ClassEnrollment, ClassPost, ClassSession
from .views_stream import _is_class_staff, _member_class_or_404


def _capabilities(user, klass):
    """What this member may do here.

    Derived once, server-side, and published — a client that decides for itself
    by comparing role strings will drift from what the API actually allows.
    """
    staff = _is_class_staff(user, klass)
    return {
        "is_staff": staff,
        "is_student": not staff,
        "can_post": staff,
        "can_moderate": staff,
        "can_manage_roster": staff,
        "can_grade": staff,
        "can_see_submissions": staff,
    }


def _class_payload(user, klass, *, counts=True):
    data = {
        "id": str(klass.id),
        "name": klass.name,
        "teacher_name": klass.teacher.get_full_name() if klass.teacher else None,
        "teacher_email": klass.teacher.email if klass.teacher else None,
        "is_active": klass.is_active,
        "my_role": "staff" if _is_class_staff(user, klass) else "student",
        "capabilities": _capabilities(user, klass),
    }
    if counts:
        data["student_count"] = ClassEnrollment.objects.filter(
            klass=klass, status=ClassEnrollment.Status.ACTIVE, deleted_at__isnull=True
        ).count()
    return data


class ClassDetailView(APIView):
    """The workspace header — and the permissions the tabs hang off."""

    def get(self, request, pk):
        klass = _member_class_or_404(request.user, pk)
        return success_response(_class_payload(request.user, klass))


class ClassPeopleView(APIView):
    """Who is in the class.

    Students see their classmates, exactly as Google Classroom shows them. That
    is a deliberate widening of what /teacher/classes/{id}/roster/ exposes: this
    returns names and nothing else, while the teacher's roster carries enrolment
    state and joining dates.
    """

    def get(self, request, pk):
        klass = _member_class_or_404(request.user, pk)
        staff = _is_class_staff(request.user, klass)

        enrollments = (
            ClassEnrollment.objects.filter(
                klass=klass, status=ClassEnrollment.Status.ACTIVE, deleted_at__isnull=True
            )
            .select_related("student")
            .order_by("student__first_name", "student__last_name")
        )
        students = [
            {
                "id": str(e.student_id),
                "full_name": e.student.get_full_name(),
                # A classmate's address is not a classmate's business.
                "email": e.student.email if staff else None,
                "enrolled_at": e.created_at,
            }
            for e in enrollments
        ]
        return success_response(
            {
                "teacher": (
                    {
                        "id": str(klass.teacher_id),
                        "full_name": klass.teacher.get_full_name(),
                        "email": klass.teacher.email,
                    }
                    if klass.teacher_id
                    else None
                ),
                "students": students,
            }
        )


class ClassworkView(APIView):
    """Everything that has been SET for this class, in one list.

    Google Classroom's Classwork tab, and the same reasoning: a student should
    not have to remember whether a thing was posted as homework or as a reading
    to find it. So this merges the class's homework with the stream's `material`
    posts into one due-date-ordered list.

    A student sees published homework and their own submission; staff see
    everything, with how many have handed in.
    """

    def get(self, request, pk):
        klass = _member_class_or_404(request.user, pk)
        staff = _is_class_staff(request.user, klass)

        # Lazy: academy sits below homework in the dependency order.
        from apps.homework.models import Homework, HomeworkSubmission

        homeworks = Homework.objects.filter(assigned_class=klass, deleted_at__isnull=True).order_by(
            "-due_at"
        )
        if not staff:
            homeworks = homeworks.filter(is_published=True)

        if staff:
            homeworks = homeworks.annotate(
                submitted_count=Count(
                    "submissions",
                    filter=Q(
                        submissions__deleted_at__isnull=True,
                        submissions__status__in=(
                            HomeworkSubmission.Status.SUBMITTED,
                            HomeworkSubmission.Status.GRADED,
                        ),
                    ),
                    distinct=True,
                )
            )
        else:
            homeworks = homeworks.prefetch_related(
                Prefetch(
                    "submissions",
                    queryset=HomeworkSubmission.objects.filter(
                        student=request.user, deleted_at__isnull=True
                    ),
                    to_attr="my_submissions",
                )
            )

        items = []
        for hw in homeworks:
            mine = getattr(hw, "my_submissions", None)
            items.append(
                {
                    "kind": "homework",
                    "id": str(hw.id),
                    "title": hw.title,
                    "description": hw.description,
                    "due_at": hw.due_at,
                    "is_published": hw.is_published,
                    "exam_title": hw.exam.title if hw.exam_id else None,
                    "attachment_count": hw.attachments.filter(deleted_at__isnull=True).count(),
                    "my_status": mine[0].status if mine else None,
                    "submitted_count": getattr(hw, "submitted_count", None),
                    "created_at": hw.created_at,
                }
            )

        materials = (
            ClassPost.objects.filter(
                klass=klass, kind=ClassPost.Kind.MATERIAL, deleted_at__isnull=True
            )
            .prefetch_related("attachments")
            .order_by("-created_at")
        )
        for post in materials:
            items.append(
                {
                    "kind": "material",
                    "id": str(post.id),
                    "title": post.body[:120],
                    "description": "",
                    "due_at": None,
                    "is_published": True,
                    "exam_title": None,
                    "attachment_count": post.attachments.count(),
                    "my_status": None,
                    "submitted_count": None,
                    "created_at": post.created_at,
                }
            )

        return success_response(items)


class ClassScheduleView(APIView):
    """The next few meetings — the one thing a class page is always asked."""

    def get(self, request, pk):
        klass = _member_class_or_404(request.user, pk)
        sessions = (
            ClassSession.objects.filter(klass=klass, deleted_at__isnull=True)
            .exclude(status=ClassSession.Status.CANCELED)
            .order_by("starts_at")[:20]
        )
        return success_response(
            [
                {
                    "id": str(s.id),
                    "title": s.title,
                    "starts_at": s.starts_at,
                    "ends_at": s.ends_at,
                    "location": s.location,
                    "status": s.status,
                }
                for s in sessions
            ]
        )
