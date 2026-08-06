"""
DSAT LMS v2 — Question Bank URLs
Domain: Question Bank
Description: Public question browsing endpoints (mounted at /api/v1/questions/).
"""

from django.urls import path

from .views import CategoryListView, QuestionDetailView, QuestionListView, TagListView
from .views_practice import PracticeOptionsView, PracticePreviewView, PracticeStartView

app_name = "question_bank"

urlpatterns = [
    path("categories/", CategoryListView.as_view(), name="category-list"),
    # Practice must sit ABOVE <uuid:pk>/ — a literal segment and a UUID converter
    # don't collide, but keeping the specific routes first is the safe habit.
    path("practice/options/", PracticeOptionsView.as_view(), name="practice-options"),
    path("practice/preview/", PracticePreviewView.as_view(), name="practice-preview"),
    path("practice/start/", PracticeStartView.as_view(), name="practice-start"),
    path("tags/", TagListView.as_view(), name="tag-list"),
    path("", QuestionListView.as_view(), name="question-list"),
    path("<uuid:pk>/", QuestionDetailView.as_view(), name="question-detail"),
]
