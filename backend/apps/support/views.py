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
from django.utils import timezone
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from common.exceptions import ValidationError as APIValidationError
from common.pagination import CursorPagination
from common.permissions import IsAcademyStudent
from common.responses import created_response, success_response

from .availability import generate_slots
from .enums import BookingStatus
from .models import SupportBooking, TeacherAvailability
from .serializers import (
    SessionRatingSerializer,
    SlotSerializer,
    SupportBookingCreateSerializer,
    SupportBookingSerializer,
    UserMiniSerializer,
)
from .services import change_booking_status, create_booking, rate_booking

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
        try:
            booking = create_booking(
                student=request.user,
                teacher=data["teacher"],
                subject=data["subject"],
                scheduled_at=data["scheduled_at"],
                topic=data.get("topic", ""),
                reason=data.get("reason", ""),
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
