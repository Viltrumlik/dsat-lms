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
