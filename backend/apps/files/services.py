"""
DSAT LMS v2 — Files services
Domain: Files
Description: Upload creation with server-side validation (size ceiling + content-type
    allowlist + magic-byte sniff so a spoofed Content-Type can't smuggle a
    non-image/non-pdf through), avatar wiring, and the access predicate.
"""

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from common.exceptions import ValidationError

from .models import Attachment

# Size ceilings (bytes).
AVATAR_MAX_BYTES = 5 * 1024 * 1024
FILE_MAX_BYTES = 25 * 1024 * 1024

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
# Allowed content types for non-avatar files. Every allowed type is magic-byte
# sniffed below — do not add a type here without a matching sniff, or a spoofed
# Content-Type could smuggle arbitrary bytes.
FILE_TYPES = IMAGE_TYPES | {"application/pdf"}


def _sniff_image(upload):
    """Confirm the bytes really decode as an image (defeats a spoofed Content-Type)."""
    from PIL import Image, UnidentifiedImageError

    try:
        upload.seek(0)
        with Image.open(upload) as img:
            img.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValidationError("The uploaded file is not a valid image.", field="file") from exc
    finally:
        upload.seek(0)


def _sniff_pdf(upload):
    upload.seek(0)
    head = upload.read(5)
    upload.seek(0)
    if head[:4] != b"%PDF":
        raise ValidationError("The uploaded file is not a valid PDF.", field="file")


def validate_upload(upload, kind):
    content_type = (getattr(upload, "content_type", "") or "").lower()
    is_avatar = kind == Attachment.Kind.AVATAR
    max_bytes = AVATAR_MAX_BYTES if is_avatar else FILE_MAX_BYTES
    if upload.size > max_bytes:
        raise ValidationError(
            f"File too large (max {max_bytes // (1024 * 1024)} MB).", field="file"
        )
    allowed = IMAGE_TYPES if is_avatar else FILE_TYPES
    if content_type not in allowed:
        raise ValidationError("Unsupported file type.", field="file")
    if content_type in IMAGE_TYPES:
        _sniff_image(upload)
    elif content_type == "application/pdf":
        _sniff_pdf(upload)


def create_attachment(*, owner, uploaded_by, upload, kind):
    """Validate + persist an upload. The blob is written to the default storage
    under a server-controlled key (see storage.attachment_upload_to)."""
    validate_upload(upload, kind)
    attachment = Attachment(
        owner=owner,
        uploaded_by=uploaded_by,
        kind=kind,
        original_name=(upload.name or "file")[:255],
        content_type=(getattr(upload, "content_type", "") or "application/octet-stream")[:100],
        size=upload.size,
    )
    attachment.file = upload
    attachment.save()
    return attachment


def attachment_download_url(attachment):
    """Stable, cacheable absolute URL. The endpoint re-signs remote URLs per hit, so
    this path never embeds an expiring token (safe to store in User.avatar_url)."""
    base = settings.BACKEND_PUBLIC_URL.rstrip("/")
    return f"{base}/api/v1/files/{attachment.id}/download/"


def set_avatar(user, attachment):
    """Point a user's avatar_url at an owned avatar attachment's stable download URL,
    soft-deleting any superseded avatars so the old blobs enter the 30-day purge
    (and stop being downloadable by their UUID)."""
    Attachment.objects.filter(owner=user, kind=Attachment.Kind.AVATAR).exclude(
        pk=attachment.pk
    ).update(deleted_at=timezone.now())
    user.avatar_url = attachment_download_url(attachment)
    user.save(update_fields=["avatar_url", "updated_at"])
    return user


def can_access_attachment(user, attachment):
    """F2 READ access: the owner, or full-access staff (admin / academic_manager /
    receptionist). Teacher own-class file access lands with the profile Files tab.

    Additionally, ANY academy staff may read an attachment linked to a support
    ticket: the ticket queue is a staff-shared pool (see apps/support), so a
    teacher answering a pooled ticket must be able to open its files even though a
    teacher isn't `can_read_all_students`. Lazy import keeps files→support
    decoupled at import time."""
    if attachment.owner_id == user.id:
        return True
    if getattr(user, "can_read_all_students", False):
        return True
    if getattr(user, "is_academy_staff", False):
        from apps.support.models import SupportTicketAttachment

        if SupportTicketAttachment.objects.filter(attachment_id=attachment.id).exists():
            return True
    # Materials posted to a class stream are readable by anyone IN that class —
    # the same membership rule the stream endpoints use.
    if getattr(user, "is_academy_staff", False) or getattr(user, "is_academy_student", False):
        from apps.academy.models import ClassPostAttachment

        if (
            ClassPostAttachment.objects.filter(attachment_id=attachment.id)
            .filter(
                Q(post__klass__teacher_id=user.id)
                | Q(
                    post__klass__enrollments__student=user,
                    post__klass__enrollments__status="active",
                    post__klass__enrollments__deleted_at__isnull=True,
                )
            )
            .exists()
        ):
            return True

    # A teacher may read the work handed in on THEIR OWN class's homework, and
    # the materials attached to a brief they can see. Scoped by the class's
    # teacher FK, so it grants nothing outside their own classes.
    if getattr(user, "is_teacher", False):
        from apps.homework.models import HomeworkAttachment, HomeworkSubmissionFile

        if HomeworkSubmissionFile.objects.filter(
            attachment_id=attachment.id,
            submission__homework__assigned_class__teacher_id=user.id,
        ).exists():
            return True
        if HomeworkAttachment.objects.filter(
            attachment_id=attachment.id, homework__assigned_class__teacher_id=user.id
        ).exists():
            return True

    # A student may read an attachment on a lesson whose course is assigned +
    # visible to them (mirrors the ticket-pool branch; lazy import decouples files).
    if getattr(user, "is_academy_student", False):
        from apps.homework.models import HomeworkAttachment

        # Materials on a brief the student can see (active enrolment, published).
        if HomeworkAttachment.objects.filter(
            attachment_id=attachment.id,
            homework__is_published=True,
            homework__assigned_class__enrollments__student=user,
            homework__assigned_class__enrollments__status="active",
        ).exists():
            return True

        from apps.courses.models import Lesson, LessonAttachment
        from apps.courses.services import visible_course_qs

        lesson_ids = LessonAttachment.objects.filter(attachment_id=attachment.id).values_list(
            "lesson_id", flat=True
        )
        if lesson_ids:
            course_ids = Lesson.objects.filter(id__in=lesson_ids).values_list(
                "unit__course_id", flat=True
            )
            if visible_course_qs(user).filter(id__in=course_ids).exists():
                return True
    return False


def can_manage_user_files(actor, owner):
    """WRITE access to files owned by another user (upload-on-behalf, set-avatar):
    the user themselves, an admin, or full-access staff acting on a STUDENT. Staff
    may never create/mutate files on another staff or admin account — no privilege
    escalation (e.g. a receptionist overwriting an admin's avatar)."""
    if owner.id == actor.id or actor.is_admin:
        return True
    return bool(getattr(actor, "can_read_all_students", False)) and owner.role == "student"
