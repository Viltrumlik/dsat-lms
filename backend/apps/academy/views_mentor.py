"""
DSAT LMS v2 — Academy mentor views (Phase 4 S6)
Domain: Academy
Description: Assign/clear a student's academic mentor (full academic authority),
    plus the mentor's own surfaces — their mentee list, per-mentee check-ins, and
    parent-contact logs. Mentor endpoints are scoped by the mentor FK (a mentor
    sees only their mentees; full-access staff see any) — out-of-scope → 404. This
    is a distinct axis from class scoping: a mentor may mentor a student who isn't
    in their class.
Permissions: IsAdminOrAcademicManager (assign); IsAnyStaff + mentor/full-access row
    scoping (mentees, check-ins, parent contacts).
"""

from django.db.models import Max
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from apps.identity.models import User
from common.exceptions import ValidationError as APIValidationError
from common.permissions import IsAdminOrAcademicManager, IsAnyStaff
from common.responses import created_response, success_response

from .models import Guardian, StudentProfile
from .scoping import scoped_student_or_404
from .serializers import (
    AssignMentorSerializer,
    CheckInCreateSerializer,
    MenteeDetailSerializer,
    MenteeSerializer,
    MentorCheckInSerializer,
    ParentContactCreateSerializer,
    ParentContactLogSerializer,
    StudentProfileSerializer,
)
from .services import (
    assign_mentor,
    get_or_create_student_profile,
    log_mentor_check_in,
    log_parent_contact,
    unassign_mentor,
)


def _mentee_profile_or_404(request, user_id):
    """The profile of a student the requester may mentor: full-access staff see any
    live student; anyone else sees only their own mentees (mentor = self). The
    user__deleted_at guard is explicit on BOTH branches — User uses a plain manager
    (not ActiveManager), and account soft-delete leaves the mentor mirror intact
    (CLAUDE.md §15.5)."""
    queryset = StudentProfile.objects.select_related("user", "mentor").filter(
        user__deleted_at__isnull=True
    )
    if request.user.can_read_all_students:
        profile = queryset.filter(user_id=user_id).first()
    else:
        profile = queryset.filter(user_id=user_id, mentor=request.user).first()
    if profile is None:
        raise NotFound("Student not found.")
    return profile


class StudentMentorView(APIView):
    """Assign or clear a student's academic mentor."""

    permission_classes = [IsAdminOrAcademicManager]

    def post(self, request, user_id):
        profile = get_or_create_student_profile(scoped_student_or_404(request, user_id))
        serializer = AssignMentorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data.get("email")
        if email:
            mentor = User.objects.filter(email__iexact=email, deleted_at__isnull=True).first()
            if mentor is None:
                return APIValidationError("No user with that email.", field="email").to_response()
        else:
            mentor = serializer.validated_data.get("mentor")

        if mentor is None:
            unassign_mentor(profile, by=request.user)
        else:
            try:
                assign_mentor(profile, mentor, by=request.user)
            except ValueError as exc:
                message = (
                    "That user isn't academy staff."
                    if str(exc) == "not_staff"
                    else "That mentor is already assigned."
                )
                field = "email" if email else "mentor"
                return APIValidationError(message, field=field).to_response()
        return success_response(StudentProfileSerializer(profile).data)


class MyMenteesView(APIView):
    """The requester's mentees (students where mentor = me)."""

    permission_classes = [IsAnyStaff]

    def get(self, request):
        queryset = (
            StudentProfile.objects.filter(mentor=request.user, user__deleted_at__isnull=True)
            .select_related("user")
            .annotate(last_check_in_annotated=Max("mentor_checkins__created_at"))
            .order_by("user__first_name")
        )
        return success_response(MenteeSerializer(queryset, many=True).data)


class MenteeDetailView(APIView):
    """A single mentee's header (student + status + guardians) for the mentor's
    drilldown. Mentor-scoped (not class-scoped), so a mentor can open a mentee who
    isn't in their class."""

    permission_classes = [IsAnyStaff]

    def get(self, request, user_id):
        profile = _mentee_profile_or_404(request, user_id)
        return success_response(MenteeDetailSerializer(profile).data)


class StudentCheckInsView(APIView):
    permission_classes = [IsAnyStaff]

    def get(self, request, user_id):
        profile = _mentee_profile_or_404(request, user_id)
        return success_response(
            MentorCheckInSerializer(
                profile.mentor_checkins.select_related("mentor"), many=True
            ).data
        )

    def post(self, request, user_id):
        profile = _mentee_profile_or_404(request, user_id)
        serializer = CheckInCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        check_in = log_mentor_check_in(profile, request.user, serializer.validated_data["note"])
        return created_response(MentorCheckInSerializer(check_in).data)


class StudentParentContactsView(APIView):
    permission_classes = [IsAnyStaff]

    def get(self, request, user_id):
        profile = _mentee_profile_or_404(request, user_id)
        return success_response(
            ParentContactLogSerializer(
                profile.parent_contacts.select_related("author", "guardian"), many=True
            ).data
        )

    def post(self, request, user_id):
        profile = _mentee_profile_or_404(request, user_id)
        serializer = ParentContactCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        guardian = Guardian.objects.filter(
            pk=serializer.validated_data["guardian"], profile=profile
        ).first()
        if guardian is None:
            return APIValidationError(
                "Guardian not found for this student.", field="guardian"
            ).to_response()
        contact = log_parent_contact(
            profile,
            guardian,
            author=request.user,
            method=serializer.validated_data["method"],
            note=serializer.validated_data["note"],
        )
        return created_response(ParentContactLogSerializer(contact).data)
