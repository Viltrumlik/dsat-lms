"""
DSAT LMS v2 — Question Bank Admin URLs
Domain: Question Bank
Description: Admin content-studio endpoints (mounted at /api/v1/admin/).
Permissions: IsAdmin on every view (see views_admin.py).
"""

from django.urls import path

from .views_admin import (
    AdminCategoryDetailView,
    AdminCategoryListCreateView,
    AdminQuestionApproveView,
    AdminQuestionDetailView,
    AdminQuestionListCreateView,
    AdminQuestionNewVersionView,
    AdminQuestionRejectView,
    AdminQuestionReviewsView,
    AdminQuestionRevisionsView,
    AdminQuestionSubmitView,
    AdminTagDetailView,
    AdminTagListCreateView,
)

app_name = "question_bank_admin"

urlpatterns = [
    # Questions
    path("questions/", AdminQuestionListCreateView.as_view(), name="question-list"),
    path("questions/<uuid:pk>/", AdminQuestionDetailView.as_view(), name="question-detail"),
    path(
        "questions/<uuid:pk>/submit-for-review/",
        AdminQuestionSubmitView.as_view(),
        name="question-submit",
    ),
    path(
        "questions/<uuid:pk>/approve/", AdminQuestionApproveView.as_view(), name="question-approve"
    ),
    path("questions/<uuid:pk>/reject/", AdminQuestionRejectView.as_view(), name="question-reject"),
    path(
        "questions/<uuid:pk>/new-version/",
        AdminQuestionNewVersionView.as_view(),
        name="question-new-version",
    ),
    path(
        "questions/<uuid:pk>/reviews/", AdminQuestionReviewsView.as_view(), name="question-reviews"
    ),
    path(
        "questions/<uuid:pk>/revisions/",
        AdminQuestionRevisionsView.as_view(),
        name="question-revisions",
    ),
    # Categories
    path("categories/", AdminCategoryListCreateView.as_view(), name="category-list"),
    path("categories/<uuid:pk>/", AdminCategoryDetailView.as_view(), name="category-detail"),
    # Tags
    path("tags/", AdminTagListCreateView.as_view(), name="tag-list"),
    path("tags/<uuid:pk>/", AdminTagDetailView.as_view(), name="tag-detail"),
]
