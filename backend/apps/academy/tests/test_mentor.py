"""
DSAT LMS v2 — Academy S6 Academic Mentor tests
Domain: Academy
Covers: assign/reassign/unassign (mentor mirror + append-only history + notify);
    staff-only mentor guard; auto-close on graduate/drop; unique-active constraint;
    check-in + parent-contact (guardian-belongs validation); mentor row-scoping
    (mentor sees their mentee, a non-mentor teacher gets 404, full-access sees any);
    mentees list; the weekly check-in reminder; profile serializer exposes mentor.
"""

import pytest
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from apps.academy.models import Guardian, MentorAssignment
from apps.academy.services import (
    assign_mentor,
    change_student_status,
    get_or_create_student_profile,
    log_mentor_check_in,
    log_parent_contact,
    unassign_mentor,
)
from apps.academy.tasks import send_mentor_checkin_reminders
from apps.identity.tests.factories import AdminUserFactory, UserFactory
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db

STUDENTS = "/api/v1/students/"
TEACHER = "/api/v1/teacher/"


def authed(role="student", user=None):
    user = user or (AdminUserFactory() if role == "admin" else UserFactory(role=role))
    client = APIClient()
    client.force_authenticate(user)
    client.user = user
    return client


def profile_for(student=None):
    return get_or_create_student_profile(student or UserFactory(role="student"))


# ─────────────────────────────────────
# Assignment (service)
# ─────────────────────────────────────


class TestAssign:
    def test_assign_sets_mirror_history_and_notifies(self):
        profile = profile_for()
        mentor = UserFactory(role="teacher")
        assign_mentor(profile, mentor, by=AdminUserFactory())
        profile.refresh_from_db()
        assert profile.mentor_id == mentor.id
        assert profile.mentor_assigned_at is not None
        assert (
            MentorAssignment.objects.filter(
                profile=profile, mentor=mentor, ended_at__isnull=True
            ).count()
            == 1
        )
        assert Notification.objects.filter(
            user=mentor, type=Notification.Type.MENTOR_ASSIGNED
        ).exists()

    def test_reassign_closes_previous(self):
        profile = profile_for()
        first, second = UserFactory(role="teacher"), UserFactory(role="teacher")
        assign_mentor(profile, first)
        assign_mentor(profile, second)
        assert MentorAssignment.objects.filter(profile=profile, ended_at__isnull=True).count() == 1
        assert MentorAssignment.objects.filter(
            profile=profile, mentor=first, ended_at__isnull=False
        ).exists()
        profile.refresh_from_db()
        assert profile.mentor_id == second.id

    def test_cannot_assign_student(self):
        with pytest.raises(ValueError, match="not_staff"):
            assign_mentor(profile_for(), UserFactory(role="student"))

    def test_same_mentor_rejected(self):
        profile = profile_for()
        mentor = UserFactory(role="teacher")
        assign_mentor(profile, mentor)
        with pytest.raises(ValueError, match="same_mentor"):
            assign_mentor(profile, mentor)

    def test_unassign_clears_and_ends(self):
        profile = profile_for()
        assign_mentor(profile, UserFactory(role="teacher"))
        unassign_mentor(profile)
        profile.refresh_from_db()
        assert profile.mentor_id is None
        assert not MentorAssignment.objects.filter(profile=profile, ended_at__isnull=True).exists()

    def test_graduating_ends_mentorship(self):
        profile = profile_for()
        assign_mentor(profile, UserFactory(role="teacher"))
        change_student_status(profile, "graduated")
        profile.refresh_from_db()
        assert profile.mentor_id is None
        assert not MentorAssignment.objects.filter(profile=profile, ended_at__isnull=True).exists()

    def test_unique_active_constraint(self):
        profile = profile_for()
        MentorAssignment.objects.create(profile=profile, mentor=UserFactory(role="teacher"))
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                MentorAssignment.objects.create(profile=profile, mentor=UserFactory(role="teacher"))


# ─────────────────────────────────────
# Check-ins + parent contacts
# ─────────────────────────────────────


class TestLogs:
    def test_parent_contact_guardian_mismatch(self):
        profile = profile_for()
        other = profile_for()
        guardian = Guardian.objects.create(profile=other, name="X", relation="mother")
        with pytest.raises(ValueError, match="guardian_mismatch"):
            log_parent_contact(profile, guardian, author=UserFactory(role="teacher"), method="call")


