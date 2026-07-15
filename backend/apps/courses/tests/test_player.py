"""
DSAT LMS v2 — Student course player tests (5.4d)
Domain: Courses
Covers: role gate, assignment-scoped visibility (unassigned/draft/not-yet-open → hidden/404),
        detail tree, lesson-progress marking + completion rollup, cross-course 404.
"""

import pytest
from rest_framework.test import APIClient

from apps.academy.models import ClassEnrollment
from apps.academy.tests.factories import ClassFactory
from apps.courses.models import Course, CourseAssignment, LessonProgress
from apps.courses.tests.factories import CourseFactory, LessonFactory, UnitFactory
from apps.identity.tests.factories import AdminUserFactory, UserFactory

pytestmark = pytest.mark.django_db

LIST = "/api/v1/courses/"


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _published_course(n_lessons=2):
    course = CourseFactory(status=Course.Status.PUBLISHED)
    unit = UnitFactory(course=course)
    lessons = [LessonFactory(unit=unit) for _ in range(n_lessons)]
    return course, unit, lessons


def _enroll_and_assign(student, course, **assignment_kwargs):
    klass = ClassFactory()
    ClassEnrollment.objects.create(
        klass=klass, student=student, status=ClassEnrollment.Status.ACTIVE
    )
    return CourseAssignment.objects.create(
        course=course, assigned_by=AdminUserFactory(), assigned_class=klass, **assignment_kwargs
    )


class TestVisibility:
    def test_public_user_forbidden(self):
        assert client_for(UserFactory(role="public")).get(LIST).status_code == 403

    def test_assigned_published_course_visible(self):
        student = UserFactory(role="student")
        course, _, _ = _published_course()
        _enroll_and_assign(student, course)
        r = client_for(student).get(LIST)
        assert r.status_code == 200
        items = r.data["data"]
        assert len(items) == 1 and items[0]["id"] == str(course.id)
        assert items[0]["total"] == 2 and items[0]["completed"] == 0

    def test_unassigned_course_hidden_and_404(self):
        student = UserFactory(role="student")
        course, _, _ = _published_course()  # no assignment
        c = client_for(student)
        assert c.get(LIST).data["data"] == []
        assert c.get(f"{LIST}{course.id}/").status_code == 404

    def test_draft_course_not_visible(self):
        student = UserFactory(role="student")
        course = CourseFactory(status=Course.Status.DRAFT)
        LessonFactory(unit=UnitFactory(course=course))
        _enroll_and_assign(student, course)
        assert client_for(student).get(LIST).data["data"] == []

    def test_not_yet_open_hidden(self):
        student = UserFactory(role="student")
        course, _, _ = _published_course()
        _enroll_and_assign(student, course, opens_at="2099-01-01T00:00:00Z")
        assert client_for(student).get(LIST).data["data"] == []

    def test_detail_tree(self):
        student = UserFactory(role="student")
        course, _, _ = _published_course(n_lessons=3)
        _enroll_and_assign(student, course)
        r = client_for(student).get(f"{LIST}{course.id}/")
        assert r.status_code == 200
        data = r.data["data"]
        assert len(data["units"]) == 1
        assert len(data["units"][0]["lessons"]) == 3
        assert data["units"][0]["lessons"][0]["progress_status"] is None


class TestProgress:
    def test_mark_completed_updates_completion(self):
        student = UserFactory(role="student")
        course, _, lessons = _published_course(n_lessons=2)
        _enroll_and_assign(student, course)
        c = client_for(student)
        r = c.post(
            f"{LIST}lessons/{lessons[0].id}/progress/", {"status": "completed"}, format="json"
        )
        assert r.status_code == 200
        assert r.data["data"]["status"] == "completed"
        row = LessonProgress.objects.get(student=student, lesson=lessons[0])
        assert row.status == "completed" and row.completed_at is not None
        # List now reflects 1/2 complete.
        item = c.get(LIST).data["data"][0]
        assert item["completed"] == 1 and item["completion_pct"] == 50.0

    def test_progress_on_unassigned_lesson_404(self):
        student = UserFactory(role="student")
        course, _, lessons = _published_course()  # not assigned to this student
        assert (
            client_for(student)
            .post(
                f"{LIST}lessons/{lessons[0].id}/progress/", {"status": "completed"}, format="json"
            )
            .status_code
            == 404
        )

    def test_progress_is_idempotent(self):
        student = UserFactory(role="student")
        course, _, lessons = _published_course()
        _enroll_and_assign(student, course)
        c = client_for(student)
        c.post(f"{LIST}lessons/{lessons[0].id}/progress/", {"status": "in_progress"}, format="json")
        c.post(f"{LIST}lessons/{lessons[0].id}/progress/", {"status": "completed"}, format="json")
        assert LessonProgress.objects.filter(student=student, lesson=lessons[0]).count() == 1


class TestAttachmentAccess:
    def _lesson_attachment(self, lesson, owner):
        from django.core.files.uploadedfile import SimpleUploadedFile

        from apps.courses.models import LessonAttachment
        from apps.files.models import Attachment

        att = Attachment.objects.create(
            owner=owner,
            uploaded_by=owner,
            file=SimpleUploadedFile("w.pdf", b"%PDF x"),
            original_name="w.pdf",
            content_type="application/pdf",
            size=6,
            kind=Attachment.Kind.DOCUMENT,
        )
        LessonAttachment.objects.create(lesson=lesson, attachment=att)
        return att

    def test_student_can_read_attachment_on_assigned_course(self):
        from apps.files.services import can_access_attachment

        student = UserFactory(role="student")
        course, _, lessons = _published_course()
        _enroll_and_assign(student, course)
        att = self._lesson_attachment(lessons[0], AdminUserFactory())
        assert can_access_attachment(student, att) is True

    def test_student_cannot_read_attachment_on_unassigned_course(self):
        from apps.files.services import can_access_attachment

        student = UserFactory(role="student")
        course, _, lessons = _published_course()  # not assigned to this student
        att = self._lesson_attachment(lessons[0], AdminUserFactory())
        assert can_access_attachment(student, att) is False
