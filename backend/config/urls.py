"""
DSAT LMS v2 — URL Configuration
"""

from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from common.health import healthz, readyz

API_V1 = "api/v1/"

urlpatterns = [
    # Probes. Unversioned and outside the API: a load balancer should not have
    # to know what version the app is on to ask whether it is up.
    path("healthz", healthz, name="healthz"),
    path("readyz", readyz, name="readyz"),
    # Admin
    path("admin/", admin.site.urls),
    # API Docs
    path(API_V1 + "schema/", SpectacularAPIView.as_view(), name="schema"),
    path(API_V1 + "docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger"),
    # API v1
    path(API_V1 + "auth/", include("apps.identity.urls")),
    path(API_V1 + "questions/", include("apps.question_bank.urls")),
    path(API_V1 + "vocabulary/", include("apps.vocabulary.urls")),
    path(API_V1 + "exams/", include("apps.assessments.exams_urls")),
    path(API_V1 + "sessions/", include("apps.assessments.urls")),
    path(API_V1 + "analytics/", include("apps.analytics.urls")),
    path(API_V1 + "teacher/", include("apps.academy.urls.teacher")),
    path(API_V1 + "staff/", include("apps.identity.urls_staff")),
    path(API_V1 + "staff/", include("apps.crm.urls_staff")),
    path(API_V1 + "students/", include("apps.academy.urls.students")),
    path(API_V1 + "classes/", include("apps.academy.urls.classes")),
    path(API_V1 + "admin/", include("apps.identity.urls_admin")),
    path(API_V1 + "admin/", include("apps.question_bank.urls_admin")),
    path(API_V1 + "admin/", include("apps.assessments.urls_admin")),
    path(API_V1 + "admin/", include("apps.support.urls_admin")),
    path(API_V1 + "admin/", include("apps.audit.urls_admin")),
    path(API_V1 + "admin/", include("apps.analytics.urls_admin")),
    path(API_V1 + "admin/", include("apps.notifications.urls_admin")),
    path(API_V1 + "admin/", include("apps.academy.urls_admin")),
    path(API_V1 + "admin/", include("apps.courses.urls_admin")),
    path(API_V1 + "admin/", include("apps.crm.urls_admin")),
    path(API_V1 + "admin/", include("apps.automation.urls_admin")),
    path(API_V1 + "admin/", include("apps.vocabulary.urls_admin")),
    path(API_V1 + "notifications/", include("apps.notifications.urls")),
    path(API_V1 + "courses/", include("apps.courses.urls")),
    path(API_V1 + "homework/", include("apps.homework.urls")),
    path(API_V1 + "files/", include("apps.files.urls")),
    path(API_V1 + "support/", include("apps.support.urls")),
]

# Brand the Django admin from the one product-name setting.
admin.site.site_header = f"{settings.PRODUCT_NAME} administration"
admin.site.site_title = settings.PRODUCT_NAME
admin.site.index_title = "Platform data"

if settings.DEBUG:
    import debug_toolbar

    urlpatterns = [path("__debug__/", include(debug_toolbar.urls))] + urlpatterns
