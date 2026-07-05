"""
DSAT LMS v2 — F1 roles & permissions tests
Domain: Identity / Academy (foundation)
Covers: the two new roles (receptionist, academic_manager), User role properties,
        the capability matrix (single source of truth), the new permission classes,
        the shared academy scoping layer, the /staff/access-matrix/ endpoint gate,
        and regressions (/auth/me + admin user-create accept the new roles).
"""

import pytest
from rest_framework.exceptions import NotFound
from rest_framework.test import APIClient, APIRequestFactory

from apps.academy.models import Class, ClassEnrollment
from apps.academy.scoping import scoped_classes, scoped_student_or_404, scoped_students
from apps.identity.models import User
from apps.identity.services import access_matrix, capabilities_for_role
from apps.identity.tests.factories import AdminUserFactory, UserFactory
from common.permissions import (
    IsAcademicManager,
    IsAdminOrAcademicManager,
    IsAnyStaff,
    IsOperationsStaff,
    IsReceptionist,
)

pytestmark = pytest.mark.django_db

STAFF_MATRIX_URL = "/api/v1/staff/access-matrix/"
ALL_ROLES = ("public", "student", "teacher", "receptionist", "academic_manager", "admin")


def _req(user):
    request = APIRequestFactory().get("/")
    request.user = user
    return request


def authed(role):
    user = UserFactory(role=role) if role != "admin" else AdminUserFactory()
    client = APIClient()
    client.force_authenticate(user)
    client.user = user
    return client


# ─────────────────────────────────────
# Role enum + User properties
# ─────────────────────────────────────


class TestRoleEnum:
    def test_new_roles_exist(self):
        assert User.Role.RECEPTIONIST == "receptionist"
        assert User.Role.ACADEMIC_MANAGER == "academic_manager"
        assert {"receptionist", "academic_manager"} <= set(dict(User.Role.choices))

    def test_role_cluster_properties(self):
        recep = UserFactory(role="receptionist")
        manager = UserFactory(role="academic_manager")
        teacher = UserFactory(role="teacher")
        student = UserFactory(role="student")

        assert recep.is_receptionist and not recep.is_academic_manager
        assert manager.is_academic_manager and not manager.is_receptionist
        # is_academy_staff: every staff role, no students/public
        assert recep.is_academy_staff and manager.is_academy_staff and teacher.is_academy_staff
        assert not student.is_academy_staff
        # can_read_all_students: admin/manager/receptionist, NOT teacher
        assert recep.can_read_all_students and manager.can_read_all_students
        assert not teacher.can_read_all_students and not student.can_read_all_students
        # has_full_access now includes the staff roles
        assert recep.has_full_access and manager.has_full_access


# ─────────────────────────────────────
# Capability matrix (source of truth)
# ─────────────────────────────────────


class TestCapabilities:
    def test_receptionist_reads_academic_but_writes_operational_only(self):
        # Locked decision: receptionist SEES scores/risk, but does not grade/author.
        caps = capabilities_for_role("receptionist")
        assert caps["read_all_students"] is True
        assert caps["read_academic"] is True
        assert caps["write_operational"] is True
        assert caps["write_academic"] is False
        assert caps["grade"] is False
        assert caps["manage_users"] is False

    def test_academic_manager_full_academic(self):
        caps = capabilities_for_role("academic_manager")
        assert all(
            caps[k] for k in ("read_all_students", "read_academic", "grade", "write_academic")
        )
        assert caps["manage_users"] is False

    def test_teacher_scoped_not_all_students(self):
        caps = capabilities_for_role("teacher")
        assert caps["read_all_students"] is False
        assert caps["grade"] is True

    def test_admin_can_everything(self):
        caps = capabilities_for_role("admin")
        assert all(caps.values())

    def test_matrix_covers_staff_roles(self):
        matrix = access_matrix()
        assert set(matrix) == {"receptionist", "teacher", "academic_manager", "admin"}


# ─────────────────────────────────────
# Permission classes
# ─────────────────────────────────────


