"""
DSAT LMS v2 — Question Bank Filters
Domain: Question Bank
Description: FilterSet for public question browsing (module, difficulty range,
            category, tag, answer type, source).
"""

import django_filters

from .models import Question


class QuestionFilter(django_filters.FilterSet):
    difficulty_min = django_filters.NumberFilter(field_name="difficulty", lookup_expr="gte")
    difficulty_max = django_filters.NumberFilter(field_name="difficulty", lookup_expr="lte")
    tag = django_filters.CharFilter(field_name="tags__slug", lookup_expr="iexact")

    class Meta:
        model = Question
        fields = {
            "module": ["exact"],
            "difficulty": ["exact"],
            "answer_type": ["exact"],
            "has_math": ["exact"],
            "category": ["exact"],
            "source": ["exact"],
        }
