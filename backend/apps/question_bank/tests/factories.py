"""
DSAT LMS v2 — Question Bank Test Factories
Domain: Question Bank
"""

import factory

from apps.identity.tests.factories import UserFactory
from apps.question_bank.models import Question, QuestionCategory, QuestionChoice, QuestionTag


class CategoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = QuestionCategory

    module = "math"
    name = factory.Sequence(lambda n: f"Category {n}")
    slug = factory.Sequence(lambda n: f"category-{n}")


class TagFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = QuestionTag

    name = factory.Sequence(lambda n: f"Tag {n}")
    slug = factory.Sequence(lambda n: f"tag-{n}")


class QuestionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Question

    module = "math"
    category = factory.SubFactory(CategoryFactory)
    difficulty = 3
    status = Question.Status.PUBLISHED
    stem = factory.Sequence(lambda n: f"Question stem {n}")
    correct_answer = "A"
    answer_type = "mcq"
    source = "custom"
    created_by = factory.SubFactory(UserFactory)


class ChoiceFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = QuestionChoice

    question = factory.SubFactory(QuestionFactory)
    label = "A"
    text = factory.Sequence(lambda n: f"Choice {n}")
