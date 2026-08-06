"""
DSAT LMS v2 — Full mock exam seed
Domain: Assessments
Description: A complete four-module mock with a timed break in the middle —
    the paper a student actually sits, rather than a one-section demo.

Structure (as asked for): Math 1 → Math 2 → 10-minute break → English 1 →
English 2. The official Digital SAT runs Reading & Writing first and Math after
the break; the order lives in MODULES below and is one edit either way.

There is deliberately NO whole-exam time_limit. Each module is timed
separately and the break costs nothing — which is also what makes the break
free: with a paper-wide clock, resting would eat the time you rest in.

Idempotent: keyed on the title, and re-running refills the modules from the
current bank.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.assessments.models import ExamQuestion, ExamSection, ExamTemplate
from apps.identity.models import User
from apps.question_bank.models import Question

TITLE = "Full Mock Exam 1"

# (title, module, minutes, questions, break after this module)
MODULES = [
    ("Module 1: Math", ExamSection.Module.MATH, 35, 22, None),
    ("Module 2: Math", ExamSection.Module.MATH, 35, 22, 10),
    ("Module 1: English", ExamSection.Module.READING_WRITING, 32, 27, None),
    ("Module 2: English", ExamSection.Module.READING_WRITING, 32, 27, None),
]


class Command(BaseCommand):
    help = "Seed a full four-module mock exam with a 10-minute break."

    def add_arguments(self, parser):
        parser.add_argument(
            "--title", default=TITLE, help="Exam title (re-running the same title refills it)."
        )

    @transaction.atomic
    def handle(self, *args, **options):
        title = options["title"]
        author = (
            User.objects.filter(role="admin", is_active=True).order_by("created_at").first()
            or User.objects.filter(is_superuser=True).first()
        )
        if author is None:
            self.stderr.write(self.style.ERROR("No admin user to author the exam. Seed one first."))
            return

        exam, created = ExamTemplate.objects.get_or_create(
            title=title,
            defaults={
                "type": ExamTemplate.Type.MOCK,
                "description": (
                    "A full-length Digital SAT mock: four timed modules with a "
                    "10-minute break in the middle. Sat in full screen."
                ),
                "module": ExamTemplate.Module.FULL,
                "time_limit": None,
                "allow_pause": False,
                "requires_fullscreen": True,
                "access_level": ExamTemplate.AccessLevel.ACADEMY,
                "created_by": author,
            },
        )
        if not created:
            # A re-run refills the paper; the settings are the point of the seed.
            exam.type = ExamTemplate.Type.MOCK
            exam.module = ExamTemplate.Module.FULL
            exam.time_limit = None
            exam.allow_pause = False
            exam.requires_fullscreen = True
            exam.save()
            exam.sections.all().delete()

        used: set = set()
        total = 0
        for number, (name, module, minutes, wanted, break_after) in enumerate(MODULES, start=1):
            section = ExamSection.objects.create(
                exam=exam,
                title=name,
                module=module,
                section_number=number,
                time_limit=minutes,
                break_after_minutes=break_after,
                sort_order=number,
            )
            pool = list(
                Question.objects.filter(status=Question.Status.PUBLISHED, module=module)
                .exclude(id__in=used)
                .order_by("difficulty", "id")
                .values_list("id", flat=True)[:wanted]
            )
            used.update(pool)
            ExamQuestion.objects.bulk_create(
                [
                    ExamQuestion(section=section, question_id=qid, position=position)
                    for position, qid in enumerate(pool, start=1)
                ]
            )
            total += len(pool)
            if len(pool) < wanted:
                self.stdout.write(
                    self.style.WARNING(
                        f"  {name}: only {len(pool)} of {wanted} questions — "
                        f"the bank is short on published {module} items."
                    )
                )
            else:
                self.stdout.write(f"  {name}: {len(pool)} questions, {minutes} min")
            if break_after:
                self.stdout.write(f"  — {break_after}-minute break —")

        self.stdout.write(
            self.style.SUCCESS(f"{exam.title}: 4 modules, {total} questions, full screen.")
        )
