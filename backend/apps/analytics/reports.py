"""
DSAT LMS v2 — Report builders + export (5.3b)
Domain: Analytics
Description: Build tabular reports (per-student summary, attendance) reusing the
    analytics helpers, and stream them as CSV (stdlib) or XLSX (openpyxl). Synchronous
    at academy scale; a Celery + files.Attachment path is the documented follow-on
    for very large cohorts. File responses intentionally bypass the JSON envelope.
"""

import csv
import io

from django.db.models import Count, Q
from django.http import HttpResponse, StreamingHttpResponse

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def build_students_report(class_id=None):
    """(headers, rows) — per-student summary across the platform or one class."""
    from apps.academy.models import ClassEnrollment
    from apps.identity.models import User

    from .services import batch_student_metrics

    students = User.objects.filter(role=User.Role.STUDENT, is_active=True, deleted_at__isnull=True)
    if class_id:
        students = students.filter(
            enrollments__klass_id=class_id,
            enrollments__status=ClassEnrollment.Status.ACTIVE,
        )
    students = list(students.distinct().order_by("first_name", "last_name"))
    metrics = batch_student_metrics([s.id for s in students])

    headers = ["Name", "Email", "Accuracy %", "Homework %", "Attendance %", "Days inactive", "Risk"]
    rows = []
    for s in students:
        m = metrics.get(s.id, {})
        rows.append(
            [
                s.get_full_name(),
                s.email,
                m.get("overall_accuracy"),
                m.get("homework_completion_pct"),
                m.get("attendance_pct"),
                m.get("days_inactive"),
                (m.get("risk") or {}).get("level"),
            ]
        )
    return headers, rows


def build_attendance_report(class_id):
    """(headers, rows) — per-student attendance counts for one class."""
    from apps.academy.models import Attendance, ClassEnrollment
    from apps.identity.models import User

    st = Attendance.Status
    students = list(
        User.objects.filter(
            enrollments__klass_id=class_id,
            enrollments__status=ClassEnrollment.Status.ACTIVE,
            deleted_at__isnull=True,
        )
        .distinct()
        .order_by("first_name", "last_name")
    )
    counts = {
        r["student_id"]: r
        for r in Attendance.objects.filter(student__in=students, session__klass_id=class_id)
        .values("student_id")
        .annotate(
            present=Count("id", filter=Q(status=st.PRESENT)),
            absent=Count("id", filter=Q(status=st.ABSENT)),
            late=Count("id", filter=Q(status=st.LATE)),
            excused=Count("id", filter=Q(status=st.EXCUSED)),
        )
    }
    headers = ["Name", "Email", "Present", "Absent", "Late", "Excused"]
    rows = []
    for s in students:
        c = counts.get(s.id, {})
        rows.append(
            [
                s.get_full_name(),
                s.email,
                c.get("present", 0),
                c.get("absent", 0),
                c.get("late", 0),
                c.get("excused", 0),
            ]
        )
    return headers, rows


def _cell(v):
    return "" if v is None else v


def csv_response(headers, rows, filename):
    def gen():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(headers)
        yield buf.getvalue()
        for row in rows:
            buf.seek(0)
            buf.truncate(0)
            writer.writerow([_cell(v) for v in row])
            yield buf.getvalue()

    resp = StreamingHttpResponse(gen(), content_type="text/csv")
    resp["Content-Disposition"] = f'attachment; filename="{filename}.csv"'
    return resp


def xlsx_response(headers, rows, filename):
    from openpyxl import Workbook

    wb = Workbook(write_only=True)
    ws = wb.create_sheet()
    ws.append(headers)
    for row in rows:
        ws.append([_cell(v) for v in row])
    buf = io.BytesIO()
    wb.save(buf)
    resp = HttpResponse(buf.getvalue(), content_type=XLSX_CONTENT_TYPE)
    resp["Content-Disposition"] = f'attachment; filename="{filename}.xlsx"'
    return resp
