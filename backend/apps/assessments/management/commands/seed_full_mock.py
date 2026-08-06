"""
DSAT LMS v2 — Full mock exam seed
Domain: Assessments
Description: A complete four-module mock with a timed break in the middle —
    the paper a student actually sits, rather than a one-section demo.

Structure (as asked for): Math 1 → Math 2 → 10-minute break → English 1 →
English 2. The official Digital SAT runs Reading & Writing first and Math after
the break; the order lives in MODULES below and is one edit either way.

ADAPTIVE, like the real thing: module 1 of each subject is the same for everyone
and module 2 is chosen from how module 1 went. So the second module of each
subject is filled TWICE — a lower form from the easier half of the bank and an
upper form from the harder half — and a student is served exactly one of them.
See apps/assessments/adaptive.py.

There is deliberately NO whole-exam time_limit. Each module is timed
separately and the break costs nothing — which is also what makes the break
free: with a paper-wide clock, resting would eat the time you rest in.

Idempotent: keyed on the title, and re-running refills the modules from the
current bank.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.assessments.adaptive import Routing
from apps.assessments.models import ExamQuestion, ExamSection, ExamTemplate
from apps.identity.models import User
from apps.question_bank.models import Question

TITLE = "Full Mock Exam 1"

# (subject, module, minutes, questions, break after this module, adaptive?)
#
# The title is the SUBJECT only. The runner derives "Section N, Module M: …"
# itself by grouping consecutive same-module sections, so a title of
# "Module 1: Math" would render as "Section 1, Module 1: Module 1: Math".
#
# `adaptive` marks the SECOND module of each subject — the one that gets two
# forms. The first module of a subject is never routed: it is the thing the
# routing decision is made FROM.
MODULES = [
    ("Math", ExamSection.Module.MATH, 35, 22, None, False),
    ("Math", ExamSection.Module.MATH, 35, 22, 10, True),
    ("English", ExamSection.Module.READING_WRITING, 32, 27, None, False),
    ("English", ExamSection.Module.READING_WRITING, 32, 27, None, True),
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
                "is_adaptive": True,
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
            exam.is_adaptive = True
            exam.allow_pause = False
            exam.requires_fullscreen = True
            exam.save()
            exam.sections.all().delete()

        used: set = set()
        total = 0
        for number, (name, module, minutes, wanted, break_after, adaptive) in enumerate(
            MODULES, start=1
        ):
            section = ExamSection.objects.create(
                exam=exam,
                title=name,
                module=module,
                section_number=number,
                time_limit=minutes,
                break_after_minutes=break_after,
                sort_order=number,
            )
            position = 1
            # A non-routed module is one `standard` form; a routed one is a
            # lower and an upper of the SAME length, drawn from opposite ends of
            # the difficulty range so the two forms are actually different papers.
            forms = (
                [(Routing.LOWER, "easy"), (Routing.UPPER, "hard")]
                if adaptive
                else [(Routing.STANDARD, None)]
            )
            for routing, end in forms:
                pool = self._pick(module, wanted, used, end)
                used.update(pool)
                ExamQuestion.objects.bulk_create(
                    [
                        ExamQuestion(
                            section=section,
                            question_id=qid,
                            position=position + offset,
                            routing=routing,
                        )
                        for offset, qid in enumerate(pool)
                    ]
                )
                position += len(pool)
                total += len(pool)
                label = f" ({routing})" if adaptive else ""
                if len(pool) < wanted:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  Module {number}: {name}{label}: only {len(pool)} of {wanted} "
                            f"questions — the bank is short on published {module} items."
                        )
                    )
                else:
                    self.stdout.write(
                        f"  Module {number}: {name}{label}: {len(pool)} questions, {minutes} min"
                    )
            if break_after:
                self.stdout.write(f"  — {break_after}-minute break —")

        self.stdout.write(
            self.style.SUCCESS(
                f"{exam.title}: 4 modules ({total} questions incl. both adaptive forms), "
                "full screen."
            )
        )

    @staticmethod
    def _pick(module, wanted, used, end):
        """`wanted` unused published questions, from one end of the difficulty range.

        `end=None` takes them in difficulty order (a static module); "easy" and
        "hard" take from the bottom and the top, which is what makes the two
        forms of a routed module worth routing between.
        """
        queryset = Question.objects.filter(status=Question.Status.PUBLISHED, module=module).exclude(
            id__in=used
        )
        order = {"easy": "difficulty", "hard": "-difficulty"}.get(end, "difficulty")
        return list(queryset.order_by(order, "id").values_list("id", flat=True)[:wanted])
