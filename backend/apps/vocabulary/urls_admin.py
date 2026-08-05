"""
DSAT LMS v2 — Vocabulary admin URLs
Domain: Vocabulary (content studio)
Description: Word-list authoring (mounted at /api/v1/admin/).
Permissions: IsAdmin on every view (see views_admin.py).
"""

from django.urls import path

from .views_admin import (
    AdminSectionDetailView,
    AdminSectionListCreateView,
    AdminSectionSetsView,
    AdminSetDetailView,
    AdminSetImportView,
    AdminSetWordsView,
    AdminWordDetailView,
)

app_name = "vocabulary_admin"

urlpatterns = [
    path("vocabulary/sections/", AdminSectionListCreateView.as_view(), name="section-list"),
    path(
        "vocabulary/sections/<uuid:pk>/",
        AdminSectionDetailView.as_view(),
        name="section-detail",
    ),
    path(
        "vocabulary/sections/<uuid:pk>/sets/",
        AdminSectionSetsView.as_view(),
        name="section-sets",
    ),
    path("vocabulary/sets/<uuid:pk>/", AdminSetDetailView.as_view(), name="set-detail"),
    path("vocabulary/sets/<uuid:pk>/words/", AdminSetWordsView.as_view(), name="set-words"),
    path("vocabulary/sets/<uuid:pk>/import/", AdminSetImportView.as_view(), name="set-import"),
    path("vocabulary/words/<uuid:pk>/", AdminWordDetailView.as_view(), name="word-detail"),
]
