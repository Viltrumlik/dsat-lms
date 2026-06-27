"""
DSAT LMS v2 — Question Bank URLs
Domain: Question Bank
Description: Public question browsing endpoints (mounted at /api/v1/questions/).
"""

from django.urls import path

from .views import CategoryListView, QuestionDetailView, QuestionListView, TagListView

app_name = "question_bank"

urlpatterns = [
    path("categories/", CategoryListView.as_view(), name="category-list"),
    path("tags/", TagListView.as_view(), name="tag-list"),
    path("", QuestionListView.as_view(), name="question-list"),
    path("<uuid:pk>/", QuestionDetailView.as_view(), name="question-detail"),
]
