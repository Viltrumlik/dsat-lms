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
from .views_students import (
    AdminBulkStudentView,
    AdminStudentsListView,
    SavedFilterDeleteView,
    SavedFilterListCreateView,
)

app_name = "crm_admin"

urlpatterns = [
    # Student-360 directory (distinct from /admin/users)
    path("students/", AdminStudentsListView.as_view(), name="students-list"),
    path("students/bulk/", AdminBulkStudentView.as_view(), name="students-bulk"),
    path("saved-filters/", SavedFilterListCreateView.as_view(), name="saved-filter-list"),
    path("saved-filters/<uuid:pk>/", SavedFilterDeleteView.as_view(), name="saved-filter-delete"),
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
