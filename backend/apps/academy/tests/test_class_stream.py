"""
DSAT LMS v2 — Classroom stream tests
Domain: Academy
Covers: membership access (outsiders get 404, not 403), staff-only posting,
        student replies, closed replies, soft-delete + moderation rules.
"""

import pytest
from rest_framework.test import APIClient

from apps.academy.models import ClassComment, ClassEnrollment, ClassPost
from apps.academy.tests.factories import ClassFactory
from apps.identity.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def setup():
    teacher = UserFactory(role="teacher")
    student = UserFactory(role="student")
    klass = ClassFactory(teacher=teacher)
    ClassEnrollment.objects.create(
        klass=klass, student=student, status=ClassEnrollment.Status.ACTIVE
    )
    return teacher, student, klass


def stream(klass):
    return f"/api/v1/classes/{klass.id}/stream/"


class TestAccessIsByMembership:
    def test_enrolled_student_reads_the_stream(self, setup):
        _, student, klass = setup
        assert client_for(student).get(stream(klass)).status_code == 200

    def test_the_teacher_reads_it(self, setup):
        teacher, _, klass = setup
        assert client_for(teacher).get(stream(klass)).status_code == 200

    def test_an_outsider_gets_404_not_403(self, setup):
        """Whether a class exists is not something an outsider needs to learn."""
        _, _, klass = setup
        outsider = UserFactory(role="student")
        assert client_for(outsider).get(stream(klass)).status_code == 404

    def test_another_teacher_gets_404(self, setup):
        _, _, klass = setup
        assert client_for(UserFactory(role="teacher")).get(stream(klass)).status_code == 404

    def test_a_removed_student_loses_access(self, setup):
        _, student, klass = setup
        ClassEnrollment.objects.filter(klass=klass, student=student).update(status="removed")
        assert client_for(student).get(stream(klass)).status_code == 404

    def test_my_classes_lists_only_enrolled_ones(self, setup):
        _, student, klass = setup
        ClassFactory()  # a class they are not in
        r = client_for(student).get("/api/v1/classes/")
        assert r.status_code == 200
        assert [c["id"] for c in r.data["data"]] == [str(klass.id)]


class TestPosting:
    def test_teacher_posts(self, setup):
        teacher, _, klass = setup
        r = client_for(teacher).post(
            stream(klass), {"body": "Bring your calculator on Thursday."}, format="json"
        )
        assert r.status_code == 201
        assert r.data["data"]["body"] == "Bring your calculator on Thursday."
        assert r.data["data"]["author"]["role"] == "teacher"

    def test_students_cannot_post(self, setup):
        _, student, klass = setup
        r = client_for(student).post(stream(klass), {"body": "hello"}, format="json")
        assert r.status_code == 403

    def test_pinned_posts_come_first(self, setup):
        teacher, _, klass = setup
        client = client_for(teacher)
        client.post(stream(klass), {"body": "older"}, format="json")
        client.post(stream(klass), {"body": "house rules", "is_pinned": True}, format="json")

        bodies = [p["body"] for p in client.get(stream(klass)).data["data"]]
        assert bodies[0] == "house rules"

    def test_an_announcement_notifies_the_class(self, setup):
        from apps.notifications.models import Notification

        teacher, student, klass = setup
        client_for(teacher).post(
            stream(klass), {"body": "Exam moved to Friday", "kind": "announcement"}, format="json"
        )
        assert Notification.objects.filter(user=student, type="class_post").count() == 1

    def test_a_plain_post_does_not_notify(self, setup):
        from apps.notifications.models import Notification

        teacher, student, klass = setup
        client_for(teacher).post(stream(klass), {"body": "just a note"}, format="json")
        assert Notification.objects.filter(user=student, type="class_post").count() == 0


class TestReplies:
    def _post(self, setup, **kwargs):
        teacher, _, klass = setup
        payload = {"body": "Discuss question 12.", **kwargs}
        return klass, client_for(teacher).post(stream(klass), payload, format="json").data["data"]

    def test_a_student_replies(self, setup):
        _, student, _ = setup
        klass, post = self._post(setup)
        r = client_for(student).post(
            f"{stream(klass)}{post['id']}/comments/", {"body": "I got 14."}, format="json"
        )
        assert r.status_code == 201
        assert r.data["data"]["author"]["role"] == "student"

    def test_the_reply_shows_on_the_stream(self, setup):
        _, student, _ = setup
        klass, post = self._post(setup)
        client_for(student).post(
            f"{stream(klass)}{post['id']}/comments/", {"body": "I got 14."}, format="json"
        )
        listed = client_for(student).get(stream(klass)).data["data"][0]
        assert [c["body"] for c in listed["comments"]] == ["I got 14."]

    def test_replies_can_be_closed(self, setup):
        _, student, _ = setup
        klass, post = self._post(setup, allow_comments=False)
        r = client_for(student).post(
            f"{stream(klass)}{post['id']}/comments/", {"body": "nope"}, format="json"
        )
        assert r.status_code == 403

    def test_an_outsider_cannot_reply(self, setup):
        klass, post = self._post(setup)
        r = client_for(UserFactory(role="student")).post(
            f"{stream(klass)}{post['id']}/comments/", {"body": "hi"}, format="json"
        )
        assert r.status_code == 404


class TestRemoval:
    def _post_with_reply(self, setup):
        teacher, student, klass = setup
        post = (
            client_for(teacher).post(stream(klass), {"body": "topic"}, format="json").data["data"]
        )
        comment = (
            client_for(student)
            .post(f"{stream(klass)}{post['id']}/comments/", {"body": "mine"}, format="json")
            .data["data"]
        )
        return klass, post, comment

    def test_a_student_removes_their_own_reply(self, setup):
        _, student, _ = setup
        klass, post, comment = self._post_with_reply(setup)
        r = client_for(student).delete(f"{stream(klass)}{post['id']}/comments/{comment['id']}/")
        assert r.status_code == 204
        assert ClassComment.all_objects.get(pk=comment["id"]).deleted_at is not None

    def test_a_student_cannot_remove_someone_elses(self, setup):
        klass, post, comment = self._post_with_reply(setup)
        other = UserFactory(role="student")
        ClassEnrollment.objects.create(klass=klass, student=other, status="active")
        r = client_for(other).delete(f"{stream(klass)}{post['id']}/comments/{comment['id']}/")
        assert r.status_code == 403

    def test_the_teacher_moderates_any_reply(self, setup):
        teacher, _, _ = setup
        klass, post, comment = self._post_with_reply(setup)
        r = client_for(teacher).delete(f"{stream(klass)}{post['id']}/comments/{comment['id']}/")
        assert r.status_code == 204

    def test_a_removed_post_stops_rendering(self, setup):
        teacher, student, _ = setup
        klass, post, _ = self._post_with_reply(setup)
        client_for(teacher).delete(f"{stream(klass)}{post['id']}/")
        assert client_for(student).get(stream(klass)).data["data"] == []
        assert ClassPost.all_objects.get(pk=post["id"]).deleted_at is not None

    def test_a_removed_reply_stops_rendering(self, setup):
        _, student, _ = setup
        klass, post, comment = self._post_with_reply(setup)
        client_for(student).delete(f"{stream(klass)}{post['id']}/comments/{comment['id']}/")
        listed = client_for(student).get(stream(klass)).data["data"][0]
        assert listed["comments"] == []
