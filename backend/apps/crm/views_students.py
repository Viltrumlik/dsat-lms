"""
DSAT LMS v2 — Admin students directory + bulk actions + saved filters (5.5c)
Domain: CRM; mounted at /api/v1/admin/. IsAdmin.
    A CRM-oriented student directory (distinct from /admin/users): filter by
    lifecycle status / mentor / tag / class / search, apply bulk actions
    (tag / untag / status), and save/reuse filters per user.
"""

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from apps.academy.models import ClassEnrollment, StudentProfile
from apps.academy.services import change_student_status
from apps.identity.models import User
from common.pagination import CursorPagination
from common.permissions import IsAdmin
from common.responses import created_response, no_content_response, success_response

from . import services
from .models import SavedFilter
from .serializers_students import (
    BulkStudentSerializer,
    SavedFilterSerializer,
    SavedFilterWriteSerializer,
)
from .tags import Tag, TaggedItem


def _student_content_type():
    return ContentType.objects.get_by_natural_key("identity", "user")


def _serialize_students(users, tags_by_user, profiles_by_user):
    rows = []
    for u in users:
        profile = profiles_by_user.get(u.id)
        mentor = getattr(profile, "mentor", None) if profile else None
        rows.append(
            {
                "id": str(u.id),
                "email": u.email,
                "full_name": u.get_full_name(),
                "status": profile.status if profile else None,
                "mentor": (
                    {"id": str(mentor.id), "full_name": mentor.get_full_name()} if mentor else None
                ),
                "tags": [{"id": str(t.id), "name": t.name} for t in tags_by_user.get(u.id, [])],
            }
        )
    return rows


class AdminStudentsListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = User.objects.filter(role=User.Role.STUDENT, deleted_at__isnull=True)

        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(email__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q)
            )
        status_f = (request.query_params.get("status") or "").strip()
        if status_f:
            qs = qs.filter(student_profile__status=status_f)
        mentor_f = (request.query_params.get("mentor") or "").strip()
        if mentor_f:
            qs = qs.filter(student_profile__mentor_id=mentor_f)
        class_f = (request.query_params.get("class") or "").strip()
        if class_f:
            qs = qs.filter(
                enrollments__klass_id=class_f,
                enrollments__status=ClassEnrollment.Status.ACTIVE,
            )
        tag_f = (request.query_params.get("tag") or "").strip()
        if tag_f:
            ct = _student_content_type()
            tagged_ids = TaggedItem.objects.filter(tag_id=tag_f, content_type=ct).values_list(
                "object_id", flat=True
            )
            qs = qs.filter(id__in=tagged_ids)

        qs = qs.distinct().order_by("-created_at")
        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)

        # Batch-load profiles + tags for the page (no N+1).
        ids = [u.id for u in page]
        profiles_by_user = {
            p.user_id: p
            for p in StudentProfile.objects.filter(user_id__in=ids).select_related("mentor")
        }
        tags_by_user = {}
        ct = _student_content_type()
        links = TaggedItem.objects.filter(content_type=ct, object_id__in=ids).select_related("tag")
        for link in links:
            tags_by_user.setdefault(link.object_id, []).append(link.tag)

        return paginator.get_paginated_response(
            _serialize_students(page, tags_by_user, profiles_by_user)
        )


class AdminBulkStudentView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        serializer = BulkStudentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        action = data["action"]
        # Only operate on live student-role users.
        student_ids = list(
            User.objects.filter(
                id__in=data["student_ids"], role=User.Role.STUDENT, deleted_at__isnull=True
            ).values_list("id", flat=True)
        )
        applied, skipped = 0, 0

        if action in ("tag", "untag"):
            tag = Tag.objects.filter(pk=data.get("tag")).first()
            if tag is None:
                from common.exceptions import ValidationError

                return ValidationError("Tag not found.", field="tag").to_response()
            for sid in student_ids:
                if action == "tag":
                    services.assign_tag(tag, "student", sid)
                else:
                    services.unassign_tag(tag, "student", sid)
                applied += 1

        elif action == "status":
            new_status = data.get("status")
            profiles = {
                p.user_id: p for p in StudentProfile.objects.filter(user_id__in=student_ids)
            }
            for sid in student_ids:
                profile = profiles.get(sid)
                if profile is None:
                    skipped += 1
                    continue
                try:
                    change_student_status(profile, new_status, by=request.user)
                    applied += 1
                except ValueError:
                    skipped += 1  # invalid transition / same status

        return success_response({"applied": applied, "skipped": skipped})


class SavedFilterListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = request.user.saved_filters.all()
        kind = (request.query_params.get("kind") or "").strip()
        if kind:
            qs = qs.filter(kind=kind)
        return success_response(SavedFilterSerializer(qs, many=True).data)

    def post(self, request):
        serializer = SavedFilterWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sf = SavedFilter.objects.create(owner=request.user, **serializer.validated_data)
        return created_response(SavedFilterSerializer(sf).data)


class SavedFilterDeleteView(APIView):
    permission_classes = [IsAdmin]

    def delete(self, request, pk):
        sf = request.user.saved_filters.filter(pk=pk).first()
        if sf is None:
            raise NotFound("Saved filter not found.")
        sf.soft_delete()
        return no_content_response()
