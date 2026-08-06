"""
DSAT LMS v2 — Question Bank Filters
Domain: Question Bank
Description: FilterSet for public question browsing.

Three of these are the student's filters rather than the data's:

    band       easy / medium / hard. Difficulty is stored 1–5 (finer than the
               SAT's own tiers, which is useful when ordering a module) but
               nobody browses in fives — see taxonomy.BANDS.
    category   accepts a DOMAIN and means "anything under it", because picking
               "Algebra" and getting nothing (every question is tagged with a
               skill, not the domain) is simply wrong.
    status     done / todo — needs the requesting user, so the filterset reads
               it off the request.
"""

import django_filters

from .models import Question
from .taxonomy import BANDS, difficulties_for


class QuestionFilter(django_filters.FilterSet):
    difficulty_min = django_filters.NumberFilter(field_name="difficulty", lookup_expr="gte")
    difficulty_max = django_filters.NumberFilter(field_name="difficulty", lookup_expr="lte")
    tag = django_filters.CharFilter(field_name="tags__slug", lookup_expr="iexact")

    # Repeatable: ?band=easy&band=hard
    band = django_filters.MultipleChoiceFilter(
        choices=[(b, b) for b in sorted(BANDS)], method="filter_band"
    )
    category = django_filters.UUIDFilter(method="filter_category")
    status = django_filters.ChoiceFilter(
        choices=[("done", "Answered"), ("todo", "Not answered")], method="filter_status"
    )

    class Meta:
        model = Question
        fields = {
            "module": ["exact"],
            "difficulty": ["exact"],
            "answer_type": ["exact"],
            "has_math": ["exact"],
            "source": ["exact"],
        }

    def filter_band(self, queryset, name, value):
        difficulties = difficulties_for(value)
        return queryset.filter(difficulty__in=difficulties) if difficulties else queryset

    def filter_category(self, queryset, name, value):
        from .practice import descendant_ids

        return queryset.filter(category_id__in=descendant_ids([value]))

    def filter_status(self, queryset, name, value):
        from .practice import answered_question_ids

        user = getattr(self.request, "user", None)
        if user is None or not user.is_authenticated:
            return queryset
        answered = answered_question_ids(user)
        if value == "done":
            return queryset.filter(id__in=answered)
        return queryset.exclude(id__in=answered)
