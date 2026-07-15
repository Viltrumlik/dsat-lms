"""
DSAT LMS v2 — CRM admin URLs (tags)
Domain: CRM; mounted at /api/v1/admin/. IsAdmin.
"""

from django.urls import path

from .views_admin import (
    AdminTagDeleteView,
    AdminTagListCreateView,
    EntityTagDeleteView,
    EntityTagsView,
)

app_name = "crm_admin"

urlpatterns = [
    # Namespaced under crm/ — question_bank owns /admin/tags/ (question tags).
    path("crm/tags/", AdminTagListCreateView.as_view(), name="tag-list"),
    path("crm/tags/<uuid:pk>/", AdminTagDeleteView.as_view(), name="tag-delete"),
    # Entity tagging — entity_type ∈ {student, lead}
    path(
        "crm/tags/<str:entity_type>/<uuid:entity_id>/",
        EntityTagsView.as_view(),
        name="entity-tags",
    ),
    path(
        "crm/tags/<str:entity_type>/<uuid:entity_id>/<uuid:tag_id>/",
        EntityTagDeleteView.as_view(),
        name="entity-tag-delete",
    ),
]
