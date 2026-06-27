"""
DSAT LMS v2 — Assessments Test Factories
Domain: Assessments
"""

from decimal import Decimal

import factory

from apps.assessments.models import (
    ExamQuestion,
    ExamResult,
    ExamSection,
    ExamSession,
    ExamTemplate,
)
from apps.identity.tests.factories import UserFactory
from apps.question_bank.tests.factories import QuestionFactory


class ExamTemplateFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ExamTemplate

    type = "practice"
    title = factory.Sequence(lambda n: f"Exam {n}")
    module = "full"
    access_level = "public"
    time_limit = 30
    created_by = factory.SubFactory(UserFactory)


class ExamSectionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ExamSection

    exam = factory.SubFactory(ExamTemplateFactory)
    module = "math"
    section_number = factory.Sequence(lambda n: n + 1)
    sort_order = 0


class ExamQuestionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ExamQuestion

    section = factory.SubFactory(ExamSectionFactory)
    question = factory.SubFactory(QuestionFactory)
    position = factory.Sequence(lambda n: n + 1)


class ExamSessionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ExamSession

    user = factory.SubFactory(UserFactory)
    exam = factory.SubFactory(ExamTemplateFactory)
    status = ExamSession.Status.COMPLETED


class ExamResultFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ExamResult

    session = factory.SubFactory(ExamSessionFactory)
    user = factory.SelfAttribute("session.user")
    exam = factory.SelfAttribute("session.exam")
    total_questions = 10
    total_correct = 5
    accuracy_pct = Decimal("50.00")
