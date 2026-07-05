"""
DSAT LMS v2 — Files models
Domain: Files
Description: One Attachment model backing every upload (avatars, homework files,
    student documents, note attachments). Files are private by default and served
    through an auth-gated /download/ endpoint; avatars are public-by-UUID so they
    render in <img> without an Authorization header. Soft-deletable; a Celery beat
    task purges the blob 30 days after soft-delete.
"""

from django.db import models

from common.models import BaseModel

from .storage import attachment_upload_to


class Attachment(BaseModel):
    class Kind(models.TextChoices):
        AVATAR = "avatar", "Avatar"
        HOMEWORK = "homework", "Homework"
        DOCUMENT = "document", "Document"
        NOTE = "note", "Note attachment"
        OTHER = "other", "Other"

    # The user the file belongs to (a student, a staff member's own avatar, …).
    owner = models.ForeignKey("identity.User", on_delete=models.CASCADE, related_name="files")
    # Who performed the upload (self or a staff member) — preserved for audit.
    uploaded_by = models.ForeignKey(
        "identity.User", on_delete=models.PROTECT, related_name="uploaded_files"
    )
    file = models.FileField(upload_to=attachment_upload_to, max_length=500)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveIntegerField()
    kind = models.CharField(
        max_length=20, choices=Kind.choices, default=Kind.DOCUMENT, db_index=True
    )

    class Meta:
        db_table = "files_attachment"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["owner", "kind"])]

    def __str__(self):
        return f"{self.original_name} ({self.kind})"

    @property
    def is_public_avatar(self):
        """Avatars are low-sensitivity and served by unguessable UUID URL, so they
        may render in <img> without auth. Everything else stays private."""
        return self.kind == self.Kind.AVATAR