# ─────────────────────────────────────
# Endpoints + scoping
# ─────────────────────────────────────


class TestEndpoints:
    def test_manager_assigns_via_api(self):
        student = UserFactory(role="student")
        profile_for(student)
        mentor = UserFactory(role="teacher")
        r = authed(role="academic_manager").post(
            STUDENTS + f"{student.id}/mentor/", {"mentor": str(mentor.id)}, format="json"
        )
        assert r.status_code == 200
        assert r.json()["data"]["mentor"]["id"] == str(mentor.id)

    def test_teacher_cannot_assign(self):
        student = UserFactory(role="student")
        profile_for(student)
        r = authed(role="teacher").post(
            STUDENTS + f"{student.id}/mentor/",
            {"mentor": str(UserFactory(role="teacher").id)},
            format="json",
        )
        assert r.status_code == 403

    def test_manager_assigns_by_email(self):
        student = UserFactory(role="student")
        profile_for(student)
        mentor = UserFactory(role="teacher", email="mentor@dsat.local")
        r = authed(role="academic_manager").post(
            STUDENTS + f"{student.id}/mentor/", {"email": "mentor@dsat.local"}, format="json"
        )
        assert r.status_code == 200
        assert r.json()["data"]["mentor"]["id"] == str(mentor.id)

    def test_assign_by_unknown_email_400(self):
        student = UserFactory(role="student")
        profile_for(student)
        r = authed(role="admin").post(
            STUDENTS + f"{student.id}/mentor/", {"email": "nobody@dsat.local"}, format="json"
        )
        assert r.status_code == 400

    def test_mentee_detail_scoped(self):
        student = UserFactory(role="student")
        profile = profile_for(student)
        mentor = UserFactory(role="teacher")
        assign_mentor(profile, mentor)
        Guardian.objects.create(profile=profile, name="Mom", relation="mother")
        # the mentor sees the mentee + guardians
        mine = authed(role="teacher", user=mentor).get(STUDENTS + f"{student.id}/mentee/")
        assert mine.status_code == 200
        assert mine.json()["data"]["student"]["id"] == str(student.id)
        assert len(mine.json()["data"]["guardians"]) == 1
        # a different teacher (not the mentor) → 404
        other = authed(role="teacher").get(STUDENTS + f"{student.id}/mentee/")
        assert other.status_code == 404

    def test_unassign_via_api(self):
        student = UserFactory(role="student")
        profile = profile_for(student)
        assign_mentor(profile, UserFactory(role="teacher"))
        r = authed(role="admin").post(
            STUDENTS + f"{student.id}/mentor/", {"mentor": None}, format="json"
        )
        assert r.status_code == 200
        assert r.json()["data"]["mentor"] is None

    def test_mentor_creates_and_lists_checkins(self):
        student = UserFactory(role="student")
        mentor = UserFactory(role="teacher")
        assign_mentor(profile_for(student), mentor)
        client = authed(role="teacher", user=mentor)
        created = client.post(
            STUDENTS + f"{student.id}/checkins/", {"note": "Doing well"}, format="json"
        )
        assert created.status_code == 201
        listed = client.get(STUDENTS + f"{student.id}/checkins/")
        assert listed.json()["data"][0]["note"] == "Doing well"

    def test_non_mentor_teacher_404(self):
        student = UserFactory(role="student")
        assign_mentor(profile_for(student), UserFactory(role="teacher"))
        r = authed(role="teacher").get(STUDENTS + f"{student.id}/checkins/")  # a different teacher
        assert r.status_code == 404

    def test_full_access_sees_any(self):
        student = UserFactory(role="student")
        profile = profile_for(student)
        assign_mentor(profile, UserFactory(role="teacher"))
        log_mentor_check_in(profile, profile.mentor, "note")
        r = authed(role="admin").get(STUDENTS + f"{student.id}/checkins/")
        assert r.status_code == 200 and len(r.json()["data"]) == 1

    def test_mentees_list(self):
        mentor = UserFactory(role="teacher")
        mine = UserFactory(role="student")
        assign_mentor(profile_for(mine), mentor)
        assign_mentor(profile_for(UserFactory(role="student")), UserFactory(role="teacher"))
        r = authed(role="teacher", user=mentor).get(TEACHER + "mentees/")
        assert len(r.json()["data"]) == 1
        assert r.json()["data"][0]["student"]["id"] == str(mine.id)

    def test_parent_contact_via_api(self):
        student = UserFactory(role="student")
        profile = profile_for(student)
        mentor = UserFactory(role="teacher")
        assign_mentor(profile, mentor)
        guardian = Guardian.objects.create(profile=profile, name="Mom", relation="mother")
        r = authed(role="teacher", user=mentor).post(
            STUDENTS + f"{student.id}/parent-contacts/",
            {"guardian": str(guardian.id), "method": "call", "note": "Called"},
            format="json",
        )
        assert r.status_code == 201

    def test_parent_contact_wrong_guardian_rejected(self):
        student = UserFactory(role="student")
        mentor = UserFactory(role="teacher")
        assign_mentor(profile_for(student), mentor)
        other_guardian = Guardian.objects.create(profile=profile_for(), name="X", relation="mother")
        r = authed(role="teacher", user=mentor).post(
            STUDENTS + f"{student.id}/parent-contacts/",
            {"guardian": str(other_guardian.id)},
            format="json",
        )
        assert r.status_code == 400

    def test_soft_deleted_mentee_is_404_and_hidden_from_list(self):
        # A mentor keeps no access to a mentee whose account was soft-deleted
        # (account soft-delete doesn't close mentorship, so the mirror survives).
        student = UserFactory(role="student")
        mentor = UserFactory(role="teacher")
        assign_mentor(profile_for(student), mentor)
        student.soft_delete()
        client = authed(role="teacher", user=mentor)
        assert client.get(STUDENTS + f"{student.id}/mentee/").status_code == 404
        assert client.get(STUDENTS + f"{student.id}/checkins/").status_code == 404
        assert client.get(TEACHER + "mentees/").json()["data"] == []

    def test_soft_deleted_mentee_404_for_full_access(self):
        student = UserFactory(role="student")
        assign_mentor(profile_for(student), UserFactory(role="teacher"))
        student.soft_delete()
        assert authed(role="admin").get(STUDENTS + f"{student.id}/mentee/").status_code == 404

    def test_profile_serializer_exposes_mentor(self):
        student = UserFactory(role="student")
        mentor = UserFactory(role="teacher")
        assign_mentor(profile_for(student), mentor)
        r = authed(role="admin").get(STUDENTS + f"{student.id}/")
        assert r.json()["data"]["mentor"]["id"] == str(mentor.id)


