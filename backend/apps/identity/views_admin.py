# apps/identity/views_admin.py
# Domain: Identity
# Description: Admin user management — list/create, detail/update, role change,
#             deactivate/reactivate, soft-delete, set-password.
#             Mounted at /api/v1/admin/users/.
# Permissions: IsAdmin (role == 'admin') on every endpoint.

import csv
import io

from django.db.models import Q
from django.utils.crypto import get_random_string
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from apps.audit.services import record_activity
from common.exceptions import ValidationError
from common.pagination import CursorPagination
from common.permissions import IsAdmin
from common.responses import created_response, no_content_response, success_response

from .models import OrgSetting, User
from .serializers_admin import (
    AdminSetPasswordSerializer,
    AdminUserCreateSerializer,
    AdminUserRoleSerializer,
    AdminUserSerializer,
    AdminUserUpdateSerializer,
    OrgSettingSerializer,
)
from .views import _blacklist_user_tokens

_TRUE = {"true", "1", "yes", "on"}
_FALSE = {"false", "0", "no", "off"}


def _bool_param(value):
    """Parse a query-param boolean. Returns None if absent/unrecognized."""
    if value is None:
        return None
    v = value.strip().lower()
    if v in _TRUE:
        return True
    if v in _FALSE:
        return False
    return None


def _get_user(pk):
    """Fetch a user by pk. User.objects is unfiltered (no soft-delete manager),
    so soft-deleted users stay reachable for inspection / reactivation."""
    user = User.objects.filter(pk=pk).first()
    if user is None:
        raise NotFound("User not found.")
    return user


def _reject_self(request, user, message, field=None):
    """Return an error Response if the target is the requesting admin, else None.
    Guards against an admin locking themselves out or demoting their own role."""
    if str(user.id) == str(request.user.id):
        return ValidationError(message, field=field).to_response()
    return None


_LAST_ADMIN_MSG = "At least one active admin must remain."


def _would_orphan_admins(user):
    """True when `user` is the only remaining active admin — so demoting, deactivating,
    or deleting them would leave the platform with zero admins.

    Defense-in-depth: the practical lockout is already prevented (an admin can't act on
    themselves — see _reject_self — and simplejwt rejects inactive users at auth, so the
    acting admin is always another active admin). This makes the invariant explicit and
    guards against future changes."""
    if user.role != User.Role.ADMIN:
        return False
    return not (
        User.objects.filter(role=User.Role.ADMIN, is_active=True, deleted_at__isnull=True)
        .exclude(pk=user.pk)
        .exists()
    )


class AdminUserListCreateView(APIView):
    """GET: paginated, filterable user list. POST: create a user of any role."""

    permission_classes = [IsAdmin]

    def get(self, request):
        qs = User.objects.all()

        # Soft-deleted users are hidden unless explicitly requested.
        if _bool_param(request.query_params.get("include_deleted")) is not True:
            qs = qs.filter(deleted_at__isnull=True)

        role = (request.query_params.get("role") or "").strip()
        if role:
            qs = qs.filter(role=role)

        is_active = _bool_param(request.query_params.get("is_active"))
        if is_active is not None:
            qs = qs.filter(is_active=is_active)

        is_verified = _bool_param(request.query_params.get("is_email_verified"))
        if is_verified is not None:
            qs = qs.filter(is_email_verified=is_verified)

        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )

        qs = qs.order_by("-created_at")
        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(AdminUserSerializer(page, many=True).data)

    def post(self, request):
        serializer = AdminUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        record_activity(
            actor=request.user,
            action="user.created",
            target=user,
            summary=f"Created {user.email}",
            request=request,
            role=user.role,
        )
        return created_response(AdminUserSerializer(user).data)


