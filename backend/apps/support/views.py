"""
DSAT LMS v2 — Support views (student side, S1 "Book a Teacher")
Domain: Support
Description: Bookable-teacher discovery (by subject), slot listing (via
    generate_slots), and the student's own bookings (create / list / detail /
    cancel / rate). All IsAcademyStudent; a student only ever sees their own
    bookings (out-of-scope → 404).
Permissions: IsAcademyStudent.
"""

from datetime import timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import Count
from django.utils import timezone
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from common.exceptions import ValidationError as APIValidationError
from common.pagination import CursorPagination
from common.permissions import IsAcademyStudent
from common.responses import created_response, success_response

from .analytics_services import student_support_summary
from .availability import generate_slots
from .enums import BookingStatus, RecStatus
from .models import SupportBooking, SupportRecommendation, SupportTicket, TeacherAvailability
from .serializers import (
    SessionRatingSerializer,
    SlotSerializer,
    SupportBookingCreateSerializer,
    SupportBookingSerializer,
    SupportRecommendationSerializer,
    SupportTicketDetailSerializer,
    SupportTicketListSerializer,
    TicketCreateSerializer,
    TicketReplyCreateSerializer,
    TicketStatusSerializer,
    UserMiniSerializer,
)
from .services import (
    add_ticket_reply,
    change_booking_status,
    change_ticket_status,
    create_booking,
    create_ticket,
    dismiss_recommendation,
    rate_booking,
)

# ValueError codes raised by the service layer → human message + field, mirroring
# academy StudentStatusView. Shared with views_staff.py.
_BOOKING_ERRORS = {
    "slot_unavailable": ("That slot isn't available. Please pick another.", "scheduled_at"),
    "slot_taken": ("That slot was just taken. Please pick another.", "scheduled_at"),
    "same_status": ("The booking is already in that status.", "status"),
    "invalid_transition": ("That status change isn't allowed.", "status"),
    "too_early": ("You can't mark a no-show before the session time.", "status"),
    "not_completed": ("You can only rate a completed session.", "score"),
    "already_rated": ("You've already rated this session.", "score"),
}


def booking_error_response(exc):
    """Translate a service-layer ValueError code into a standard 400."""
    message, field = _BOOKING_ERRORS.get(str(exc), ("Invalid request.", None))
    return APIValidationError(message, field=field).to_response()


# Ticket ValueError codes → message + field. Shared with views_staff.py.
_TICKET_ERRORS = {
    "invalid_attachment": ("One of the attached files is invalid.", "attachment_ids"),
    "ticket_closed": ("This ticket is closed. Reopen it to reply.", "body"),
    "same_status": ("The ticket is already in that status.", "status"),
    "invalid_transition": ("That status change isn't allowed.", "status"),
}


def ticket_error_response(exc):
    message, field = _TICKET_ERRORS.get(str(exc), ("Invalid request.", None))
    return APIValidationError(message, field=field).to_response()


class BookableTeachersView(APIView):
    """Teachers offering 1:1 support, grouped with the subjects they publish hours
    for. Optional ?subject= filter. Bookable = has an active TeacherAvailability
    (no separate teacher directory)."""

    permission_classes = [IsAcademyStudent]

    def get(self, request):
        subject = request.query_params.get("subject")
        avails = TeacherAvailability.objects.filter(is_active=True).select_related("teacher")
        if subject:
            avails = avails.filter(subject=subject)

        grouped = {}
        for avail in avails:
            entry = grouped.setdefault(
                avail.teacher_id, {"teacher": avail.teacher, "subjects": set()}
            )
            entry["subjects"].add(avail.subject)

        data = [
            {
                "teacher": UserMiniSerializer(entry["teacher"]).data,
                "subjects": sorted(entry["subjects"]),
            }
            for entry in sorted(grouped.values(), key=lambda e: e["teacher"].get_full_name())
        ]
        return success_response(data)


class TeacherSlotsView(APIView):
    """Bookable slots for ?teacher=&subject= over the next ?days= (default 14,
    max 30)."""

    permission_classes = [IsAcademyStudent]

    def get(self, request):
        teacher_id = request.query_params.get("teacher")
        subject = request.query_params.get("subject")
        if not teacher_id or not subject:
            return APIValidationError("teacher and subject are required.").to_response()

        from apps.identity.models import User

        teacher = User.objects.filter(
            pk=teacher_id, role=User.Role.TEACHER, deleted_at__isnull=True
        ).first()
        if teacher is None:
            raise NotFound("Teacher not found.")

        try:
            days = int(request.query_params.get("days", 14))
        except (TypeError, ValueError):
            days = 14
        days = max(1, min(days, 30))

        tz = ZoneInfo(settings.TIME_ZONE)
        start = timezone.now().astimezone(tz).date()
        end = start + timedelta(days=days - 1)
        slots = generate_slots(teacher, subject, start=start, end=end)
        return success_response(SlotSerializer(slots, many=True).data)


def _own_booking_or_404(request, pk):
    booking = (
        SupportBooking.objects.filter(pk=pk, student=request.user)
        .select_related("teacher", "student")
        .first()
    )
    if booking is None:
        raise NotFound("Booking not found.")
    return booking