class TestPermissionClasses:
    @pytest.mark.parametrize(
        "role,any_staff,ops,admin_or_mgr",
        [
            ("public", False, False, False),
            ("student", False, False, False),
            ("teacher", True, True, False),
            ("receptionist", True, True, False),
            ("academic_manager", True, True, True),
            ("admin", True, True, True),
        ],
    )
    def test_truth_table(self, role, any_staff, ops, admin_or_mgr):
        user = UserFactory(role=role)
        req = _req(user)
        assert IsAnyStaff().has_permission(req, None) is any_staff
        assert IsOperationsStaff().has_permission(req, None) is ops
        assert IsAdminOrAcademicManager().has_permission(req, None) is admin_or_mgr

    def test_single_role_classes(self):
        assert IsReceptionist().has_permission(_req(UserFactory(role="receptionist")), None)
        assert not IsReceptionist().has_permission(_req(UserFactory(role="teacher")), None)
        assert IsAcademicManager().has_permission(_req(UserFactory(role="academic_manager")), None)


# ─────────────────────────────────────
# Shared academy scoping layer
# ─────────────────────────────────────


class TestScoping:
    def _class_with_student(self):
        teacher = UserFactory(role="teacher")
        student = UserFactory(role="student")
        klass = Class.objects.create(name="Group A", teacher=teacher)
        ClassEnrollment.objects.create(
            klass=klass, student=student, status=ClassEnrollment.Status.ACTIVE
        )
        return teacher, student, klass

    def test_teacher_sees_only_own(self):
        teacher, student, _ = self._class_with_student()
        other_teacher = UserFactory(role="teacher")
        Class.objects.create(name="Group B", teacher=other_teacher)

        assert scoped_classes(_req(teacher)).count() == 1
        assert scoped_student_or_404(_req(teacher), student.pk).pk == student.pk
        with pytest.raises(NotFound):
            scoped_student_or_404(_req(other_teacher), student.pk)

    def test_full_access_staff_see_all(self):
        _, student, _ = self._class_with_student()
        for role in ("admin", "academic_manager", "receptionist"):
            user = AdminUserFactory() if role == "admin" else UserFactory(role=role)
            assert scoped_classes(_req(user)).count() == Class.objects.count()
            # sees a student they don't personally teach
            assert scoped_student_or_404(_req(user), student.pk).pk == student.pk
            assert scoped_students(_req(user)).filter(pk=student.pk).exists()

    def test_student_scopes_to_nothing(self):
        student = UserFactory(role="student")
        assert scoped_classes(_req(student)).count() == 0
        assert scoped_students(_req(student)).count() == 0


# ─────────────────────────────────────
# /staff/access-matrix/ endpoint
# ─────────────────────────────────────


class TestAccessMatrixEndpoint:
    def test_unauthenticated_401(self, api_client):
        assert api_client.get(STAFF_MATRIX_URL).status_code == 401

    @pytest.mark.parametrize("role", ["public", "student"])
    def test_non_staff_forbidden(self, role):
        assert authed(role).get(STAFF_MATRIX_URL).status_code == 403

    @pytest.mark.parametrize("role", ["teacher", "receptionist", "academic_manager", "admin"])
    def test_staff_ok_with_payload(self, role):
        r = authed(role).get(STAFF_MATRIX_URL)
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["role"] == role
        assert data["capabilities"] == capabilities_for_role(role)
        assert {m["role"] for m in data["matrix"]} == {
            "receptionist",
            "teacher",
            "academic_manager",
            "admin",
        }


# ─────────────────────────────────────
# Regressions: /auth/me + admin user-create accept new roles
# ─────────────────────────────────────


class TestNewRoleRegressions:
    def test_me_returns_new_role(self):
        r = authed("receptionist").get("/api/v1/auth/me/")
        assert r.status_code == 200
        assert r.json()["data"]["user"]["role"] == "receptionist"

    def test_admin_can_create_academic_manager(self):
        client = authed("admin")
        r = client.post(
            "/api/v1/admin/users/",
            {
                "email": "new.manager@dsat.local",
                "password": "DevManager123!",
                "first_name": "New",
                "last_name": "Manager",
                "role": "academic_manager",
            },
            format="json",
        )
        assert r.status_code == 201, r.content
        assert User.objects.get(email="new.manager@dsat.local").role == "academic_manager"
