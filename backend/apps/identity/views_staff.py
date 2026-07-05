"""
DSAT LMS v2 — Staff views
Domain: Identity
Description: Cross-role staff endpoints (mounted at /api/v1/staff/). The
    access-matrix endpoint returns the machine-readable role→capability map plus
    the caller's own role + capabilities, so the frontend gates UI off the same
    source of truth the backend enforces.
Permissions: IsAnyStaff.
"""

from rest_framework.views import APIView

from common.permissions import IsAnyStaff
from common.responses import success_response

from .services import access_matrix, capabilities_for_role


class StaffAccessMatrixView(APIView):
    permission_classes = [IsAnyStaff]

    def get(self, request):
        # `matrix` is a LIST (not a role-keyed dict) so the role stays a value: the
        # frontend axios client camelizes every response KEY, which would mangle a
        # snake_case role key like "academic_manager" into "academicManager".
        return success_response(
            {
                "role": request.user.role,
                "capabilities": capabilities_for_role(request.user.role),
                "matrix": [
                    {"role": role, "capabilities": caps} for role, caps in access_matrix().items()
                ],
            }
        )
