"""
DSAT LMS v2 — Seed a demo public practice exam.
Domain: Assessments (dev tooling)

Creates a small, public, startable practice test (2 sections, a handful of
published questions incl. LaTeX + a grid-in) so the end-to-end student flow can be
exercised without hand-building content in /admin/.

Idempotent: re-running reuses existing rows (keyed by question source_ref / exam
title / section number / question position). Pass --reset to rebuild the exam wiring.

    python manage.py seed_demo_exam
    python manage.py seed_demo_exam --reset
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.assessments.models import ExamQuestion, ExamSection, ExamTemplate
from apps.identity.models import User
from apps.question_bank.models import Question, QuestionCategory, QuestionChoice

EXAM_TITLE = "Demo Practice Test (Public)"

# (module, category_name) -> created on demand
SECTIONS = [
    {
        "section_number": 1,
        "title": "Reading and Writing",
        "module": "reading_writing",
        "time_limit": None,
        "questions": [
            {
                "ref": "DEMO-RW-1",
                "module": "reading_writing",
                "category": "Standard English Conventions",
                "difficulty": 2,
                "answer_type": "mcq",
                "has_math": False,
                "passage": (
                    "The committee, after reviewing dozens of proposals, "
                    "_____ a single design for the new library."
                ),
                "stem": "Which choice completes the text so that it conforms to the conventions of Standard English?",
                "correct_answer": "B",
                "choices": [
                    ("A", "have selected"),
                    ("B", "has selected"),
                    ("C", "are selecting"),
                    ("D", "select"),
                ],
            },
            {
                "ref": "DEMO-RW-2",
                "module": "reading_writing",
                "category": "Information and Ideas",
                "difficulty": 3,
                "answer_type": "mcq",
                "has_math": False,
                "passage": (
                    "Bioluminescence — the production of light by living organisms — is "
                    "common in the deep ocean, where sunlight cannot reach. Many species "
                    "use it to attract prey, while others use it to evade predators."
                ),
                "stem": "Which choice best states the main idea of the text?",
                "correct_answer": "C",
                "choices": [
                    ("A", "Sunlight is essential to most deep-ocean life."),
                    ("B", "Bioluminescence is used only to attract prey."),
                    ("C", "Bioluminescence serves multiple survival functions in the deep ocean."),
                    ("D", "Predators in the deep ocean cannot detect light."),
                ],
            },
        ],
    },
    {
        "section_number": 2,
        "title": "Math",
        "module": "math",
        "time_limit": None,
        "questions": [
            {
                "ref": "DEMO-MATH-1",
                "module": "math",
                "category": "Algebra",
                "difficulty": 2,
                "answer_type": "mcq",
                "has_math": True,
                "passage": None,
                "stem": "If $3x + 5 = 20$, what is the value of $x$?",
                "correct_answer": "B",
                "choices": [
                    ("A", "$3$"),
                    ("B", "$5$"),
                    ("C", "$7$"),
                    ("D", "$15$"),
                ],
            },
            {
                "ref": "DEMO-MATH-2",
                "module": "math",
                "category": "Advanced Math",
                "difficulty": 3,
                "answer_type": "mcq",
                "has_math": True,
                "passage": None,
                "stem": "What are the solutions to $x^2 - 5x + 6 = 0$?",
                "correct_answer": "A",
                "choices": [
                    ("A", "$x = 2$ and $x = 3$"),
                    ("B", "$x = -2$ and $x = -3$"),
                    ("C", "$x = 1$ and $x = 6$"),
                    ("D", "$x = -1$ and $x = -6$"),
                ],
            },
            {
                "ref": "DEMO-MATH-3",
                "module": "math",
                "category": "Algebra",
                "difficulty": 2,
                "answer_type": "grid_in",
                "has_math": True,
                "passage": None,
                "stem": "If $\\dfrac{x}{4} = 9$, what is the value of $x$?",
                "correct_answer": "36",
                "choices": [],
            },
        ],
    },
]


class Command(BaseCommand):
    help = "Seed a demo public practice exam (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete and rebuild the demo exam wiring (sections + question links).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        owner = (
            User.objects.filter(is_staff=True).order_by("created_at").first()
            or User.objects.order_by("created_at").first()
        )
        if owner is None:
            raise CommandError(
                "No users exist. Create one first: python manage.py createsuperuser"
            )

        existing = ExamTemplate.all_objects.filter(title=EXAM_TITLE).first()
        if existing and not options["reset"]:
            self.stdout.write(
                self.style.WARNING(
                    f"Demo exam already exists (id={existing.id}). "
                    "Use --reset to rebuild, or it's ready to use."
                )
            )
            self.stdout.write(self.style.SUCCESS(f"EXAM_ID={existing.id}"))
            return

        if existing and options["reset"]:
            # Drop sections + question links; reusable Question rows are kept.
            ExamSection.objects.filter(exam=existing).delete()
            existing.delete()
            self.stdout.write(self.style.WARNING("Removed previous demo exam wiring."))

        exam = ExamTemplate.objects.create(
            type=ExamTemplate.Type.PRACTICE,
            title=EXAM_TITLE,
            description=(
                "A short public practice test for trying the platform: two sections "
                "(Reading & Writing, Math) with a handful of questions."
            ),
            module=ExamTemplate.Module.FULL,
            time_limit=15,  # minutes
            is_adaptive=False,
            access_level=ExamTemplate.AccessLevel.PUBLIC,
            created_by=owner,
        )

        total_questions = 0
        for section_spec in SECTIONS:
            section = ExamSection.objects.create(
                exam=exam,
                title=section_spec["title"],
                module=section_spec["module"],
                section_number=section_spec["section_number"],
                time_limit=section_spec["time_limit"],
                sort_order=section_spec["section_number"],
            )
            for position, q_spec in enumerate(section_spec["questions"], start=1):
                question = self._get_or_create_question(q_spec, owner)
                ExamQuestion.objects.create(
                    section=section,
                    question=question,
                    position=position,
                )
                total_questions += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded '{EXAM_TITLE}' — {len(SECTIONS)} sections, "
                f"{total_questions} questions."
            )
        )
        self.stdout.write(self.style.SUCCESS(f"EXAM_ID={exam.id}"))

    def _get_or_create_question(self, spec, owner):
        category = self._get_or_create_category(spec["module"], spec["category"])
        question, created = Question.objects.get_or_create(
            source_ref=spec["ref"],
            defaults={
                "module": spec["module"],
                "category": category,
                "difficulty": spec["difficulty"],
                "status": Question.Status.PUBLISHED,
                "stem": spec["stem"],
                "passage": spec.get("passage"),
                "has_math": spec["has_math"],
                "answer_type": spec["answer_type"],
                "correct_answer": spec["correct_answer"],
                "source": Question.Source.CUSTOM,
                "created_by": owner,
                "published_at": timezone.now(),
            },
        )
        if created:
            for sort_order, (label, text) in enumerate(spec["choices"]):
                QuestionChoice.objects.create(
                    question=question,
                    label=label,
                    text=text,
                    sort_order=sort_order,
                )
        return question

    def _get_or_create_category(self, module, name):
        slug = slugify(f"{module}-{name}")
        category, _ = QuestionCategory.objects.get_or_create(
            slug=slug,
            defaults={"module": module, "name": name},
        )
        return category
