"""
Fill the question bank with demo questions spread across the SAT taxonomy.

The taxonomy is real; these questions are NOT — they exist so the bank, its
filters and the drill builder can be exercised end to end before real content is
authored. Every one is tagged `source=custom` with source_ref "demo-bank" so the
whole set can be found and removed:

    Question.objects.filter(source_ref="demo-bank").delete()

Idempotent: matched on (category, source_ref, stem).

    python manage.py seed_practice_bank [--per-skill 4]
"""

import random

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.identity.models import User
from apps.question_bank.models import Question, QuestionCategory, QuestionChoice

MARKER = "demo-bank"

# (stem template, [choice texts], correct label) — deliberately simple, and
# self-consistent so a student drilling them still gets right/wrong feedback
# that makes sense.
MATH_SEEDS = [
    ("If ${a}x + {b} = {c}$, what is the value of $x$?", "linear"),
    ("What is the value of ${a} \\times {b} - {c}$?", "arith"),
    ("A line passes through $(0, {b})$ with slope ${a}$. What is $y$ when $x = {c}$?", "line"),
]
RW_SEEDS = [
    ("Which choice completes the text with the most logical transition?", "transition"),
    ("Which choice best states the main idea of the text?", "main-idea"),
    ("Which choice conforms to the conventions of Standard English?", "conventions"),
]

RW_CHOICES = [
    ["However,", "Therefore,", "For example,", "Meanwhile,"],
    ["It documents a shift.", "It rejects a claim.", "It defines a term.", "It poses a question."],
    ["their", "there", "they're", "theirs"],
]


class Command(BaseCommand):
    help = "Seed demo questions across the SAT taxonomy (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--per-skill", type=int, default=4)

    @transaction.atomic
    def handle(self, *args, **options):
        per_skill = options["per_skill"]
        author = User.objects.filter(role=User.Role.ADMIN).order_by("created_at").first()
        if author is None:
            self.stderr.write("No admin user — run seed_demo_admin first.")
            return

        skills = QuestionCategory.objects.exclude(parent=None).order_by("module", "name")
        if not skills.exists():
            self.stderr.write("No taxonomy — run seed_sat_taxonomy first.")
            return

        rng = random.Random(20260805)  # deterministic, so re-runs match
        created = 0

        for skill in skills:
            is_math = skill.module == "math"
            for index in range(per_skill):
                # Spread 1–5 so every band has something in it.
                difficulty = [1, 2, 3, 4, 5][index % 5]

                if is_math:
                    template, _kind = MATH_SEEDS[index % len(MATH_SEEDS)]
                    a, b, c = rng.randint(2, 9), rng.randint(2, 20), rng.randint(20, 60)
                    stem = template.format(a=a, b=b, c=c)
                    answer_type = Question.AnswerType.GRID_IN if index % 4 == 3 else "mcq"
                else:
                    template, _kind = RW_SEEDS[index % len(RW_SEEDS)]
                    stem = template
                    answer_type = "mcq"

                stem = f"{stem}  _(demo · {skill.name} · {index + 1})_"

                question, made = Question.objects.get_or_create(
                    category=skill,
                    source_ref=MARKER,
                    stem=stem,
                    defaults={
                        "module": skill.module,
                        "difficulty": difficulty,
                        "answer_type": answer_type,
                        "has_math": is_math,
                        "status": Question.Status.PUBLISHED,
                        "source": "custom",
                        "correct_answer": "",
                        "created_by": author,
                    },
                )
                if not made:
                    continue

                if answer_type == "mcq":
                    texts = (
                        [f"${rng.randint(1, 40)}$" for _ in range(4)]
                        if is_math
                        else RW_CHOICES[index % len(RW_CHOICES)]
                    )
                    correct = "ABCD"[index % 4]
                    for position, (label, text) in enumerate(zip("ABCD", texts, strict=False)):
                        QuestionChoice.objects.create(
                            question=question, label=label, text=text, sort_order=position
                        )
                    question.correct_answer = correct
                else:
                    question.correct_answer = str(rng.randint(2, 40))
                question.save(update_fields=["correct_answer"])
                created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {created} demo question(s) across {skills.count()} skills. "
                f"Bank total: {Question.objects.filter(status='published').count()} published."
            )
        )
