"""
DSAT LMS v2 — Support S2 "Ask a Question" tests
Domain: Support
Covers: ticket create (+ own-attachment linking + reject others' files), own-only
    scoping, the reply thread (student + staff), the first-staff-answer transition
    (answered + immutable answered_at), reply-on-closed guard, close/reopen
    transitions, the shared staff pool + filters + assign (staff-only assignee),
    and support_reply notifications.
"""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.files.models import Attachment
from apps.identity.tests.factories import UserFactory
from apps.notifications.models import Notification
from apps.support.models import SupportTicket, TicketReply

pytestmark = pytest.mark.django_db

BASE = "/api/v1/support/"


def authed(role="student", user=None):
    user = user or UserFactory(role=role)
    client = APIClient()
    client.force_authenticate(user)
    client.user = user
    return client


def make_attachment(owner):
    return Attachment.objects.create(
        owner=owner,
        uploaded_by=owner,
        file=SimpleUploadedFile("q.png", b"x", content_type="image/png"),
        original_name="q.png",
        content_type="image/png",
        size=1,
        kind="document",
    )


def make_ticket(student, **kwargs):
    return SupportTicket.objects.create(
        student=student, subject=kwargs.get("subject", "math"), body=kwargs.get("body", "Question?")
    )


# ─────────────────────────────────────
# Create
# ─────────────────────────────────────


class TestTicketCreate:
    def test_creates_open_ticket(self):
        client = authed(role="student")
        r = client.post(
            BASE + "tickets/", {"subject": "math", "body": "How do I factor?"}, format="json"
        )
        assert r.status_code == 201, r.content
        data = r.json()["data"]
        assert data["status"] == "open"
        assert data["subject"] == "math"
        assert data["priority"] == "normal"
        assert data["replies"] == []

    def test_links_own_attachment(self):
        client = authed(role="student")
        att = make_attachment(client.user)
        r = client.post(
            BASE + "tickets/",
            {"subject": "math", "body": "see file", "attachment_ids": [str(att.id)]},
            format="json",
        )
        assert r.status_code == 201
        attachments = r.json()["data"]["attachments"]
        assert len(attachments) == 1
        assert attachments[0]["original_name"] == "q.png"

    def test_rejects_another_users_attachment(self):
        client = authed(role="student")
        other = make_attachment(UserFactory(role="student"))
        r = client.post(
            BASE + "tickets/",
            {"subject": "math", "body": "x", "attachment_ids": [str(other.id)]},
            format="json",
        )
        assert r.status_code == 400
        assert not SupportTicket.objects.exists()  # atomic — nothing created

    def test_public_user_forbidden(self):
        r = authed(role="public").post(
            BASE + "tickets/", {"subject": "math", "body": "x"}, format="json"
        )
        assert r.status_code == 403


# ─────────────────────────────────────
# Own-only scoping
# ─────────────────────────────────────


class TestTicketScoping:
    def test_lists_only_own(self):
        client = authed(role="student")
        make_ticket(client.user)
        make_ticket(UserFactory(role="student"))
        r = client.get(BASE + "tickets/")
        assert len(r.json()["data"]) == 1

    def test_cannot_view_others_ticket(self):
        other = make_ticket(UserFactory(role="student"))
        assert authed(role="student").get(BASE + f"tickets/{other.id}/").status_code == 404

    def test_cannot_reply_to_others_ticket(self):
        other = make_ticket(UserFactory(role="student"))
        r = authed(role="student").post(
            BASE + f"tickets/{other.id}/replies/", {"body": "hi"}, format="json"
        )
        assert r.status_code == 404


# ─────────────────────────────────────
# Replies + answered transition
# ─────────────────────────────────────


class TestTicketReplies:
    def test_staff_answer_sets_answered_and_notifies_student(self):
        student = UserFactory(role="student")
        ticket = make_ticket(student)
        staff = authed(role="teacher")
        r = staff.post(
            BASE + f"staff/tickets/{ticket.id}/replies/",
            {"body": "Factor by grouping."},
            format="json",
        )
        assert r.status_code == 201
        ticket.refresh_from_db()
        assert ticket.status == "answered"
        assert ticket.answered_at is not None
        assert Notification.objects.filter(
            user=student, type=Notification.Type.SUPPORT_REPLY
        ).exists()

    def test_answered_at_is_immutable(self):
        ticket = make_ticket(UserFactory(role="student"))
        staff = authed(role="teacher")
        staff.post(BASE + f"staff/tickets/{ticket.id}/replies/", {"body": "first"}, format="json")
        ticket.refresh_from_db()
        first_answered = ticket.answered_at
        staff.post(BASE + f"staff/tickets/{ticket.id}/replies/", {"body": "second"}, format="json")
        ticket.refresh_from_db()
        assert ticket.answered_at == first_answered

    def test_student_reply_bumps_last_reply_at(self):
        client = authed(role="student")
        ticket = make_ticket(client.user)
        assert ticket.last_reply_at is None
        client.post(BASE + f"tickets/{ticket.id}/replies/", {"body": "still stuck"}, format="json")
        ticket.refresh_from_db()
        assert ticket.last_reply_at is not None
        assert ticket.status == "open"  # student reply doesn't answer

    def test_reply_to_closed_ticket_rejected(self):
        client = authed(role="student")
        ticket = make_ticket(client.user)
        client.post(BASE + f"tickets/{ticket.id}/status/", {"status": "closed"}, format="json")
        r = client.post(BASE + f"tickets/{ticket.id}/replies/", {"body": "more"}, format="json")
        assert r.status_code == 400

    def test_student_reply_on_assigned_ticket_notifies_assignee(self):
        client = authed(role="student")
        assignee = UserFactory(role="teacher")
        ticket = make_ticket(client.user)
        ticket.assigned_to = assignee
        ticket.save(update_fields=["assigned_to"])
        client.post(BASE + f"tickets/{ticket.id}/replies/", {"body": "ping"}, format="json")
        assert Notification.objects.filter(
            user=assignee, type=Notification.Type.SUPPORT_REPLY
        ).exists()

    def test_student_reply_on_unassigned_sends_no_notification(self):
        client = authed(role="student")
        ticket = make_ticket(client.user)
        before = Notification.objects.count()
        client.post(BASE + f"tickets/{ticket.id}/replies/", {"body": "ping"}, format="json")
        assert Notification.objects.count() == before


