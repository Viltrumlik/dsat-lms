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
    teacher@dsat.local      / DevTeacher123!
    student@dsat.local      / DevStudent123!
    receptionist@dsat.local / DevReception123!
    manager@dsat.local      / DevManager123!   (academic_manager)
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
RECEPTIONIST_EMAIL = "receptionist@dsat.local"
RECEPTIONIST_PASSWORD = "DevReception123!"
MANAGER_EMAIL = "manager@dsat.local"
MANAGER_PASSWORD = "DevManager123!"
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
        self._get_or_create_user(
            RECEPTIONIST_EMAIL, RECEPTIONIST_PASSWORD, "Dilnoza", "Yusupova", role="receptionist"
        )
        self._get_or_create_user(
            MANAGER_EMAIL, MANAGER_PASSWORD, "Sardor", "Rahimov", role="academic_manager"
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

        # Support Center (Phase 4 S1) — publish teacher availability so the
        # "Book a Teacher" flow has bookable slots (idempotent). Mon–Fri, both
        # subjects, 09:00–17:00 in 30-min slots.
        from datetime import time as _time

        from apps.support.models import TeacherAvailability

        av_made = 0
        for subject in ("math", "reading_writing"):
            for weekday in range(5):
                _, created = TeacherAvailability.objects.get_or_create(
                    teacher=teacher,
                    subject=subject,
                    weekday=weekday,
                    start_time=_time(9, 0),
                    defaults={"end_time": _time(17, 0), "slot_minutes": 30},
                )
                av_made += int(created)
        self._note("support availability", f"{teacher.email} (+{av_made} new)", av_made > 0)

        # Support trigger (Phase 4 S4) — give the student a weak topic so the daily
        # sweep raises a recommendation, then run the sweep so the dashboard banner
        # + deep-link are demoable/e2e-able (idempotent: the sweep dedupes).
        from apps.analytics.models import UserCategoryStat
        from apps.question_bank.models import QuestionCategory
        from apps.support.services import run_support_sweep

        weak_cat, _ = QuestionCategory.objects.get_or_create(
            slug="algebra-demo", defaults={"module": "math", "name": "Algebra"}
        )
        UserCategoryStat.objects.update_or_create(
            user=student,
            category=weak_cat,
            defaults={
                "total_answered": 12,
                "total_correct": 4,
                "accuracy_pct": 35,
                "last_practiced_at": timezone.now(),
            },
        )
        sweep = run_support_sweep()
        self._note("support recommendations (sweep)", f"+{sweep.get('created', 0)}", True)

        # Office hours (Phase 4 S5) — a weekly template + materialize so the browse
        # + join flow has upcoming sessions (idempotent).
        from apps.support.models import OfficeHour
        from apps.support.office_hours import materialize_office_hours

        for weekday in range(5):
            OfficeHour.objects.get_or_create(
                teacher=teacher,
                subject="math",
                weekday=weekday,
                start_time=_time(15, 0),
                defaults={"title": "Math drop-in", "end_time": _time(16, 0), "capacity": 25},
            )
        oh_made = materialize_office_hours()
        self._note("office-hours sessions (materialize)", f"+{oh_made}", oh_made > 0)

        self.stdout.write(self.style.SUCCESS(f"TEACHER={TEACHER_EMAIL} / {TEACHER_PASSWORD}"))
        self.stdout.write(self.style.SUCCESS(f"STUDENT={STUDENT_EMAIL} / {STUDENT_PASSWORD}"))
        self.stdout.write(
            self.style.SUCCESS(f"RECEPTIONIST={RECEPTIONIST_EMAIL} / {RECEPTIONIST_PASSWORD}")
        )
        self.stdout.write(self.style.SUCCESS(f"MANAGER={MANAGER_EMAIL} / {MANAGER_PASSWORD}"))
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
