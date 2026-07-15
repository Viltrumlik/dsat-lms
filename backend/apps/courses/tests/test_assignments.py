"""
DSAT LMS v2 — Course assignment tests (5.4c)
Domain: Courses
Covers: IsAdmin gate, exactly-one-target + schedule validation, notify-on-create,
        cohort progress (completion %, N-independent), soft-delete.
"""

import pytest
from rest_framework.test import APIClient

from apps.academy.models import ClassEnrollment
from apps.academy.tests.factories import ClassFactory
from apps.courses.models import Course, CourseAssignment, LessonProgress
from apps.courses.tests.factories import CourseFactory, LessonFactory, UnitFactory
from apps.identity.tests.factories import AdminUserFactory, UserFactory
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/course-assignments/"


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _course_with_lessons(n_lessons=2, status=Course.Status.PUBLISHED):
    course = CourseFactory(status=status)
    unit = UnitFactory(course=course)
    lessons = [LessonFactory(unit=unit) for _ in range(n_lessons)]
    return course, lessons


class TestPermissions:
    def test_non_admin_forbidden(self):
        assert client_for(UserFactory(role="teacher")).get(BASE).status_code == 403


class TestCreate:
    def test_requires_exactly_one_target(self):
        course, _ = _course_with_lessons()
        klass = ClassFactory()
        student = UserFactory(role="student")
        c = client_for(AdminUserFactory())
        # Both → 400
        r = c.post(
            BASE,
            {
                "course": str(course.id),
                "assigned_class": str(klass.id),
                "assigned_student": str(student.id),
            },
            format="json",
        )
        assert r.status_code == 400
        # Neither → 400
        assert c.post(BASE, {"course": str(course.id)}, format="json").status_code == 400

    def test_schedule_validation(self):
        course, _ = _course_with_lessons()
        klass = ClassFactory()
        r = client_for(AdminUserFactory()).post(
            BASE,
            {
                "course": str(course.id),
                "assigned_class": str(klass.id),
                "opens_at": "2026-05-01T09:00:00Z",
                "closes_at": "2026-04-01T09:00:00Z",
            },
            format="json",
        )
        assert r.status_code == 400

    def test_assign_to_class_notifies_active_students(self):
        course, _ = _course_with_lessons()
        klass = ClassFactory()
        s1 = UserFactory(role="student")
        s2 = UserFactory(role="student")
        ClassEnrollment.objects.create(
            klass=klass, student=s1, status=ClassEnrollment.Status.ACTIVE
        )
        ClassEnrollment.objects.create(
            klass=klass, student=s2, status=ClassEnrollment.Status.INACTIVE
        )
        r = client_for(AdminUserFactory()).post(
            BASE, {"course": str(course.id), "assigned_class": str(klass.id)}, format="json"
        )
        assert r.status_code == 201, r.data
        # Only the ACTIVE student is notified.
        notes = Notification.objects.filter(type="course_assigned")
        assert notes.count() == 1 and notes.first().user_id == s1.id
        assert notes.first().data["course_id"] == str(course.id)

    def test_assign_to_student(self):
        course, _ = _course_with_lessons()
        student = UserFactory(role="student")
        r = client_for(AdminUserFactory()).post(
            BASE, {"course": str(course.id), "assigned_student": str(student.id)}, format="json"
        )
        assert r.status_code == 201
        assert Notification.objects.filter(type="course_assigned", user=student).count() == 1

    def test_draft_course_does_not_notify(self):
        # Assigning a not-yet-published course is allowed, but must NOT notify —
        # the student can't open it yet.
        course, _ = _course_with_lessons(status=Course.Status.DRAFT)
        student = UserFactory(role="student")
        r = client_for(AdminUserFactory()).post(
            BASE, {"course": str(course.id), "assigned_student": str(student.id)}, format="json"
        )
        assert r.status_code == 201
        assert Notification.objects.filter(type="course_assigned", user=student).count() == 0


class TestProgress:
    def test_completion_percentage(self):
        course, lessons = _course_with_lessons(n_lessons=4)
        klass = ClassFactory()
        student = UserFactory(role="student")
        ClassEnrollment.objects.create(
            klass=klass, student=student, status=ClassEnrollment.Status.ACTIVE
        )
        assignment = CourseAssignment.objects.create(
            course=course, assigned_by=AdminUserFactory(), assigned_class=klass
        )
        # Student completes 2 of 4 lessons.
        for lesson in lessons[:2]:
            LessonProgress.objects.create(
                student=student, lesson=lesson, status=LessonProgress.Status.COMPLETED
            )
        r = client_for(AdminUserFactory()).get(f"{BASE}{assignment.id}/progress/")
        assert r.status_code == 200, r.data
        rows = r.data["data"]
        assert len(rows) == 1
        assert rows[0]["completed"] == 2 and rows[0]["total"] == 4 and rows[0]["pct"] == 50.0

    def test_progress_query_count_independent_of_cohort(self, django_assert_max_num_queries):
        course, lessons = _course_with_lessons(n_lessons=2)
        klass = ClassFactory()
        for _ in range(6):
            s = UserFactory(role="student")
            ClassEnrollment.objects.create(
                klass=klass, student=s, status=ClassEnrollment.Status.ACTIVE
            )
            LessonProgress.objects.create(
                student=s, lesson=lessons[0], status=LessonProgress.Status.COMPLETED
            )
        assignment = CourseAssignment.objects.create(
            course=course, assigned_by=AdminUserFactory(), assigned_class=klass
        )
        from apps.courses.services import assignment_progress

        with django_assert_max_num_queries(6):  # lessons + cohort + completed + users (+overhead)
            rows = assignment_progress(assignment)
        assert len(rows) == 6

    def test_soft_delete(self):
        course, _ = _course_with_lessons()
        student = UserFactory(role="student")
        assignment = CourseAssignment.objects.create(
            course=course, assigned_by=AdminUserFactory(), assigned_student=student
        )
        c = client_for(AdminUserFactory())
        assert c.delete(f"{BASE}{assignment.id}/").status_code == 204
        assert c.get(BASE).data["data"] == []
