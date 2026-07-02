"""
DSAT LMS v2 — Seed a demo academy (teacher, class, student, homework).
Domain: Homework (dev tooling)

Creates the fixtures the academy surfaces need in dev/e2e:
a teacher, a class they own, an enrolled (verified) student, and two published
homework assignments — one backed by the demo practice exam (run seed_demo_exam
first for that link to appear), one plain.

Idempotent: re-running reuses existing rows (keyed by email / class name /
homework title).

    python manage.py seed_demo_academy

Dev credentials:
    teacher@dsat.local / DevTeacher123!
    student@dsat.local / DevStudent123!
"""

import datetime as dt

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.academy.models import Class, ClassEnrollment
from apps.assessments.models import ExamTemplate
from apps.homework.models import Homework
from apps.identity.models import User

TEACHER_EMAIL = "teacher@dsat.local"
TEACHER_PASSWORD = "DevTeacher123!"
STUDENT_EMAIL = "student@dsat.local"
STUDENT_PASSWORD = "DevStudent123!"
CLASS_NAME = "SAT Morning Group"


class Command(BaseCommand):
    help = "Seed a demo academy: teacher, class, enrolled student, homework (idempotent)."

    @transaction.atomic
    def handle(self, *args, **options):
        teacher = self._get_or_create_user(
            TEACHER_EMAIL, TEACHER_PASSWORD, "Tohir", "Malik", role="teacher"
        )
        student = self._get_or_create_user(
            STUDENT_EMAIL, STUDENT_PASSWORD, "Aziza", "Karimova", role="student"
        )

        klass, created = Class.objects.get_or_create(name=CLASS_NAME, defaults={"teacher": teacher})
        self._note("class", klass.name, created)

        _, created = ClassEnrollment.objects.get_or_create(
            klass=klass, student=student, defaults={"status": ClassEnrollment.Status.ACTIVE}
        )
        self._note("enrollment", f"{student.email} → {klass.name}", created)

        exam = ExamTemplate.objects.filter(type=ExamTemplate.Type.PRACTICE).first()
        if exam is None:
            self.stdout.write(
                self.style.WARNING(
                    "No practice exam found — the exam-backed homework will be plain. "
                    "Run seed_demo_exam first for the full flow."
                )
            )

        hw_exam, created = Homework.objects.get_or_create(
            title="Algebra practice set",
            assigned_class=klass,
            defaults={
                "description": (
                    "Complete the linked practice test.\n"
                    "Aim for at least 80% accuracy — we'll review the hardest "
                    "questions in class on Friday."
                ),
                "assigned_by": teacher,
                "exam": exam,
                "due_at": timezone.now() + dt.timedelta(days=3),
            },
        )
        self._note("homework (exam-backed)", hw_exam.title, created)

        hw_plain, created = Homework.objects.get_or_create(
            title="Read: Comma splices handout",
            assigned_class=klass,
            defaults={
                "description": (
                    "Read the handout from class and note three example sentences " "of your own."
                ),
                "assigned_by": teacher,
                "due_at": timezone.now() + dt.timedelta(days=1),
            },
        )
        self._note("homework (plain)", hw_plain.title, created)

        self.stdout.write(self.style.SUCCESS(f"TEACHER={TEACHER_EMAIL} / {TEACHER_PASSWORD}"))
        self.stdout.write(self.style.SUCCESS(f"STUDENT={STUDENT_EMAIL} / {STUDENT_PASSWORD}"))
        self.stdout.write(self.style.SUCCESS(f"CLASS_ID={klass.id}"))

    def _get_or_create_user(self, email, password, first_name, last_name, role):
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "role": role,
                "is_email_verified": True,
            },
        )
        if created:
            user.set_password(password)
            user.save(update_fields=["password"])
        self._note(role, email, created)
        return user

    def _note(self, kind, name, created):
        style = self.style.SUCCESS if created else self.style.WARNING
        verb = "created" if created else "exists"
        self.stdout.write(style(f"{kind}: {name} ({verb})"))
