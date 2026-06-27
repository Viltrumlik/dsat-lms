"""
DSAT LMS v2 — Academy Test Factories
Domain: Academy
"""

import factory

from apps.academy.models import Class, ClassEnrollment
from apps.identity.tests.factories import UserFactory


class ClassFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Class

    name = factory.Sequence(lambda n: f"Class {n}")
    teacher = factory.SubFactory(UserFactory, role="teacher")


class ClassEnrollmentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ClassEnrollment

    klass = factory.SubFactory(ClassFactory)
    student = factory.SubFactory(UserFactory, role="student")
    status = ClassEnrollment.Status.ACTIVE
