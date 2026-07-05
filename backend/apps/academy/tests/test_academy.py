"""
DSAT LMS v2 — Academy (teacher) tests
Domain: Academy
Covers: permission gate, class create/list scoping, roster, enroll
        (+ unknown email, + idempotency), and own-class-only isolation.
"""

import pytest
from rest_framework.test import APIClient

from apps.academy.models import ClassEnrollment
from apps.academy.tests.factories import ClassFactory
from apps.identity.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

TEACHER = "/api/v1/teacher/"


def teacher_client():
    teacher = UserFactory(role="teacher")
    client = APIClient()
    client.force_authenticate(teacher)
    client.user = teacher
    return client


class TestClasses:
    def test_public_user_forbidden(self, auth_client):
        # auth_client is a public-role user
        assert auth_client.get(TEACHER + "classes/").status_code == 403

    def test_teacher_creates_and_lists(self):
        client = teacher_client()
        r = client.post(TEACHER + "classes/", {"name": "Morning SAT"}, format="json")
        assert r.status_code == 201
        assert r.data["data"]["name"] == "Morning SAT"
        assert r.data["data"]["student_count"] == 0
        assert len(client.get(TEACHER + "classes/").data["data"]) == 1

    def test_only_own_classes_listed(self):
        client = teacher_client()
        ClassFactory()  # another teacher's class
        client.post(TEACHER + "classes/", {"name": "Mine"}, format="json")
        data = client.get(TEACHER + "classes/").data["data"]
        assert len(data) == 1
        assert data[0]["name"] == "Mine"


class TestRosterAndEnroll:
    def test_enroll_then_appears_in_roster(self):
        client = teacher_client()
        klass = ClassFactory(teacher=client.user)
        UserFactory(role="student", email="s1@dsat.local")
        r = client.post(
            f"{TEACHER}classes/{klass.id}/enroll/", {"email": "s1@dsat.local"}, format="json"
        )
        assert r.status_code == 200
        roster = client.get(f"{TEACHER}classes/{klass.id}/roster/")
        assert len(roster.data["data"]) == 1
        assert roster.data["data"][0]["student"]["email"] == "s1@dsat.local"

    def test_enroll_unknown_email_400(self):
        client = teacher_client()
        klass = ClassFactory(teacher=client.user)
        r = client.post(
            f"{TEACHER}classes/{klass.id}/enroll/", {"email": "nope@dsat.local"}, format="json"
        )
        assert r.status_code == 400
        assert r.data["error"]["field"] == "email"

    def test_enroll_is_idempotent(self):
        client = teacher_client()
        klass = ClassFactory(teacher=client.user)
        student = UserFactory(role="student", email="s2@dsat.local")
        for _ in range(2):
            client.post(
                f"{TEACHER}classes/{klass.id}/enroll/", {"email": "s2@dsat.local"}, format="json"
            )
        assert ClassEnrollment.objects.filter(klass=klass, student=student).count() == 1

    def test_cannot_touch_other_teachers_class(self):
        client = teacher_client()
        other = ClassFactory()  # different teacher
        assert client.get(f"{TEACHER}classes/{other.id}/roster/").status_code == 404
        assert (
            client.post(
                f"{TEACHER}classes/{other.id}/enroll/", {"email": "x@dsat.local"}, format="json"
            ).status_code
            == 404
        )


class TestStudentAnalytics:
    def _enrolled_student(self, client):
        klass = ClassFactory(teacher=client.user)
        student = UserFactory(role="student")
        ClassEnrollment.objects.create(klass=klass, student=student)
        return student

    def test_teacher_sees_own_student(self):
        client = teacher_client()
        student = self._enrolled_student(client)
        r = client.get(f"{TEACHER}students/{student.id}/analytics/")
        assert r.status_code == 200
        data = r.data["data"]
        assert data["student"]["id"] == str(student.id)
        assert set(data["summary"]) >= {"total_answered", "overall_accuracy", "exams_completed"}
        assert data["progress"] == []  # no practice yet

    def test_teacher_404_for_unrelated_student(self):
        client = teacher_client()
        stranger = UserFactory(role="student")  # not in any of this teacher's classes
        assert client.get(f"{TEACHER}students/{stranger.id}/analytics/").status_code == 404

    def test_teacher_404_for_other_teachers_student(self):
        client = teacher_client()
        other_class = ClassFactory()  # different teacher
        student = UserFactory(role="student")
        ClassEnrollment.objects.create(klass=other_class, student=student)
        assert client.get(f"{TEACHER}students/{student.id}/analytics/").status_code == 404

    def test_inactive_enrollment_is_not_visible(self):
        client = teacher_client()
        klass = ClassFactory(teacher=client.user)
        student = UserFactory(role="student")
        ClassEnrollment.objects.create(
            klass=klass, student=student, status=ClassEnrollment.Status.REMOVED
        )
        assert client.get(f"{TEACHER}students/{student.id}/analytics/").status_code == 404

    def test_public_user_forbidden(self, auth_client):
        student = UserFactory(role="student")
        assert auth_client.get(f"{TEACHER}students/{student.id}/analytics/").status_code == 403

    def test_admin_sees_any_student(self):
        admin = UserFactory(role="admin")
        client = APIClient()
        client.force_authenticate(admin)
        student = UserFactory(role="student")  # not enrolled anywhere
        r = client.get(f"{TEACHER}students/{student.id}/analytics/")
        assert r.status_code == 200
        assert r.data["data"]["student"]["id"] == str(student.id)

    def test_insight_keys_present_and_backward_compatible(self):
        client = teacher_client()
        student = self._enrolled_student(client)
        data = client.get(f"{TEACHER}students/{student.id}/analytics/").data["data"]
        # Original keys must survive the extension.
        assert {"student", "summary", "progress"} <= set(data)
        # New insight layer.
        assert {
            "homework_stats",
            "risk_assessment",
            "improvement_trend",
            "weak_topics",
            "recent_score_estimate",
        } <= set(data)
        assert data["risk_assessment"]["level"] in ("green", "yellow", "red")


