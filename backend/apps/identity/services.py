"""
DSAT LMS v2 — Identity services
Domain: Identity
Description: The role capability matrix — a single source of truth for what each
    staff role may do. Consumed by the /staff/access-matrix/ endpoint (so the
    frontend can gate UI) and asserted by anti-drift tests, so client and server
    never disagree about permissions.

Capabilities are COARSE, UI-facing gates. They do not replace per-endpoint
permission classes (common/permissions.py) or row scoping (academy/scoping.py) —
they mirror them so the UI can hide what the API would reject.

Phase 5 §5.6a: admins may override individual (role, capability) cells via
`RolePermission` rows. `capabilities_for_role()` merges those sparse overrides on
top of the hardcoded defaults, so the advertised matrix reflects the DB. Endpoint
ENFORCEMENT stays role-based (deliberately not a per-user ACL).
"""

from apps.identity.models import User

# Staff roles, in ascending authority order (used for the matrix + UI ordering).
STAFF_ROLES = (
    User.Role.RECEPTIONIST,
    User.Role.TEACHER,
    User.Role.ACADEMIC_MANAGER,
    User.Role.ADMIN,
)

# The coarse capability vocabulary, in display order. The single source of truth
# for which keys may be overridden (the matrix endpoint validates against this).
CAPABILITIES = (
    "read_all_students",
    "read_academic",
    "write_operational",
    "write_academic",
    "grade",
    "manage_users",
)


def _default_caps(role: str) -> dict:
    """Hardcoded capability defaults for a role (before any admin override). Locked
    Phase 4 decisions:
    - receptionist READS academic data (scores/risk) but writes only operational
      data (enrollment/attendance/guardians/schedule);
    - academic_manager has full academic authority (author + grade) over all
      students; teachers the same but own-class-scoped;
    - only admin manages user accounts."""
    R = User.Role
    return {
        # Sees every student (not own-class-scoped).
        "read_all_students": role in (R.ADMIN, R.ACADEMIC_MANAGER, R.RECEPTIONIST),
        # May read academic data (scores, risk, progress).
        "read_academic": role in (R.ADMIN, R.ACADEMIC_MANAGER, R.RECEPTIONIST, R.TEACHER),
        # May write operational data (enrollment, attendance, guardians, schedule).
        "write_operational": role in (R.ADMIN, R.ACADEMIC_MANAGER, R.RECEPTIONIST, R.TEACHER),
        # May author content / edit academic records.
        "write_academic": role in (R.ADMIN, R.ACADEMIC_MANAGER, R.TEACHER),
        # May grade homework / exams.
        "grade": role in (R.ADMIN, R.ACADEMIC_MANAGER, R.TEACHER),
        # May manage user accounts (create/role/deactivate/delete).
        "manage_users": role == R.ADMIN,
    }


def role_capability_overrides() -> dict:
    """{role: {capability: allowed}} — active admin overrides only (one query)."""
    from apps.identity.models import RolePermission

    out: dict = {}
    for role, capability, allowed in RolePermission.objects.values_list(
        "role", "capability", "allowed"
    ):
        out.setdefault(role, {})[capability] = allowed
    return out


def capabilities_for_role(role: str, overrides: dict = None) -> dict:
    """Effective capability flags for a role = hardcoded defaults with any admin
    overrides applied. Pass a pre-fetched `overrides` map (from
    role_capability_overrides()) to avoid a per-role query when building the whole
    matrix; omit it for a single-role lookup."""
    caps = _default_caps(role)
    if overrides is None:
        overrides = role_capability_overrides()
    for capability, allowed in overrides.get(role, {}).items():
        if capability in caps:  # ignore stale keys no longer in the vocabulary
            caps[capability] = bool(allowed)
    return caps


def access_matrix() -> dict:
    """Full role → effective-capabilities map for every staff role (frontend gating
    + tests). Reads overrides once."""
    overrides = role_capability_overrides()
    return {role.value: capabilities_for_role(role.value, overrides) for role in STAFF_ROLES}