# ─────────────────────────────────────
# Status transitions
# ─────────────────────────────────────


class TestTicketStatus:
    def test_student_closes_and_reopens(self):
        client = authed(role="student")
        ticket = make_ticket(client.user)
        assert (
            client.post(
                BASE + f"tickets/{ticket.id}/status/", {"status": "closed"}, format="json"
            ).json()["data"]["status"]
            == "closed"
        )
        assert (
            client.post(
                BASE + f"tickets/{ticket.id}/status/", {"status": "open"}, format="json"
            ).json()["data"]["status"]
            == "open"
        )

    def test_same_status_rejected(self):
        client = authed(role="student")
        ticket = make_ticket(client.user)
        r = client.post(BASE + f"tickets/{ticket.id}/status/", {"status": "open"}, format="json")
        assert r.status_code == 400

    def test_cannot_reopen_answered_directly(self):
        # answered → open is not a valid manual transition (only closed → open).
        ticket = make_ticket(UserFactory(role="student"))
        staff = authed(role="teacher")
        staff.post(BASE + f"staff/tickets/{ticket.id}/replies/", {"body": "ans"}, format="json")
        r = staff.post(
            BASE + f"staff/tickets/{ticket.id}/status/", {"status": "open"}, format="json"
        )
        assert r.status_code == 400


# ─────────────────────────────────────
# Staff pool + assign + permissions
# ─────────────────────────────────────


class TestStaffQueue:
    def test_staff_sees_all_tickets(self):
        make_ticket(UserFactory(role="student"))
        make_ticket(UserFactory(role="student"))
        r = authed(role="teacher").get(BASE + "staff/tickets/")
        assert len(r.json()["data"]) == 2  # pool — not row-scoped

    def test_unassigned_filter(self):
        t1 = make_ticket(UserFactory(role="student"))
        t2 = make_ticket(UserFactory(role="student"))
        staff = authed(role="teacher")
        t2.assigned_to = staff.user
        t2.save(update_fields=["assigned_to"])
        r = staff.get(BASE + "staff/tickets/?assigned=unassigned")
        ids = [row["id"] for row in r.json()["data"]]
        assert str(t1.id) in ids and str(t2.id) not in ids

    def test_assign_to_staff(self):
        ticket = make_ticket(UserFactory(role="student"))
        staff = authed(role="teacher")
        r = staff.post(
            BASE + f"staff/tickets/{ticket.id}/assign/",
            {"assignee": str(staff.user.id)},
            format="json",
        )
        assert r.status_code == 200
        assert r.json()["data"]["assigned_to"]["id"] == str(staff.user.id)

    def test_cannot_assign_to_student(self):
        ticket = make_ticket(UserFactory(role="student"))
        student = UserFactory(role="student")
        r = authed(role="admin").post(
            BASE + f"staff/tickets/{ticket.id}/assign/",
            {"assignee": str(student.id)},
            format="json",
        )
        assert r.status_code == 400

    def test_receptionist_can_answer(self):
        ticket = make_ticket(UserFactory(role="student"))
        r = authed(role="receptionist").post(
            BASE + f"staff/tickets/{ticket.id}/replies/", {"body": "front desk"}, format="json"
        )
        assert r.status_code == 201
        assert TicketReply.objects.filter(ticket=ticket, is_staff_answer=True).exists()

    def test_student_cannot_access_staff_queue(self):
        assert authed(role="student").get(BASE + "staff/tickets/").status_code == 403


class TestTicketAttachmentAccess:
    """A teacher answering a pooled ticket must be able to read its (student-owned)
    attachments, but not unrelated student files."""

    def test_staff_can_access_ticket_linked_attachment(self):
        from apps.files.services import can_access_attachment
        from apps.support.models import SupportTicketAttachment

        student = UserFactory(role="student")
        att = make_attachment(student)
        ticket = make_ticket(student)
        SupportTicketAttachment.objects.create(ticket=ticket, attachment=att)
        assert can_access_attachment(UserFactory(role="teacher"), att) is True

    def test_teacher_cannot_access_unlinked_student_file(self):
        from apps.files.services import can_access_attachment

        att = make_attachment(UserFactory(role="student"))  # not linked to any ticket
        assert can_access_attachment(UserFactory(role="teacher"), att) is False
