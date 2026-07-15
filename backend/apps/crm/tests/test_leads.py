"""
DSAT LMS v2 — Leads pipeline tests (5.5a)
Domain: CRM
Covers: IsFrontOffice gate, receptionist own-lead scoping (404 out-of-scope),
        CRUD, board, stage-change activity, owner-assign notification, activities,
        follow-up tasks (create/done), atomic convert (+ dedupe 409 / guards),
        follow-up reminder task.
"""

import pytest
from rest_framework.test import APIClient

from apps.crm.models import FollowUpTask, LeadActivity
from apps.crm.tests.factories import LeadFactory
from apps.identity.models import User
from apps.identity.tests.factories import AdminUserFactory, UserFactory
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db

BASE = "/api/v1/staff/leads/"


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def reception():
    return UserFactory(role="receptionist")


def manager():
    return UserFactory(role="academic_manager")


class TestPermissions:
    def test_teacher_and_student_forbidden(self):
        assert client_for(UserFactory(role="teacher")).get(BASE).status_code == 403
        assert client_for(UserFactory(role="student")).get(BASE).status_code == 403

    def test_front_office_ok(self):
        for u in (AdminUserFactory(), manager(), reception()):
            assert client_for(u).get(BASE).status_code == 200


class TestScoping:
    def test_receptionist_sees_only_own(self):
        r1, r2 = reception(), reception()
        LeadFactory(owner=r1)
        LeadFactory(owner=r2)
        items = client_for(r1).get(BASE).data["data"]
        assert len(items) == 1 and items[0]["owner"]["id"] == str(r1.id)

    def test_admin_sees_all(self):
        LeadFactory(owner=reception())
        LeadFactory(owner=reception())
        assert len(client_for(AdminUserFactory()).get(BASE).data["data"]) == 2

    def test_receptionist_other_lead_404(self):
        other = LeadFactory(owner=reception())
        assert client_for(reception()).get(f"{BASE}{other.id}/").status_code == 404


class TestCrud:
    def test_create_defaults_owner_for_receptionist(self):
        r = reception()
        resp = client_for(r).post(BASE, {"name": "Aziza", "email": "a@x.com"}, format="json")
        assert resp.status_code == 201
        assert resp.data["data"]["owner"]["id"] == str(r.id)

    def test_stage_change_logs_activity(self):
        lead = LeadFactory(owner=reception(), stage="new")
        r = client_for(AdminUserFactory()).patch(
            f"{BASE}{lead.id}/", {"stage": "contacted"}, format="json"
        )
        assert r.status_code == 200 and r.data["data"]["stage"] == "contacted"
        assert LeadActivity.objects.filter(lead=lead, kind="stage_change").count() == 1

    def test_owner_assign_notifies(self):
        lead = LeadFactory(owner=None)
        new_owner = reception()
        client_for(AdminUserFactory()).patch(
            f"{BASE}{lead.id}/", {"owner": str(new_owner.id)}, format="json"
        )
        assert Notification.objects.filter(type="lead_assigned", user=new_owner).count() == 1

    def test_board(self):
        LeadFactory(owner=reception(), stage="new")
        LeadFactory(owner=reception(), stage="trial")
        cols = client_for(AdminUserFactory()).get(f"{BASE}board/").data["data"]["columns"]
        assert len(cols["new"]) == 1 and len(cols["trial"]) == 1 and cols["lost"] == []

    def test_soft_delete(self):
        lead = LeadFactory(owner=reception())
        c = client_for(AdminUserFactory())
        assert c.delete(f"{BASE}{lead.id}/").status_code == 204
        assert c.get(BASE).data["data"] == []


