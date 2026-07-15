"""
DSAT LMS v2 — Courses test factories
Domain: Courses
"""

import factory

from apps.courses.models import Course, Lesson, Unit
from apps.courses.services import unique_course_slug
from apps.identity.tests.factories import AdminUserFactory


class CourseFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Course

    title = factory.Sequence(lambda n: f"Course {n}")
    description = "A course."
    subject = Course.Subject.MATH
    created_by = factory.SubFactory(AdminUserFactory)

    @factory.lazy_attribute
    def slug(self):
        return unique_course_slug(self.title)


class UnitFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Unit

    course = factory.SubFactory(CourseFactory)
    title = factory.Sequence(lambda n: f"Unit {n}")
    position = factory.Sequence(lambda n: n + 1)


class LessonFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Lesson

    unit = factory.SubFactory(UnitFactory)
    title = factory.Sequence(lambda n: f"Lesson {n}")
    position = factory.Sequence(lambda n: n + 1)
    content_md = "# Lesson\n\nSome $x^2$ content."
