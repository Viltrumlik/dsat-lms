"""
DSAT LMS v2 — Identity Admin URLs
Domain: Identity
Description: Admin user-management endpoints (mounted at /api/v1/admin/).
Permissions: IsAdmin on every view (see views_admin.py).
"""

from django.urls import path

from .views_admin import (
    AdminOrgSettingView,
    AdminSearchView,
    AdminUserDeactivateView,
    AdminUserDetailView,
    AdminUserImportView,
    AdminUserListCreateView,
    AdminUserReactivateView,
    AdminUserRoleView,
    AdminUserSetPasswordView,
)

app_name = "identity_admin"

urlpatterns = [
    path("org-settings/", AdminOrgSettingView.as_view(), name="org-setting"),
    path("search/", AdminSearchView.as_view(), name="search"),
    path("users/", AdminUserListCreateView.as_view(), name="user-list"),
    path("users/import/", AdminUserImportView.as_view(), name="user-import"),
    path("users/<uuid:pk>/", AdminUserDetailView.as_view(), name="user-detail"),
    path("users/<uuid:pk>/role/", AdminUserRoleView.as_view(), name="user-role"),
    path("users/<uuid:pk>/deactivate/", AdminUserDeactivateView.as_view(), name="user-deactivate"),
    path("users/<uuid:pk>/reactivate/", AdminUserReactivateView.as_view(), name="user-reactivate"),
    path(
        "users/<uuid:pk>/set-password/",
        AdminUserSetPasswordView.as_view(),
        name="user-set-password",
    ),
]
