"""
DSAT LMS v2 — Student notes + unified timeline (5.5b)
Domain: Academy (admin)
Description: Free-form staff notes on a student, plus a merged Student-360 timeline
    that unifies notes, parent-contact logs, mentor check-ins, and audit-log events
    for that student. Mounted at /api/v1/admin/. IsAdmin.
"""

from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from apps.identity.models import User
from common.permissions import IsAdmin
from common.responses import created_response, no_content_response, success_response

from .models import MentorCheckIn, ParentContactLog, StudentNote
from .serializers import StudentNoteSerializer, StudentNoteWriteSerializer

# Per-source cap so the merged feed stays bounded without a global cursor.
_SOURCE_CAP = 50


def _get_student(pk):
    student = User.objects.filter(pk=pk, role=User.Role.STUDENT, deleted_at__isnull=True).first()
    if student is None:
        raise NotFound("Student not found.")
    return student


def _actor(user):
    if user is None:
        return None
    return {"id": str(user.id), "full_name": user.get_full_name(), "email": user.email}


def build_timeline(student):
    """Merge notes + parent contacts + mentor check-ins + audit events for a student
    into one reverse-chronological feed (each source bounded)."""
    events = []

    for n in StudentNote.objects.filter(student=student).select_related("author")[:_SOURCE_CAP]:
        events.append(
            {
                "type": "note",
                "id": str(n.id),
                "timestamp": n.created_at,
                "actor": _actor(n.author),
                "summary": n.body,
                "meta": {"pinned": n.pinned},
            }
        )

    parent_logs = ParentContactLog.objects.filter(profile__user=student).select_related(
        "author", "guardian"
    )[:_SOURCE_CAP]
    for p in parent_logs:
        events.append(
            {
                "type": "parent_contact",
                "id": str(p.id),
                "timestamp": p.created_at,
                "actor": _actor(p.author),
                "summary": p.note,
                "meta": {"method": p.method, "guardian": p.guardian.name},
            }
        )

    checkins = MentorCheckIn.objects.filter(profile__user=student).select_related("mentor")[
        :_SOURCE_CAP
    ]
    for c in checkins:
        events.append(
            {
                "type": "mentor_checkin",
                "id": str(c.id),
                "timestamp": c.created_at,
                "actor": _actor(c.mentor),
                "summary": c.note,
                "meta": {},
            }
        )

    # Audit-log events targeting this student (status changes, role changes, …).
    from apps.audit.models import ActivityLog

    for a in ActivityLog.objects.filter(target_id=student.id).select_related("actor")[:_SOURCE_CAP]:
        events.append(
            {
                "type": "audit",
                "id": str(a.id),
                "timestamp": a.created_at,
                "actor": _actor(a.actor),
                "summary": a.summary or a.action,
                "meta": {"action": a.action},
            }
        )

    events.sort(key=lambda e: e["timestamp"], reverse=True)
    return events


class StudentNotesView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        student = _get_student(pk)
        notes = student.notes.select_related("author").all()
        return success_response(StudentNoteSerializer(notes, many=True).data)

    def post(self, request, pk):
        student = _get_student(pk)
        serializer = StudentNoteWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = StudentNote.objects.create(
            student=student, author=request.user, **serializer.validated_data
        )
        return created_response(StudentNoteSerializer(note).data)


class StudentNoteDetailView(APIView):
    permission_classes = [IsAdmin]

    def _get_note(self, student, note_id):
        note = student.notes.filter(pk=note_id).first()
        if note is None:
            raise NotFound("Note not found.")
        return note

    def patch(self, request, pk, note_id):
        student = _get_student(pk)
        note = self._get_note(student, note_id)
        serializer = StudentNoteWriteSerializer(note, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(StudentNoteSerializer(note).data)

    def delete(self, request, pk, note_id):
        student = _get_student(pk)
        self._get_note(student, note_id).soft_delete()
        return no_content_response()


class StudentTimelineView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        student = _get_student(pk)
        return success_response(build_timeline(student))