class AdminUserDetailView(APIView):
    """GET / PATCH a single user; DELETE soft-deletes it."""

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return success_response(AdminUserSerializer(_get_user(pk)).data)

    def patch(self, request, pk):
        user = _get_user(pk)
        serializer = AdminUserUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(AdminUserSerializer(user).data)

    def delete(self, request, pk):
        user = _get_user(pk)
        rejected = _reject_self(request, user, "You cannot delete your own account.")
        if rejected:
            return rejected
        if _would_orphan_admins(user):
            return ValidationError(_LAST_ADMIN_MSG).to_response()
        user.soft_delete()  # sets deleted_at + is_active=False
        record_activity(
            actor=request.user,
            action="user.deleted",
            target=user,
            summary=f"Soft-deleted {user.email}",
            request=request,
        )
        return no_content_response()


class AdminUserRoleView(APIView):
    """PATCH a user's role (dedicated endpoint per the API spec)."""

    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        user = _get_user(pk)
        rejected = _reject_self(request, user, "You cannot change your own role.", field="role")
        if rejected:
            return rejected
        serializer = AdminUserRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_role = serializer.validated_data["role"]
        if new_role != User.Role.ADMIN and _would_orphan_admins(user):
            return ValidationError(_LAST_ADMIN_MSG, field="role").to_response()
        old_role = user.role
        user.role = new_role
        user.save(update_fields=["role", "updated_at"])
        record_activity(
            actor=request.user,
            action="user.role_changed",
            target=user,
            summary=f"{user.email}: {old_role} → {new_role}",
            request=request,
            from_role=old_role,
            to_role=new_role,
        )
        return success_response(AdminUserSerializer(user).data)


class AdminUserDeactivateView(APIView):
    """Disable a user's account (is_active=False) without deleting it."""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        user = _get_user(pk)
        rejected = _reject_self(request, user, "You cannot deactivate your own account.")
        if rejected:
            return rejected
        if _would_orphan_admins(user):
            return ValidationError(_LAST_ADMIN_MSG).to_response()
        if user.is_active:
            user.is_active = False
            user.save(update_fields=["is_active", "updated_at"])
            record_activity(
                actor=request.user,
                action="user.deactivated",
                target=user,
                summary=f"Deactivated {user.email}",
                request=request,
            )
        return success_response(AdminUserSerializer(user).data)


class AdminUserReactivateView(APIView):
    """Re-enable a user — clears is_active and any soft-delete."""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        user = _get_user(pk)
        changed = []
        if not user.is_active:
            user.is_active = True
            changed.append("is_active")
        if user.deleted_at is not None:
            user.deleted_at = None
            changed.append("deleted_at")
        if changed:
            user.save(update_fields=changed + ["updated_at"])
            record_activity(
                actor=request.user,
                action="user.reactivated",
                target=user,
                summary=f"Reactivated {user.email}",
                request=request,
            )
        return success_response(AdminUserSerializer(user).data)


class AdminUserSetPasswordView(APIView):
    """Admin sets a new password for a user; invalidates existing sessions."""

    permission_classes = [IsAdmin]
    throttle_scope = "admin_set_password"

    def post(self, request, pk):
        user = _get_user(pk)
        # Admins change their OWN password via the settings page (which verifies the
        # current password); doing it here would blacklist their tokens mid-session.
        rejected = _reject_self(request, user, "Use the settings page to change your own password.")
        if rejected:
            return rejected
        serializer = AdminSetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        _blacklist_user_tokens(user)  # log out every existing session
        record_activity(
            actor=request.user,
            action="user.password_set",
            target=user,
            summary=f"Set password for {user.email}",
            request=request,
        )
        return success_response({"detail": "Password updated."})


