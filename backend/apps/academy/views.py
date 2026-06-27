"""
DSAT LMS v2 — Academy Views (teacher-facing)
Domain: Academy
Description: A teacher manages their own classes — list/create, view roster, enroll
            a student. Admins may act on any class.
Permissions: IsAdminOrTeacher. Classes are scoped to the requesting teacher (others
             404), enforcing "a teacher sees only their own class".
"""

from django.db.models import Count, Q
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from apps.identity.models import User
from common.exceptions import ValidationError
from common.permissions import IsAdminOrTeacher
from common.responses import created_response, success_response

from .models import Class, ClassEnrollment
from .serializers import (
    ClassCreateSerializer,
    ClassSerializer,
    EnrollSerializer,
    RosterEntrySerializer,
)


def _scoped_classes(request):
    if request.user.is_admin:
        return Class.objects.all()
    return Class.objects.filter(teacher=request.user)


def _owned_class(request, pk):
    try:
        return _scoped_classes(request).get(pk=pk)
    except Class.DoesNotExist:
        raise NotFound("Class not found.") from None


class TeacherClassListCreateView(APIView):
    permission_classes = [IsAdminOrTeacher]

    def get(self, request):
        classes = (
            _scoped_classes(request)
            .annotate(
                active_count=Count(
                    "enrollments",
                    filter=Q(enrollments__status=ClassEnrollment.Status.ACTIVE),
                )
            )
            .order_by("-created_at")
        )
        return success_response(ClassSerializer(classes, many=True).data)

    def post(self, request):
        serializer = ClassCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        klass = Class.objects.create(name=serializer.validated_data["name"], teacher=request.user)
        return created_response(ClassSerializer(klass).data)


class TeacherClassRosterView(APIView):
    permission_classes = [IsAdminOrTeacher]

    def get(self, request, pk):
        klass = _owned_class(request, pk)
        enrollments = klass.enrollments.filter(status=ClassEnrollment.Status.ACTIVE).select_related(
            "student"
        )
        return success_response(RosterEntrySerializer(enrollments, many=True).data)


class TeacherClassEnrollView(APIView):
    permission_classes = [IsAdminOrTeacher]

    def post(self, request, pk):
        klass = _owned_class(request, pk)
        serializer = EnrollSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower().strip()

        student = User.objects.filter(email__iexact=email).first()
        if student is None:
            return ValidationError("No user with that email.", field="email").to_response()

        enrollment, _ = ClassEnrollment.objects.update_or_create(
            klass=klass,
            student=student,
            defaults={"status": ClassEnrollment.Status.ACTIVE},
        )
        return success_response(RosterEntrySerializer(enrollment).data)