# ─────────────────────────────────────
# Weekly reminder beat
# ─────────────────────────────────────


class TestReminder:
    def test_reminds_overdue(self):
        mentor = UserFactory(role="teacher")
        assign_mentor(profile_for(), mentor)  # never checked in → overdue
        assert send_mentor_checkin_reminders() >= 1
        assert Notification.objects.filter(
            user=mentor, type=Notification.Type.MENTOR_CHECKIN_DUE
        ).exists()

    def test_skips_recently_checked(self):
        mentor = UserFactory(role="teacher")
        profile = profile_for()
        assign_mentor(profile, mentor)
        log_mentor_check_in(profile, mentor, "recent")
        assert send_mentor_checkin_reminders() == 0

    def test_reassigned_mentor_reminded_despite_prior_checkin(self):
        # A checks in (recent); the student is reassigned to B. B has never checked
        # in, so B must still be reminded — staleness is per the current mentor.
        first, second = UserFactory(role="teacher"), UserFactory(role="teacher")
        profile = profile_for()
        assign_mentor(profile, first)
        log_mentor_check_in(profile, first, "recent")
        assign_mentor(profile, second)
        assert send_mentor_checkin_reminders() == 1
        assert Notification.objects.filter(
            user=second, type=Notification.Type.MENTOR_CHECKIN_DUE
        ).exists()
        assert not Notification.objects.filter(
            user=first, type=Notification.Type.MENTOR_CHECKIN_DUE
        ).exists()

    def test_skips_soft_deleted_mentee(self):
        mentor = UserFactory(role="teacher")
        student = UserFactory(role="student")
        assign_mentor(profile_for(student), mentor)  # never checked in → overdue
        student.soft_delete()
        assert send_mentor_checkin_reminders() == 0