class SupportBookingListCreateView(APIView):
    permission_classes = [IsAcademyStudent]

    def get(self, request):
        queryset = SupportBooking.objects.filter(student=request.user).select_related(
            "teacher", "student"
        )
        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(SupportBookingSerializer(page, many=True).data)

    def post(self, request):
        serializer = SupportBookingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        recommendation = None
        rec_id = data.get("recommendation")
        if rec_id:
            # Only an own recommendation links; an unknown id is silently ignored
            # (the booking still succeeds).
            recommendation = SupportRecommendation.objects.filter(
                pk=rec_id, student=request.user
            ).first()
        try:
            booking = create_booking(
                student=request.user,
                teacher=data["teacher"],
                subject=data["subject"],
                scheduled_at=data["scheduled_at"],
                topic=data.get("topic", ""),
                reason=data.get("reason", ""),
                recommendation=recommendation,
            )
        except ValueError as exc:
            return booking_error_response(exc)
        return created_response(SupportBookingSerializer(booking).data)


class SupportBookingDetailView(APIView):
    permission_classes = [IsAcademyStudent]

    def get(self, request, pk):
        return success_response(SupportBookingSerializer(_own_booking_or_404(request, pk)).data)


class SupportBookingCancelView(APIView):
    permission_classes = [IsAcademyStudent]

    def post(self, request, pk):
        booking = _own_booking_or_404(request, pk)
        try:
            change_booking_status(booking, BookingStatus.CANCELLED, by=request.user)
        except ValueError as exc:
            return booking_error_response(exc)
        return success_response(SupportBookingSerializer(booking).data)


class SupportBookingRateView(APIView):
    permission_classes = [IsAcademyStudent]

    def post(self, request, pk):
        booking = _own_booking_or_404(request, pk)
        serializer = SessionRatingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            rate_booking(
                booking,
                score=serializer.validated_data["score"],
                comment=serializer.validated_data.get("comment", ""),
            )
        except ValueError as exc:
            return booking_error_response(exc)
        return created_response(SupportBookingSerializer(booking).data)


# ─────────────────────────────────────
# Ask a Question (S2) — student tickets
# ─────────────────────────────────────


def _own_ticket_or_404(request, pk):
    ticket = (
        SupportTicket.objects.filter(pk=pk, student=request.user)
        .select_related("student", "assigned_to")
        .prefetch_related("replies__author", "attachments__attachment")
        .first()
    )
    if ticket is None:
        raise NotFound("Ticket not found.")
    return ticket


class SupportTicketListCreateView(APIView):
    permission_classes = [IsAcademyStudent]

    def get(self, request):
        queryset = (
            SupportTicket.objects.filter(student=request.user)
            .select_related("student", "assigned_to")
            .annotate(reply_count_annotated=Count("replies"))
        )
        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(SupportTicketListSerializer(page, many=True).data)

    def post(self, request):
        serializer = TicketCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            ticket = create_ticket(
                student=request.user,
                subject=data["subject"],
                body=data["body"],
                priority=data["priority"],
                attachment_ids=data.get("attachment_ids"),
            )
        except ValueError as exc:
            return ticket_error_response(exc)
        return created_response(SupportTicketDetailSerializer(ticket).data)


class SupportTicketDetailView(APIView):
    permission_classes = [IsAcademyStudent]

    def get(self, request, pk):
        return success_response(SupportTicketDetailSerializer(_own_ticket_or_404(request, pk)).data)


class SupportTicketReplyView(APIView):
    permission_classes = [IsAcademyStudent]

    def post(self, request, pk):
        ticket = _own_ticket_or_404(request, pk)
        serializer = TicketReplyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            add_ticket_reply(
                ticket,
                author=request.user,
                body=serializer.validated_data["body"],
                is_staff_answer=False,
            )
        except ValueError as exc:
            return ticket_error_response(exc)
        return created_response(SupportTicketDetailSerializer(_own_ticket_or_404(request, pk)).data)


class SupportTicketStatusView(APIView):
    permission_classes = [IsAcademyStudent]

    def post(self, request, pk):
        ticket = _own_ticket_or_404(request, pk)
        serializer = TicketStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            change_ticket_status(ticket, serializer.validated_data["status"], by=request.user)
        except ValueError as exc:
            return ticket_error_response(exc)
        return success_response(SupportTicketDetailSerializer(_own_ticket_or_404(request, pk)).data)


# ─────────────────────────────────────
# Support analytics (S3) — student self-summary
# ─────────────────────────────────────


class StudentSupportSummaryView(APIView):
    permission_classes = [IsAcademyStudent]

    def get(self, request):
        return success_response(student_support_summary(request.user))


# ─────────────────────────────────────
# Proactive recommendations (S4) — student
# ─────────────────────────────────────


class SupportRecommendationListView(APIView):
    """A student's active (NEW) recommendations — powers the dashboard banner."""

    permission_classes = [IsAcademyStudent]

    def get(self, request):
        recs = SupportRecommendation.objects.filter(student=request.user, status=RecStatus.NEW)
        return success_response(SupportRecommendationSerializer(recs, many=True).data)


class SupportRecommendationDismissView(APIView):
    permission_classes = [IsAcademyStudent]

    def post(self, request, pk):
        rec = SupportRecommendation.objects.filter(pk=pk, student=request.user).first()
        if rec is None:
            raise NotFound("Recommendation not found.")
        try:
            dismiss_recommendation(rec)
        except ValueError:
            return APIValidationError(
                "This recommendation can no longer be dismissed."
            ).to_response()
        return success_response(SupportRecommendationSerializer(rec).data)
