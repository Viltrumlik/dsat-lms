"""
DSAT LMS v2 — Homework Test Factories
Domain: Homework
"""

from datetime import timedelta

import factory
from django.utils import timezone

from apps.academy.tests.factories import ClassFactory
from apps.homework.models import Homework


class HomeworkFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Homework

    title = factory.Sequence(lambda n: f"Homework {n}")
    assigned_class = factory.SubFactory(ClassFactory)
    assigned_by = factory.SelfAttribute("assigned_class.teacher")
    due_at = factory.LazyFunction(lambda: timezone.now() + timedelta(days=7))