class AdminUserImportView(APIView):
    """Bulk-create users from a CSV (header row: email, first_name, last_name, role,
    password?). Missing passwords are randomized (users recover via password reset).
    Existing emails are skipped and malformed rows reported — partial success is fine.
    Accepts a multipart `file` upload or a `csv` text field."""

    permission_classes = [IsAdmin]

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is not None:
            raw = upload.read().decode("utf-8-sig", errors="replace")
        else:
            raw = request.data.get("csv") or ""
        if not raw.strip():
            return ValidationError("Provide a CSV file or csv text.", field="file").to_response()

        valid_roles = set(User.Role.values)
        created, skipped, errors = [], [], []
        reader = csv.DictReader(io.StringIO(raw))
        for line, row in enumerate(reader, start=2):  # row 1 is the header
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            email = row.get("email", "").lower()
            role = row.get("role") or "student"
            first, last = row.get("first_name", ""), row.get("last_name", "")
            if not email:
                errors.append({"line": line, "error": "Missing email."})
            elif role not in valid_roles:
                errors.append({"line": line, "error": f"Invalid role: {role}"})
            elif not first or not last:
                errors.append({"line": line, "error": "Missing first_name/last_name."})
            elif User.objects.filter(email__iexact=email).exists():
                skipped.append({"email": email, "reason": "already exists"})
            else:
                User.objects.create_user(
                    email=email,
                    password=row.get("password") or get_random_string(16),
                    first_name=first,
                    last_name=last,
                    role=role,
                    is_email_verified=True,
                )
                created.append(email)

        return success_response(
            {
                "created_count": len(created),
                "skipped_count": len(skipped),
                "error_count": len(errors),
                "created": created,
                "skipped": skipped,
                "errors": errors,
            }
        )


class AdminSearchView(APIView):
    """Global admin search — grouped hits across users, questions, exams, classes.
    `icontains` (FTS is the documented long-term plan); capped per group. IsAdmin.
    Powers the ⌘K command palette."""

    permission_classes = [IsAdmin]
    _CAP = 6

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        groups = []
        if len(q) < 2:
            return success_response({"groups": groups})

        users = (
            User.objects.filter(deleted_at__isnull=True)
            .filter(Q(email__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q))
            .order_by("-created_at")[: self._CAP]
        )
        if users:
            groups.append(
                {
                    "type": "users",
                    "items": [
                        {
                            "id": str(u.id),
                            "title": u.get_full_name() or u.email,
                            "subtitle": u.email,
                            "url": "/admin/users",
                        }
                        for u in users
                    ],
                }
            )

        # Cross-app models are lazy-imported (keeps identity's import graph one-way).
        from apps.question_bank.models import Question

        questions = Question.objects.filter(stem__icontains=q).order_by("-created_at")[: self._CAP]
        if questions:
            groups.append(
                {
                    "type": "questions",
                    "items": [
                        {
                            "id": str(qq.id),
                            "title": qq.stem[:80],
                            "subtitle": qq.status,
                            "url": f"/admin/questions/{qq.id}",
                        }
                        for qq in questions
                    ],
                }
            )

        from apps.assessments.models import ExamTemplate

        exams = ExamTemplate.objects.filter(title__icontains=q).order_by("-created_at")[: self._CAP]
        if exams:
            groups.append(
                {
                    "type": "exams",
                    "items": [
                        {
                            "id": str(e.id),
                            "title": e.title,
                            "subtitle": getattr(e, "type", ""),
                            "url": f"/admin/exams/{e.id}",
                        }
                        for e in exams
                    ],
                }
            )

        from apps.academy.models import Class

        classes = Class.objects.filter(name__icontains=q).order_by("-created_at")[: self._CAP]
        if classes:
            groups.append(
                {
                    "type": "classes",
                    "items": [
                        {
                            "id": str(c.id),
                            "title": c.name,
                            "subtitle": None,
                            "url": f"/teacher/classes/{c.id}",
                        }
                        for c in classes
                    ],
                }
            )

        return success_response({"groups": groups})


class AdminOrgSettingView(APIView):
    """GET / PATCH the org-settings singleton (branding, academic year, grading
    scheme, feature flags)."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return success_response(OrgSettingSerializer(OrgSetting.load()).data)

    def patch(self, request):
        obj = OrgSetting.load()
        serializer = OrgSettingSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        record_activity(
            actor=request.user,
            action="org_settings.updated",
            target=obj,
            target_label="Organization settings",
            summary="Updated organization settings",
            request=request,
            fields=sorted(request.data.keys()),
        )
        return success_response(serializer.data)
