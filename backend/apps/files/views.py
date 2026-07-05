"""
DSAT LMS v2 — Files views
Domain: Files
Description: Private file uploads (mounted at /api/v1/files/). Create/list/detail/
    delete/set-avatar require auth + owner-or-full-access-staff scoping. Download is
    public-by-UUID for avatars (so they render in <img>) and auth-gated for
    everything else — a private file that the caller may not see returns 404 (not
    403) so it doesn't leak existence.
"""

from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.identity.models import User
from common.exceptions import ValidationError as APIValidationError
from common.pagination import CursorPagination
from common.responses import created_response, no_content_response, success_response

from .models import Attachment
from .serializers import AttachmentSerializer
from .services import (
    FILE_MAX_BYTES,
    can_access_attachment,
    can_manage_user_files,
    create_attachment,
    set_avatar,
)
from .storage import download_response


def _resolve_owner(request):
    """Owner of a new upload: the caller by default. Uploading on behalf of another
    user is restricted to admins or full-access staff acting on a student."""
    owner_id = request.data.get("owner_id") or request.data.get("owner")
    if not owner_id or str(owner_id) == str(request.user.id):
        return request.user
    owner = User.objects.filter(pk=owner_id, deleted_at__isnull=True).first()
    if owner is None:
        raise NotFound("Owner not found.")
    if not can_manage_user_files(request.user, owner):
        raise PermissionDenied("You cannot upload files for this user.")
    return owner


class FileListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        owner_id = request.query_params.get("owner")
        if owner_id and owner_id != str(request.user.id):
            if not request.user.can_read_all_students:
                raise PermissionDenied("You cannot list another user's files.")
            qs = Attachment.objects.filter(owner_id=owner_id)
        else:
            qs = Attachment.objects.filter(owner=request.user)
        kind = request.query_params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)
        qs = qs.select_related("owner", "uploaded_by").order_by("-created_at")

        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(AttachmentSerializer(page, many=True).data)

    def post(self, request):
        # Reject oversized bodies BEFORE the multipart parser buffers them to disk.
        # (A hard cap also belongs at the web server — e.g. Nginx client_max_body_size.)
        content_length = request.META.get("CONTENT_LENGTH")
        if (
            content_length
            and content_length.isdigit()
            and int(content_length) > FILE_MAX_BYTES + (1024 * 1024)
        ):
            return APIValidationError("File too large.", field="file").to_response()
        upload = request.FILES.get("file")
        if upload is None:
            return APIValidationError("No file provided.", field="file").to_response()
        kind = request.data.get("kind", Attachment.Kind.DOCUMENT)
        if kind not in Attachment.Kind.values:
            return APIValidationError("Invalid file kind.", field="kind").to_response()
        owner = _resolve_owner(request)
        try:
            attachment = create_attachment(
                owner=owner, uploaded_by=request.user, upload=upload, kind=kind
            )
        except APIValidationError as exc:
            return exc.to_response()
        return created_response(AttachmentSerializer(attachment).data)


class FileDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_or_404(self, request, pk):
        attachment = Attachment.objects.filter(pk=pk).select_related("owner", "uploaded_by").first()
        if attachment is None or not can_access_attachment(request.user, attachment):
            raise NotFound("File not found.")
        return attachment

    def get(self, request, pk):
        return success_response(AttachmentSerializer(self._get_or_404(request, pk)).data)

    def delete(self, request, pk):
        attachment = self._get_or_404(request, pk)
        if attachment.owner_id != request.user.id and not request.user.is_admin:
            raise PermissionDenied("Only the owner or an admin can delete this file.")
        attachment.soft_delete()
        return no_content_response()


class FileDownloadView(APIView):
    # Avatars are public-by-UUID; everything else is auth-gated below.
    permission_classes = [AllowAny]

    def get(self, request, pk):
        attachment = Attachment.objects.filter(pk=pk).first()
        if attachment is None:
            raise NotFound("File not found.")
        if not attachment.is_public_avatar:
            if not request.user.is_authenticated or not can_access_attachment(
                request.user, attachment
            ):
                raise NotFound("File not found.")
        return download_response(attachment)


class SetAvatarView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        attachment = Attachment.objects.filter(pk=pk).select_related("owner").first()
        if attachment is None or not can_access_attachment(request.user, attachment):
            raise NotFound("File not found.")
        if not can_manage_user_files(request.user, attachment.owner):
            raise PermissionDenied("You cannot change this user's avatar.")
        if attachment.kind != Attachment.Kind.AVATAR:
            return APIValidationError(
                "Only an avatar image can be set as the avatar.", field="kind"
            ).to_response()
        set_avatar(attachment.owner, attachment)
        return success_response({"avatar_url": attachment.owner.avatar_url})
