# apps/identity/views_permissions.py
# Domain: Identity
# Description: The role→capability permissions matrix (Phase 5 §5.6a). GET returns
#             the effective matrix (defaults + admin overrides); PUT upserts sparse
#             RolePermission overrides. Mounted at /api/v1/admin/permissions/matrix/.
# Permissions: IsAdmin. NOTE: this configures COARSE UI capability gating + the
#             advertised access matrix. Per-endpoint enforcement stays role-based
#             (common/permissions.py) — deliberately not a per-user ACL.

from django.db import transaction
from rest_framework.views import APIView

from apps.audit.services import record_activity
from common.exceptions import ValidationError
from common.permissions import IsAdmin
from common.responses import success_response

from .models import RolePermission
from .services import (
    CAPABILITIES,
    STAFF_ROLES,
    _default_caps,
    capabilities_for_role,
    role_capability_overrides,
)

_ROLE_VALUES = tuple(r.value for r in STAFF_ROLES)
# Admin stays omnipotent — its row is never overridable (prevents UI self-lockout).
_EDITABLE_ROLES = tuple(r for r in _ROLE_VALUES if r != "admin")


def _matrix_payload():
    """The full matrix: effective capability per (role, capability) cell + its
    default + whether an admin has overridden it.

    Per-role capabilities are a LIST of cells (not a capability-keyed dict) so the
    capability stays a VALUE: the frontend axios client camelizes response KEYS,
    which would mangle snake_case capability keys like ``read_all_students``."""
    overrides = role_capability_overrides()
    rows = []
    for role in _ROLE_VALUES:
        effective = capabilities_for_role(role, overrides)
        defaults = _default_caps(role)
        rows.append(
            {
                "role": role,
                "cells": [
                    {
                        "capability": cap,
                        "allowed": effective[cap],
                        "default": defaults[cap],
                        "overridden": effective[cap] != defaults[cap],
                    }
                    for cap in CAPABILITIES
                ],
            }
        )
    return {
        "capabilities": list(CAPABILITIES),
        "roles": list(_ROLE_VALUES),
        "editable_roles": list(_EDITABLE_ROLES),
        "matrix": rows,
    }


class AdminPermissionMatrixView(APIView):
    """GET the effective role→capability matrix; PUT a list of override cells."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return success_response(_matrix_payload())

    def put(self, request):
        cells = request.data.get("overrides")
        if not isinstance(cells, list):
            return ValidationError(
                "Body must include an 'overrides' list.", field="overrides"
            ).to_response()

        # Validate every cell up front so a bad row rejects the whole write.
        parsed = []
        for i, cell in enumerate(cells):
            if not isinstance(cell, dict):
                return ValidationError(f"overrides[{i}] must be an object.").to_response()
            role = cell.get("role")
            capability = cell.get("capability")
            allowed = cell.get("allowed")
            if role not in _EDITABLE_ROLES:
                return ValidationError(
                    f"Unknown or non-editable role: {role!r}.", field="role"
                ).to_response()
            if capability not in CAPABILITIES:
                return ValidationError(
                    f"Unknown capability: {capability!r}.", field="capability"
                ).to_response()
            if not isinstance(allowed, bool):
                return ValidationError(
                    "'allowed' must be a boolean.", field="allowed"
                ).to_response()
            parsed.append((role, capability, allowed))

        changed = 0
        with transaction.atomic():
            for role, capability, allowed in parsed:
                default = _default_caps(role)[capability]
                existing = RolePermission.all_objects.filter(
                    role=role, capability=capability
                ).first()
                if allowed == default:
                    # Back to default → drop the override to keep the table sparse.
                    if existing is not None and existing.deleted_at is None:
                        existing.soft_delete()
                        changed += 1
                    continue
                if existing is None:
                    RolePermission.objects.create(role=role, capability=capability, allowed=allowed)
                    changed += 1
                elif existing.deleted_at is not None or existing.allowed != allowed:
                    existing.allowed = allowed
                    existing.deleted_at = None
                    existing.save(update_fields=["allowed", "deleted_at", "updated_at"])
                    changed += 1

        if changed:
            record_activity(
                actor=request.user,
                action="identity.permissions.updated",
                summary=f"Updated {changed} permission cell(s).",
                request=request,
                cells=[{"role": r, "capability": c, "allowed": a} for r, c, a in parsed],
            )
        return success_response(_matrix_payload())