class TestDashboard:
    def test_public_user_forbidden(self, auth_client):
        assert auth_client.get(TEACHER + "dashboard/").status_code == 403

    def test_counts_scoped_to_own_classes(self):
        client = teacher_client()
        mine = ClassFactory(teacher=client.user)
        ClassEnrollment.objects.create(klass=mine, student=UserFactory(role="student"))
        # Another teacher's class + student must not leak in.
        other = ClassFactory()
        ClassEnrollment.objects.create(klass=other, student=UserFactory(role="student"))
        data = client.get(TEACHER + "dashboard/").data["data"]
        assert data["counts"]["classes"] == 1
        assert data["counts"]["active_students"] == 1
        # Lean overview: counts + at-risk preview only. The full lists moved to
        # their own paginated pages (/teacher/students, /teacher/grading).
        assert set(data) == {"counts", "at_risk_students"}

    def test_admin_sees_all_classes(self):
        admin = UserFactory(role="admin")
        client = APIClient()
        client.force_authenticate(admin)
        ClassFactory()
        ClassFactory()
        assert client.get(TEACHER + "dashboard/").data["data"]["counts"]["classes"] >= 2


class TestStudentsList:
    def test_public_user_forbidden(self, auth_client):
        assert auth_client.get(TEACHER + "students/").status_code == 403

    def test_lists_own_active_students_with_risk(self):
        client = teacher_client()
        klass = ClassFactory(teacher=client.user)
        ClassEnrollment.objects.create(klass=klass, student=UserFactory(role="student"))
        # Another teacher's student and an inactive one must not appear.
        ClassEnrollment.objects.create(klass=ClassFactory(), student=UserFactory(role="student"))
        ClassEnrollment.objects.create(
            klass=klass,
            student=UserFactory(role="student"),
            status=ClassEnrollment.Status.REMOVED,
        )
        r = client.get(TEACHER + "students/")
        assert r.status_code == 200
        assert len(r.data["data"]) == 1
        row = r.data["data"][0]
        assert row["risk"]["level"] in ("green", "yellow", "red")
        assert {"student", "risk", "overall_accuracy", "homework_completion_pct"} <= set(row)
        assert "pagination" in r.data["meta"]

    def test_search_filters_by_name(self):
        client = teacher_client()
        klass = ClassFactory(teacher=client.user)
        ClassEnrollment.objects.create(
            klass=klass, student=UserFactory(role="student", first_name="Zebra")
        )
        ClassEnrollment.objects.create(
            klass=klass, student=UserFactory(role="student", first_name="Yak")
        )
        data = client.get(TEACHER + "students/?search=zeb").data["data"]
        assert len(data) == 1
        assert data[0]["student"]["first_name"] == "Zebra"


class TestGradingQueue:
    def test_public_user_forbidden(self, auth_client):
        assert auth_client.get(TEACHER + "grading/").status_code == 403

    def test_pending_default_excludes_graded(self):
        from apps.homework.models import HomeworkSubmission
        from apps.homework.tests.factories import HomeworkFactory, HomeworkSubmissionFactory

        client = teacher_client()
        klass = ClassFactory(teacher=client.user)
        hw = HomeworkFactory(assigned_class=klass, is_published=True)
        HomeworkSubmissionFactory(homework=hw, status=HomeworkSubmission.Status.SUBMITTED)
        HomeworkSubmissionFactory(homework=hw, status=HomeworkSubmission.Status.GRADED)

        pending = client.get(TEACHER + "grading/").data["data"]
        assert len(pending) == 1
        assert pending[0]["status"] == "submitted"

        every = client.get(TEACHER + "grading/?status=all").data["data"]
        assert len(every) == 2

    def test_scoped_to_own_classes(self):
        from apps.homework.models import HomeworkSubmission
        from apps.homework.tests.factories import HomeworkFactory, HomeworkSubmissionFactory

        client = teacher_client()
        other_hw = HomeworkFactory(assigned_class=ClassFactory(), is_published=True)
        HomeworkSubmissionFactory(homework=other_hw, status=HomeworkSubmission.Status.SUBMITTED)
        assert client.get(TEACHER + "grading/").data["data"] == []


class TestClassOverview:
    def test_public_user_forbidden(self, auth_client):
        klass = ClassFactory()
        assert auth_client.get(f"{TEACHER}classes/{klass.id}/overview/").status_code == 403

    def test_cannot_view_other_teachers_class(self):
        client = teacher_client()
        other = ClassFactory()
        assert client.get(f"{TEACHER}classes/{other.id}/overview/").status_code == 404

    def test_own_class_overview(self):
        client = teacher_client()
        klass = ClassFactory(teacher=client.user)
        ClassEnrollment.objects.create(klass=klass, student=UserFactory(role="student"))
        data = client.get(f"{TEACHER}classes/{klass.id}/overview/").data["data"]
        assert data["class"]["student_count"] == 1
        assert len(data["roster"]) == 1
        assert data["roster"][0]["risk"]["level"] in ("green", "yellow", "red")
        assert {"avg_accuracy", "homework_completion_rate", "at_risk_count"} <= set(data["group"])
