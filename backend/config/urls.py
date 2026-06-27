"""
DSAT LMS v2 — URL Configuration
"""

from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

API_V1 = "api/v1/"

urlpatterns = [
    # Admin
    path("admin/", admin.site.urls),
    # API Docs
    path(API_V1 + "schema/", SpectacularAPIView.as_view(), name="schema"),
    path(API_V1 + "docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger"),
    # API v1
    path(API_V1 + "auth/", include("apps.identity.urls")),
    path(API_V1 + "questions/", include("apps.question_bank.urls")),
    path(API_V1 + "sessions/", include("apps.assessments.urls")),
    path(API_V1 + "analytics/", include("apps.analytics.urls")),
    path(API_V1 + "teacher/", include("apps.academy.urls.teacher")),
    path(API_V1 + "admin/", include("apps.identity.urls_admin")),
    path(API_V1 + "notifications/", include("apps.notifications.urls")),
    path(API_V1 + "homework/", include("apps.homework.urls")),
]

if settings.DEBUG:
    import debug_toolbar

    urlpatterns = [path("__debug__/", include(debug_toolbar.urls))] + urlpatterns
