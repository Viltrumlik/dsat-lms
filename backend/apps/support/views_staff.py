"""
DSAT LMS v2 — Support views (staff/teacher side, S1 "Book a Teacher")
Domain: Support
Description: A teacher's own availability windows (self-service), plus staff
    management of bookings (list / detail / status transition / outcome write-up).
    Bookings are row-scoped by the `teacher` FK via support/scoping.py: a teacher
    sees only their own; admin / academic_manager / receptionist see all.
    Out-of-scope rows surface as 404 (never 403).
Permissions: IsTeacher (availability — only teachers publish hours); IsAnyStaff
    (read bookings); IsOperationsStaff (write: status + outcome).
"""

from django.db.models import Count
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from common.pagination import CursorPagination
from common.permissions import IsAnyStaff, IsOperationsStaff, IsTeacher
from common.responses import created_response, no_content_response, success_response

from .models import SessionOutcome, SupportBooking, SupportTicket, TeacherAvailability
from .scoping import scope_teacher_rows
from .serializers import (
    BookingStatusChangeSerializer,
    OutcomeWriteSerializer,
    StaffBookingSerializer,
    StaffOutcomeSerializer,
    SupportTicketDetailSerializer,
    SupportTicketListSerializer,
    TeacherAvailabilitySerializer,
    TicketAssignSerializer,
    TicketReplyCreateSerializer,
    TicketStatusSerializer,
)
from .services import (
    add_ticket_reply,
    assign_ticket,
    change_booking_status,
    change_ticket_status,
)
from .views import booking_error_response, ticket_error_response


class MyAvailabilityView(APIView):
    """A teacher's own availability windows: list + create."""

    permission_classes = [IsTeacher]

    def get(self, request):
        queryset = TeacherAvailability.objects.filter(teacher=request.user)
        return success_response(TeacherAvailabilitySerializer(queryset, many=True).data)

    def post(self, request):
        serializer = TeacherAvailabilitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        avail = serializer.save(teacher=request.user)
        return created_response(TeacherAvailabilitySerializer(avail).data)


class MyAvailabilityDetailView(APIView):
    permission_classes = [IsTeacher]

    def _get_or_404(self, request, pk):
        avail = TeacherAvailability.objects.filter(pk=pk, teacher=request.user).first()
        if avail is None:
            raise NotFound("Availability not found.")
        return avail

    def patch(self, request, pk):
        avail = self._get_or_404(request, pk)
        serializer = TeacherAvailabilitySerializer(avail, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(TeacherAvailabilitySerializer(avail).data)

    def delete(self, request, pk):
        self._get_or_404(request, pk).soft_delete()
        return no_content_response()


def _scoped_booking_or_404(request, pk):
    """The booking `pk`, but only if the requester may see it (teacher owns it, or
    full-access staff). Out-of-scope → 404."""
    booking = (
        scope_teacher_rows(request, SupportBooking.objects.filter(pk=pk))
        .select_related("teacher", "student")
        .first()
    )
    if booking is None:
        raise NotFound("Booking not found.")
    return booking


class StaffBookingListView(APIView):
    permission_classes = [IsAnyStaff]

    def get(self, request):
        queryset = scope_teacher_rows(request, SupportBooking.objects.all()).select_related(
            "teacher", "student"
        )
        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(StaffBookingSerializer(page, many=True).data)


class StaffBookingDetailView(APIView):
    permission_classes = [IsAnyStaff]

    def get(self, request, pk):
        return success_response(StaffBookingSerializer(_scoped_booking_or_404(request, pk)).data)


class StaffBookingStatusView(APIView):
    permission_classes = [IsOperationsStaff]

    def post(self, request, pk):
        booking = _scoped_booking_or_404(request, pk)
        serializer = BookingStatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["status"]
        actual_minutes = serializer.validated_data.get("actual_duration_minutes")
        try:
            change_booking_status(booking, new_status, by=request.user)
        except ValueError as exc:
            return booking_error_response(exc)
        if new_status == "completed" and actual_minutes is not None:
            booking.actual_duration_minutes = actual_minutes
            booking.save(update_fields=["actual_duration_minutes", "updated_at"])
        return success_response(StaffBookingSerializer(booking).data)


class StaffBookingOutcomeView(APIView):
    """Create or update the session outcome (upsert). Staff-only fields included."""

    permission_classes = [IsOperationsStaff]

    def post(self, request, pk):
        booking = _scoped_booking_or_404(request, pk)
        try:
            instance = booking.outcome
        except SessionOutcome.DoesNotExist:
            instance = None
        serializer = OutcomeWriteSerializer(
            instance=instance, data=request.data, partial=instance is not None
        )
        serializer.is_valid(raise_exception=True)
        outcome = serializer.save(booking=booking) if instance is None else serializer.save()
        return success_response(StaffOutcomeSerializer(outcome).data)


# ─────────────────────────────────────
# Ask a Question (S2) — staff ticket queue
# ─────────────────────────────────────
# Tickets are a shared POOL (assigned_to null = unclaimed), so any staff sees the
# whole queue — no per-teacher row scoping (unlike bookings).


def _staff_ticket_or_404(pk):
    ticket = (
        SupportTicket.objects.filter(pk=pk)
        .select_related("student", "assigned_to")
        .prefetch_related("replies__author", "attachments__attachment")
        .first()
    )
    if ticket is None:
        raise NotFound("Ticket not found.")
    return ticket


class StaffTicketListView(APIView):
    permission_classes = [IsAnyStaff]

    def get(self, request):
        queryset = (
            SupportTicket.objects.all()
            .select_related("student", "assigned_to")
            .annotate(reply_count_annotated=Count("replies"))
        )
        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        assigned = request.query_params.get("assigned")
        if assigned == "me":
            queryset = queryset.filter(assigned_to=request.user)
        elif assigned == "unassigned":
            queryset = queryset.filter(assigned_to__isnull=True)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(SupportTicketListSerializer(page, many=True).data)


class StaffTicketDetailView(APIView):
    permission_classes = [IsAnyStaff]

    def get(self, request, pk):
        return success_response(SupportTicketDetailSerializer(_staff_ticket_or_404(pk)).data)


class StaffTicketReplyView(APIView):
    permission_classes = [IsOperationsStaff]

    def post(self, request, pk):
        ticket = _staff_ticket_or_404(pk)
        serializer = TicketReplyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            add_ticket_reply(
                ticket,
                author=request.user,
                body=serializer.validated_data["body"],
                is_staff_answer=True,
            )
        except ValueError as exc:
            return ticket_error_response(exc)
        return created_response(SupportTicketDetailSerializer(_staff_ticket_or_404(pk)).data)


class StaffTicketAssignView(APIView):
    permission_classes = [IsOperationsStaff]

    def post(self, request, pk):
        ticket = _staff_ticket_or_404(pk)
        serializer = TicketAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assign_ticket(ticket, serializer.validated_data.get("assignee"))
        return success_response(SupportTicketDetailSerializer(_staff_ticket_or_404(pk)).data)


class StaffTicketStatusView(APIView):
    permission_classes = [IsOperationsStaff]

    def post(self, request, pk):
        ticket = _staff_ticket_or_404(pk)
        serializer = TicketStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            change_ticket_status(ticket, serializer.validated_data["status"], by=request.user)
        except ValueError as exc:
            return ticket_error_response(exc)
        return success_response(SupportTicketDetailSerializer(_staff_ticket_or_404(pk)).data)
