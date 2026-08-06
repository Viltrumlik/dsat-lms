"""
DSAT LMS v2 — Classroom stream
Domain: Academy
Description: The per-class noticeboard — the teacher posts, students read and
            reply, materials hang off the post.

Access is by MEMBERSHIP, and it is the same rule on every endpoint here
(`_member_class_or_404`): the class's teacher, an actively enrolled student, or
full-access staff. Anyone else gets a 404, not a 403 — whether a class exists is
not something an outsider needs to learn.

Writing is narrower than reading. Only staff start a post; a student may reply
(where the post allows it) and may delete their own reply. Deletion is soft
everywhere, and an author deleting their own comment is distinct from staff
moderating someone else's.
"""

from django.db.models import Q
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.views import APIView

from common.pagination import CursorPagination
from common.responses import created_response, no_content_response, success_response

from .models import Class, ClassComment, ClassEnrollment, ClassPost, ClassPostAttachment
from .serializers_stream import (
    ClassCommentSerializer,
    ClassCommentWriteSerializer,
    ClassPostSerializer,
    ClassPostWriteSerializer,
)


def _is_class_staff(user, klass) -> bool:
    """May post to / moderate this class."""
    return bool(
        getattr(user, "is_admin", False)
        or getattr(user, "can_read_all_students", False)
        or klass.teacher_id == user.id
    )


def _member_class_or_404(user, pk):
    """A class the requester belongs to, or 404 (no existence leak)."""
    try:
        klass = Class.objects.select_related("teacher").get(pk=pk, deleted_at__isnull=True)
    except Class.DoesNotExist:
        raise NotFound("Class not found.") from None

    if _is_class_staff(user, klass):
        return klass
    enrolled = ClassEnrollment.objects.filter(
        klass=klass,
        student=user,
        status=ClassEnrollment.Status.ACTIVE,
        deleted_at__isnull=True,
    ).exists()
    if not enrolled:
        raise NotFound("Class not found.") from None
    return klass


def _stream_queryset(klass):
    return (
        ClassPost.objects.filter(klass=klass, deleted_at__isnull=True)
        .select_related("author")
        .prefetch_related("attachments__attachment", "comments__author")
    )


class ClassStreamView(APIView):
    """GET the stream, POST a new entry (staff only)."""

    def get(self, request, pk):
        klass = _member_class_or_404(request.user, pk)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(_stream_queryset(klass), request, view=self)
        return paginator.get_paginated_response(ClassPostSerializer(page, many=True).data)

    def post(self, request, pk):
        klass = _member_class_or_404(request.user, pk)
        if not _is_class_staff(request.user, klass):
            raise PermissionDenied("Only teachers can post to the class stream.")

        serializer = ClassPostWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        attachment_ids = data.pop("attachment_ids", [])

        post = ClassPost.objects.create(klass=klass, author=request.user, **data)

        # Link materials. The author must own them — same rule as everywhere
        # else a file id arrives from a client.
        if attachment_ids:
            from apps.files.models import Attachment

            for attachment in Attachment.objects.filter(
                id__in=attachment_ids, owner=request.user, deleted_at__isnull=True
            ):
                ClassPostAttachment.objects.get_or_create(post=post, attachment=attachment)

        _notify_class(klass, post)
        return created_response(ClassPostSerializer(post).data)


def _notify_class(klass, post):
    """Tell actively enrolled students a notice went up. Best-effort."""
    import logging

    if post.kind != ClassPost.Kind.ANNOUNCEMENT:
        return
    try:
        from apps.notifications.services import notify

        students = ClassEnrollment.objects.filter(
            klass=klass, status=ClassEnrollment.Status.ACTIVE, deleted_at__isnull=True
        ).select_related("student")
        for enrollment in students:
            notify(
                enrollment.student,
                "class_post",
                klass.name,
                body=post.body[:200],
                data={"class_id": str(klass.id), "class_name": klass.name},
            )
    except Exception:  # noqa: BLE001
        logging.getLogger(__name__).exception("Failed to notify class %s of post", klass.id)


def _post_or_404(user, class_pk, post_pk):
    klass = _member_class_or_404(user, class_pk)
    try:
        return klass, ClassPost.objects.get(pk=post_pk, klass=klass, deleted_at__isnull=True)
    except ClassPost.DoesNotExist:
        raise NotFound("Post not found.") from None


class ClassPostDetailView(APIView):
    """Soft-delete a post. Its author, or staff moderating the class."""

    def delete(self, request, pk, post_pk):
        klass, post = _post_or_404(request.user, pk, post_pk)
        if post.author_id != request.user.id and not _is_class_staff(request.user, klass):
            raise PermissionDenied("You cannot remove this post.")
        post.soft_delete()
        return no_content_response()


class ClassCommentListView(APIView):
    """Reply to a post."""

    def post(self, request, pk, post_pk):
        _, post = _post_or_404(request.user, pk, post_pk)
        if not post.allow_comments:
            raise PermissionDenied("Replies are closed on this post.")

        serializer = ClassCommentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = ClassComment.objects.create(
            post=post, author=request.user, **serializer.validated_data
        )
        return created_response(ClassCommentSerializer(comment).data)


class ClassCommentDetailView(APIView):
    """Remove a reply. Its author, or staff moderating the class."""

    def delete(self, request, pk, post_pk, comment_pk):
        klass, post = _post_or_404(request.user, pk, post_pk)
        try:
            comment = ClassComment.objects.get(pk=comment_pk, post=post, deleted_at__isnull=True)
        except ClassComment.DoesNotExist:
            raise NotFound("Comment not found.") from None
        if comment.author_id != request.user.id and not _is_class_staff(request.user, klass):
            raise PermissionDenied("You cannot remove this reply.")
        comment.soft_delete()
        return no_content_response()


class MyClassesView(APIView):
    """Every class the requester is IN — taught or attended.

    A teacher's classes are here too, not only under /teacher/classes/: that is
    the management surface (create a class, enrol by email), and being in a class
    is a different thing from administering one. One list means one way into the
    workspace whichever role you hold.
    """

    def get(self, request):
        from .views_classroom import _class_payload

        enrolled = Q(
            enrollments__student=request.user,
            enrollments__status=ClassEnrollment.Status.ACTIVE,
            enrollments__deleted_at__isnull=True,
        )
        mine = Q(teacher=request.user)
        classes = (
            Class.objects.filter(enrolled | mine, deleted_at__isnull=True)
            .select_related("teacher")
            .distinct()
            .order_by("name")
        )
        return success_response([_class_payload(request.user, klass) for klass in classes])
