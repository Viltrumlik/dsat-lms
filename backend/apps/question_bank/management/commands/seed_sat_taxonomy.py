"""
Seed the official SAT domain → skill tree into QuestionCategory.

Idempotent: matched by (module, name, parent), so re-running fixes ordering and
fills gaps without duplicating. Safe to run on a populated bank — it never
touches questions, only the categories they point at.

    python manage.py seed_sat_taxonomy
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from apps.question_bank.models import QuestionCategory
from apps.question_bank.taxonomy import TAXONOMY


class Command(BaseCommand):
    help = "Seed/refresh the SAT domains and skills (idempotent)."

    @transaction.atomic
    def handle(self, *args, **options):
        domains = skills = 0
        for module, entries in TAXONOMY.items():
            for domain_order, (domain_name, skill_names) in enumerate(entries):
                domain, created = self._upsert(module, domain_name, None, domain_order)
                domains += int(created)
                for skill_order, skill_name in enumerate(skill_names):
                    _, made = self._upsert(module, skill_name, domain, skill_order)
                    skills += int(made)

        pruned = self._prune_empty_duplicates()

        self.stdout.write(
            self.style.SUCCESS(
                f"Taxonomy seeded — {domains} new domain(s), {skills} new skill(s), "
                f"{pruned} empty duplicate(s) pruned. "
                f"Total categories: {QuestionCategory.objects.count()}."
            )
        )

    @staticmethod
    def _prune_empty_duplicates():
        """Drop leftover same-named categories that nothing points at.

        Hand-seeded data left a second "Algebra" carrying no questions and no
        children — harmless in the table, confusing in a picker that shows it
        next to the real one with a count of zero. Only a duplicate that is
        genuinely unreferenced is removed.
        """
        seen: dict = {}
        pruned = 0
        for category in QuestionCategory.objects.order_by("created_at"):
            key = (category.module, category.name, category.parent_id)
            if key not in seen:
                seen[key] = category
                continue
            if category.questions.exists() or category.children.exists():
                continue
            category.delete()
            pruned += 1
        return pruned

    @staticmethod
    def _upsert(module, name, parent, order):
        """Find-or-create, tolerating duplicates already in the table.

        Early hand-seeded data left more than one row with the same
        (module, name) — get_or_create would raise on that. The first match
        wins and becomes the canonical one; the stray is left alone rather than
        deleted, because questions may already point at it.
        """
        existing = (
            QuestionCategory.objects.filter(module=module, name=name, parent=parent)
            .order_by("created_at")
            .first()
        )
        if existing is not None:
            if existing.sort_order != order:
                existing.sort_order = order
                existing.save(update_fields=["sort_order"])
            return existing, False
        return (
            QuestionCategory.objects.create(
                module=module,
                name=name,
                parent=parent,
                slug=slugify(f"{module}-{name}")[:100],
                sort_order=order,
            ),
            True,
        )
