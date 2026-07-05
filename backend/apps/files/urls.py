"""
DSAT LMS v2 — Files URLs
Domain: Files
Description: Upload/list/detail/download/set-avatar, mounted at /api/v1/files/.
"""

from django.urls import path

from .views import FileDetailView, FileDownloadView, FileListCreateView, SetAvatarView

app_name = "files"

urlpatterns = [
    path("", FileListCreateView.as_view(), name="file-list-create"),
    path("<uuid:pk>/", FileDetailView.as_view(), name="file-detail"),
    path("<uuid:pk>/download/", FileDownloadView.as_view(), name="file-download"),
    path("<uuid:pk>/set-avatar/", SetAvatarView.as_view(), name="file-set-avatar"),
]