class TestActivitiesAndTasks:
    def test_add_activity(self):
        lead = LeadFactory(owner=reception())
        r = client_for(AdminUserFactory()).post(
            f"{BASE}{lead.id}/activities/",
            {"kind": "call", "body": "Called, no answer"},
            format="json",
        )
        assert r.status_code == 201
        assert lead.activities.filter(kind="call").count() == 1

    def test_create_and_complete_task(self):
        lead = LeadFactory(owner=reception())
        c = client_for(AdminUserFactory())
        created = c.post(
            f"{BASE}{lead.id}/tasks/",
            {"title": "Follow up", "due_at": "2026-08-01T09:00:00Z"},
            format="json",
        )
        assert created.status_code == 201
        task_id = created.data["data"]["id"]
        # Defaults assignee to the lead owner.
        assert created.data["data"]["assignee"]["id"] == str(lead.owner_id)
        done = c.patch(f"{BASE}tasks/{task_id}/", {"done": True}, format="json")
        assert done.status_code == 200 and done.data["data"]["done"] is True
        assert FollowUpTask.objects.get(id=task_id).done_at is not None

    def test_open_tasks_excludes_soft_deleted(self):
        # Review finding: the open_tasks badge annotation must not count a
        # soft-deleted (but still done=False) follow-up task.
        lead = LeadFactory(owner=reception())
        FollowUpTask.objects.create(lead=lead, title="A", due_at="2026-08-01T09:00:00Z")
        gone = FollowUpTask.objects.create(lead=lead, title="B", due_at="2026-08-01T09:00:00Z")
        gone.soft_delete()
        rows = client_for(AdminUserFactory()).get(BASE).data["data"]
        assert rows[0]["open_tasks"] == 1

    def test_owner_must_be_front_office(self):
        # Review finding: a student/teacher can't own a lead.
        student = UserFactory(role="student")
        r = client_for(AdminUserFactory()).post(
            BASE, {"name": "X", "owner": str(student.id)}, format="json"
        )
        assert r.status_code == 400


class TestConversion:
    def test_convert_creates_student(self):
        lead = LeadFactory(owner=reception(), name="Nodir Aliyev", email="nodir@x.com")
        r = client_for(AdminUserFactory()).post(f"{BASE}{lead.id}/convert/", {}, format="json")
        assert r.status_code == 200, r.data
        lead.refresh_from_db()
        assert lead.stage == "registered" and lead.converted_user_id is not None
        user = User.objects.get(email="nodir@x.com")
        assert user.role == "student" and user.first_name == "Nodir" and user.last_name == "Aliyev"
        assert hasattr(user, "student_profile")
        assert not user.has_usable_password()

    def test_convert_dedupe_409(self):
        UserFactory(email="dupe@x.com", role="student")
        lead = LeadFactory(owner=reception(), email="dupe@x.com")
        r = client_for(AdminUserFactory()).post(f"{BASE}{lead.id}/convert/", {}, format="json")
        assert r.status_code == 409
        lead.refresh_from_db()
        assert lead.converted_user_id is None  # unchanged

    def test_convert_requires_email(self):
        lead = LeadFactory(owner=reception(), email="")
        r = client_for(AdminUserFactory()).post(f"{BASE}{lead.id}/convert/", {}, format="json")
        assert r.status_code == 400

    def test_convert_twice_409(self):
        lead = LeadFactory(owner=reception(), email="once@x.com")
        c = client_for(AdminUserFactory())
        assert c.post(f"{BASE}{lead.id}/convert/", {}, format="json").status_code == 200
        assert c.post(f"{BASE}{lead.id}/convert/", {}, format="json").status_code == 409


class TestReminders:
    def test_follow_up_reminder_notifies_once(self):
        from apps.crm.tasks import send_follow_up_reminders

        assignee = reception()
        lead = LeadFactory(owner=assignee)
        FollowUpTask.objects.create(
            lead=lead, assignee=assignee, title="Call", due_at="2026-01-01T00:00:00Z"
        )
        assert send_follow_up_reminders() == 1
        assert Notification.objects.filter(type="follow_up_due", user=assignee).count() == 1
        # Idempotent: a second run does not re-notify.
        assert send_follow_up_reminders() == 0
