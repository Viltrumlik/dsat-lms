"""
DSAT LMS v2 — Admin report export views (5.3b)
Domain: Analytics (admin)
Description: GET /admin/reports/<kind>/?format=csv|xlsx[&class_id=] — download a
    tabular report. Admin-only. Responses are file downloads (not the JSON envelope).
Permissions: IsAdmin.
"""

from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from common.exceptions import ValidationError
from common.permissions import IsAdmin

from .reports import (
    build_attendance_report,
    build_students_report,
    csv_response,
    xlsx_response,
)


class AdminReportView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, kind):
        # NB: `format` is reserved by DRF content negotiation — use `fmt`.
        fmt = (request.query_params.get("fmt") or "csv").lower()
        class_id = (request.query_params.get("class_id") or "").strip() or None

        if kind == "students":
            headers, rows = build_students_report(class_id)
        elif kind == "attendance":
            if not class_id:
                return ValidationError(
                    "class_id is required for the attendance report.", field="class_id"
                ).to_response()
            headers, rows = build_attendance_report(class_id)
        else:
            raise NotFound("Unknown report kind.")

        filename = f"{kind}-report"
        if fmt == "xlsx":
            return xlsx_response(headers, rows, filename)
        return csv_response(headers, rows, filename)
