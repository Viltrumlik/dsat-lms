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
"""

from apps.identity.models import User

# Staff roles, in ascending authority order (used for the matrix + UI ordering).
STAFF_ROLES = (
    User.Role.RECEPTIONIST,
    User.Role.TEACHER,
    User.Role.ACADEMIC_MANAGER,
    User.Role.ADMIN,
)


def capabilities_for_role(role: str) -> dict:
    """Coarse capability flags for a role. Locked Phase 4 decisions:
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


def access_matrix() -> dict:
    """Full role → capabilities map for every staff role (frontend gating + tests)."""
    return {role.value: capabilities_for_role(role.value) for role in STAFF_ROLES}
