"""
DSAT LMS v2 — Files App Config
Domain: Files
Description: Uploads pipeline. One Attachment model + a dev/prod storage
    abstraction (local FS in dev, Cloudflare R2 in prod), backing avatars,
    homework files, student documents, and note attachments.
"""

from django.apps import AppConfig


class FilesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.files"
    label = "files"
    verbose_name = "Files"
