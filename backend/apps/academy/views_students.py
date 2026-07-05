"""
DSAT LMS v2 — Academy student-profile views (CRM person layer)
Domain: Academy
Description: The student CRM person record — demographics, lifecycle status, and
    guardian contacts. Self-serve (a student edits their own demographics) plus a
    staff surface (any staff reads per the F1 access matrix; operational staff
    writes), all row-scoped to the students the requester may see.
Permissions: IsAcademyStudent (self) / IsAnyStaff (staff read) / IsOperationsStaff
    (staff write). Teachers are own-class-scoped by academy/scoping.py.
"""

from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from common.exceptions import ValidationError as APIValidationError
from common.permissions import IsAcademyStudent, IsAnyStaff, IsOperationsStaff
from common.responses import created_response, no_content_response, success_response

from .models import Guardian
from .scoping import scoped_student_or_404
from .serializers import (
    GuardianSerializer,
    StatusChangeSerializer,
    StudentProfileSerializer,
    StudentProfileUpdateSerializer,
)
from .services import change_student_status, get_or_create_student_profile


def _staff_profile_or_404(request, user_id):
    """The CRM profile of a live student the requester is allowed to see."""
    student = scoped_student_or_404(request, user_id)
    return get_or_create_student_profile(student)


class MyStudentProfileView(APIView):
    """A student's own CRM profile. Demographics are self-editable; lifecycle
    status is staff-managed (not writable here)."""

    permission_classes = [IsAcademyStudent]

    def get(self, request):
        profile = get_or_create_student_profile(request.user)
        return success_response(StudentProfileSerializer(profile).data)

    def patch(self, request):
        profile = get_or_create_student_profile(request.user)
        serializer = StudentProfileUpdateSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(StudentProfileSerializer(profile).data)


class StaffStudentProfileView(APIView):
    """Staff read (any staff, scoped) + demographics write (operational staff)."""

    def get_permissions(self):
        return [IsOperationsStaff()] if self.request.method == "PATCH" else [IsAnyStaff()]

    def get(self, request, user_id):
        return success_response(
            StudentProfileSerializer(_staff_profile_or_404(request, user_id)).data
        )

    def patch(self, request, user_id):
        profile = _staff_profile_or_404(request, user_id)
        serializer = StudentProfileUpdateSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(StudentProfileSerializer(profile).data)


class StudentStatusView(APIView):
    permission_classes = [IsOperationsStaff]

    def post(self, request, user_id):
        profile = _staff_profile_or_404(request, user_id)
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            change_student_status(profile, serializer.validated_data["status"], by=request.user)
        except ValueError as exc:
            message = (
                "Student is already in that status."
                if str(exc) == "same_status"
                else "That lifecycle status change isn't allowed."
            )
            return APIValidationError(message, field="status").to_response()
        return success_response(StudentProfileSerializer(profile).data)


class StudentGuardiansView(APIView):
    """List (any staff) + create (operational staff) guardians for a student."""

    def get_permissions(self):
        return [IsOperationsStaff()] if self.request.method == "POST" else [IsAnyStaff()]

    def get(self, request, user_id):
        profile = _staff_profile_or_404(request, user_id)
        return success_response(GuardianSerializer(profile.guardians.all(), many=True).data)

    def post(self, request, user_id):
        profile = _staff_profile_or_404(request, user_id)
        serializer = GuardianSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        guardian = serializer.save(profile=profile)
        return created_response(GuardianSerializer(guardian).data)


class GuardianDetailView(APIView):
    permission_classes = [IsOperationsStaff]

    def _get_or_404(self, request, pk):
        guardian = Guardian.objects.filter(pk=pk).select_related("profile__user").first()
        if guardian is None:
            raise NotFound("Guardian not found.")
        # The guardian's student must be visible to the requester (raises 404 if not).
        scoped_student_or_404(request, guardian.profile.user_id)
        return guardian

    def patch(self, request, pk):
        guardian = self._get_or_404(request, pk)
        serializer = GuardianSerializer(guardian, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(GuardianSerializer(guardian).data)

    def delete(self, request, pk):
        guardian = self._get_or_404(request, pk)
        guardian.soft_delete()
        return no_content_response()
