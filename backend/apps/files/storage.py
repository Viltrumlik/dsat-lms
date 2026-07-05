"""
DSAT LMS v2 — Files storage abstraction
Domain: Files
Description: One upload path with dev/prod parity. Dev uses the local filesystem
    (FileSystemStorage); prod uses Cloudflare R2 (S3) via django-storages. The
    storage KEY is derived server-side (never client-controlled). Private files are
    streamed from local storage (auth already enforced by the view) or 302-redirected
    to a short-lived presigned URL on remote storage.
"""

from pathlib import Path

from django.core.files.storage import FileSystemStorage
from django.http import FileResponse, HttpResponseRedirect

# Only these render inline; anything else is forced to download so user-supplied
# bytes can't be interpreted as an active document in the backend origin.
INLINE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"}


def attachment_upload_to(instance, filename):
    """Server-controlled storage key: attachments/<kind>/<owner>/<uuid><ext>.
    The UUID pk is assigned at model instantiation, so it is available here."""
    ext = Path(filename).suffix.lower()[:20]
    return f"attachments/{instance.kind}/{instance.owner_id}/{instance.id}{ext}"


def download_response(attachment):
    """Serve an attachment's bytes. Remote storage 302-redirects to a fresh
    short-lived presigned URL; local storage streams (the view already authorized
    the request). FileResponse's `filename=` encodes the Content-Disposition per
    RFC 6266, so a hostile upload filename can't corrupt the header; nosniff +
    attachment-for-non-inline types harden against content-sniffing/XSS."""
    f = attachment.file
    if not isinstance(f.storage, FileSystemStorage):
        return HttpResponseRedirect(f.storage.url(f.name))
    inline = attachment.content_type in INLINE_TYPES
    response = FileResponse(
        f.open("rb"),
        content_type=attachment.content_type,
        as_attachment=not inline,
        filename=attachment.original_name,
    )
    response["X-Content-Type-Options"] = "nosniff"
    return response
