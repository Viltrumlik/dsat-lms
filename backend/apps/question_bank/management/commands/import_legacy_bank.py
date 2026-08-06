"""
DSAT LMS v2 — Legacy question import
Domain: Question Bank
Description: Import questions exported from the older DSAT-mock-exam system —
    the standalone bank, and the past papers out of its exam table.
Permissions: management command (operator runs it); no HTTP surface.

Idempotent on `source_ref`, so re-running corrects rows rather than duplicating
them. That matters more than it sounds: the export is a snapshot of a system
still in use, and the realistic pattern is importing it more than once.

Two shapes come in and they are not the same job:

    the bank        3.4k standalone questions, every one already tagged with a
                    College Board domain and skill. These become Questions and
                    nothing else.

    the past papers 1.2k questions that were SAT of, in order, in modules. They
                    become Questions too, but also ExamTemplates — losing the
                    ordering would turn a paper into a pile.

Taxonomy is matched by NAME against what `seed_sat_taxonomy` already created,
reading the legacy numeric ids out of the exporting system's own database. Both
sides are the College Board's published tree, so the names line up; the two that
do not are listed in _SKILL_ALIASES with the reason.
"""

import csv
import re
import sqlite3
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.question_bank.models import Question, QuestionCategory, QuestionChoice

# Legacy subject → our module.
_MODULE = {"MATH": Question.Module.MATH, "ENGLISH": Question.Module.READING_WRITING}

# Past papers carry a per-question type rather than a subject.
_MODULE_BY_QTYPE = {
    "MATH": Question.Module.MATH,
    "READING": Question.Module.READING_WRITING,
    "WRITING": Question.Module.READING_WRITING,
}

# Legacy difficulty → our 1–5. The export is uniformly MEDIUM, so this is really
# a single mapping with room for the day it is not.
_DIFFICULTY = {"EASY": 2, "MEDIUM": 3, "HARD": 4}

# Skills whose legacy name differs from ours. Only these two out of thirty.
_SKILL_ALIASES = {
    # We dropped the trailing qualifier; same College Board skill.
    "nonlinear equations in one variable and systems of equations in two variables": (
        "nonlinear equations in one variable and systems of equations"
    ),
    # A legacy duplicate of the more specific entry. Unused by the export, kept
    # so a future export carrying it does not silently lose its questions.
    "linear equations": "linear equations in one variable",
}

# Official Digital SAT module lengths, used for the past-paper sections.
_MODULE_MINUTES = {Question.Module.READING_WRITING: 32, Question.Module.MATH: 35}

_IMAGE_COLUMNS = (
    "question_image",
    "option_a_image",
    "option_b_image",
    "option_c_image",
    "option_d_image",
)


# The legacy content delimits TeX the LaTeX way — \( … \) and \[ … \]. Our
# renderer is remark-math, which reads $ … $ and $$ … $$ and nothing else, so
# left alone 2000+ questions would display their algebra as literal backslashes
# and parentheses. Converting on the way in keeps one convention in the database
# — the same one the authoring toolbar inserts — rather than teaching the
# renderer a second syntax that only imported rows would ever use.
_MATH_DELIMITERS = (
    (r"\[", r"\]", "$$"),
    (r"\(", r"\)", "$"),
)


def _clean(value):
    return (value or "").strip()


# An unescaped $ with no partner. The renderer will pair it with the next one it
# finds and treat everything between as a formula, so these are worth a look
# even though there is no rule that reliably fixes them.
_UNBALANCED = re.compile(r"(?<!\\)\$")


def _has_odd_dollars(text):
    return bool(text) and len(_UNBALANCED.findall(text)) % 2 == 1


# A dollar sign that means money, not math. Left alone it becomes a delimiter
# the moment the text also contains a $ from the conversion below, and
# everything between the two renders as one long formula.
_CURRENCY_WITH_SEPARATOR = re.compile(r"(?<!\\)\$(?=\d{1,3}(?:,\d{3})+)")

# Any $ the source has not already escaped. The lookbehind is the whole point:
# some legacy rows write `\( \$19 \)`, escaping the dollar correctly for LaTeX,
# and escaping it a second time yields `\\$` — a literal backslash followed by a
# delimiter, which is worse than what we started with.
_UNESCAPED_DOLLAR = re.compile(r"(?<!\\)\$")


def _escape_currency(text):
    """Escape dollar signs that are prices, before any of them become delimiters.

    Two cases, and the first is certain: when a text delimits its maths with
    \\( … \\), every bare $ in it is money — `costs $\\( 23 \\)` is twenty-three
    dollars, and converting around it would produce `costs $$23$`, an opening
    display-math delimiter followed by wreckage.

    The second is a judgement call. Texts that use $ as their own delimiter are
    genuinely mixed: `If $5(x + 1) = 25$` is maths and `contributed over
    $141,000 per employee` is not, and both start `$` then a digit. The comma is
    what separates them — a thousands separator inside a formula is not a thing
    anyone writes — so only comma-grouped numbers are escaped here. Anything
    subtler is left for a human, and the command reports how many texts still
    hold an odd number of $ so there is a list to look at.
    """
    if not text:
        return text
    if r"\(" in text or r"\[" in text:
        return _UNESCAPED_DOLLAR.sub(r"\\$", text)
    return _CURRENCY_WITH_SEPARATOR.sub(r"\\$", text)


def _normalize_math(text):
    """Rewrite \\( … \\) as $ … $ and \\[ … \\] as $$ … $$."""
    if not text:
        return text
    text = _escape_currency(text)
    for opening, closing, dollar in _MATH_DELIMITERS:
        if opening not in text:
            continue
        parts, out = text.split(opening), []
        for index, part in enumerate(parts):
            if index == 0:
                out.append(part)
                continue
            # An opening with no closing is malformed; leave it exactly as found
            # rather than swallowing the rest of the question into a math span.
            if closing in part:
                body, _, rest = part.partition(closing)
                out.append(f"{dollar}{body.strip()}{dollar}{rest}")
            else:
                out.append(f"{opening}{part}")
        text = "".join(out)
    return text


def _split_text(row):
    """Return (passage, stem).

    When the export carries both fields the first is the stimulus and the second
    is the question — `question_prompt` is never populated alone, and where both
    exist the first runs to hundreds of characters and the second to tens. When
    only one is present it IS the question, and giving it to `passage` would
    render a stimulus with nothing being asked about it.
    """
    text = _normalize_math(_clean(row.get("question_text")))
    prompt = _normalize_math(_clean(row.get("question_prompt")))
    if text and prompt:
        return text, prompt
    return "", text or prompt


class Command(BaseCommand):
    help = "Import questions exported from the legacy DSAT-mock-exam system."

    def add_arguments(self, parser):
        parser.add_argument("--bank", type=Path, help="3_question_bank.csv")
        parser.add_argument("--past-papers", type=Path, help="1_exam_questions.csv")
        parser.add_argument(
            "--taxonomy-db",
            type=Path,
            help="Legacy sqlite holding qb_domains/qb_skills. Required with --bank, "
            "whose domain and skill columns are numeric ids into it.",
        )
        parser.add_argument(
            "--created-by",
            help=(
                "Email of the admin to record as author. Question.created_by is "
                "PROTECTed and not nullable — every row needs one, and attributing "
                "an import to a real person is more honest than inventing a robot "
                "account nobody can be asked about. Defaults to the first admin."
            ),
        )
        parser.add_argument(
            "--figure-status",
            choices=["draft", "published", "skip"],
            default="draft",
            help=(
                "What to do with questions that reference a figure. The figures "
                "themselves are NOT imported, so 'published' ships a question "
                "that tells a student to read a graph which is not on the page. "
                "Default 'draft' keeps them out of the bank students see while "
                "leaving them one status change away from usable."
            ),
        )
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        self.dry_run = opts["dry_run"]
        self.figure_status = opts["figure_status"]
        if not opts["bank"] and not opts["past_papers"]:
            raise CommandError("Nothing to do — pass --bank and/or --past-papers.")

        self.author = self._resolve_author(opts.get("created_by"))

        if self.dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — nothing will be written.\n"))

        if opts["bank"]:
            if not opts["taxonomy_db"]:
                raise CommandError("--bank needs --taxonomy-db to resolve its domain/skill ids.")
            self._import_bank(opts["bank"], opts["taxonomy_db"])

        if opts["past_papers"]:
            self._import_past_papers(opts["past_papers"])

    def _resolve_author(self, email):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        if email:
            author = User.objects.filter(email__iexact=email, deleted_at__isnull=True).first()
            if not author:
                raise CommandError(f"No such user: {email}")
            return author

        author = (
            User.objects.filter(role="admin", is_active=True, deleted_at__isnull=True)
            .order_by("created_at")
            .first()
        )
        if not author:
            raise CommandError(
                "No admin to attribute the import to. Create one "
                "(manage.py createsuperuser) or pass --created-by."
            )
        self.stdout.write(f"  authored as {author.email}")
        return author

    # ─────────────────────────────────────
    # Taxonomy
    # ─────────────────────────────────────
    def _skill_lookup(self, taxonomy_db):
        """legacy skill id → our leaf QuestionCategory, matched by name."""
        if not taxonomy_db.exists():
            raise CommandError(f"No such taxonomy database: {taxonomy_db}")

        ours = {}
        for category in QuestionCategory.objects.filter(parent__isnull=False):
            ours[category.name.strip().lower()] = category
        if not ours:
            raise CommandError("No skill categories found — run seed_sat_taxonomy first.")

        connection = sqlite3.connect(f"file:{taxonomy_db}?mode=ro", uri=True)
        try:
            rows = connection.execute("SELECT id, name FROM qb_skills").fetchall()
        finally:
            connection.close()

        lookup, unmatched = {}, []
        for skill_id, name in rows:
            key = name.strip().lower()
            key = _SKILL_ALIASES.get(key, key)
            if key in ours:
                lookup[str(skill_id)] = ours[key]
            else:
                unmatched.append(name)

        if unmatched:
            self.stdout.write(
                self.style.WARNING(
                    f"  {len(unmatched)} legacy skill(s) matched nothing here: "
                    + "; ".join(unmatched[:5])
                )
            )
        return lookup

    # ─────────────────────────────────────
    # The bank
    # ─────────────────────────────────────
    def _import_bank(self, path, taxonomy_db):
        if not path.exists():
            raise CommandError(f"No such file: {path}")
        self.stdout.write(self.style.MIGRATE_HEADING(f"Bank — {path.name}"))

        skills = self._skill_lookup(taxonomy_db)
        rows = list(csv.DictReader(path.open(encoding="utf-8-sig")))

        created = updated = skipped = figures = odd = 0
        reasons = {}

        for row in rows:
            legacy_id = _clean(row.get("qb_id")) or _clean(row.get("id"))
            source_ref = f"legacy-bank-{legacy_id}"[:100]

            module = _MODULE.get(_clean(row.get("subject")))
            if not module:
                reasons["unknown subject"] = reasons.get("unknown subject", 0) + 1
                skipped += 1
                continue

            is_grid_in = _clean(row.get("question_type")) == "NUMERIC"
            answer = _clean(row.get("correct_answer"))
            if not answer:
                reasons["no correct answer"] = reasons.get("no correct answer", 0) + 1
                skipped += 1
                continue
            if not is_grid_in and answer.upper() not in ("A", "B", "C", "D"):
                # An MCQ whose key is not one of its letters cannot be graded.
                reasons["MCQ key is not A–D"] = reasons.get("MCQ key is not A–D", 0) + 1
                skipped += 1
                continue

            choices = {c: _normalize_math(_clean(row.get(f"option_{c}"))) for c in "abcd"}
            if not is_grid_in and not all(choices.values()):
                # Some of these carry the missing option as an image only; without
                # the figures there is no option to show, so the question cannot
                # be answered either way.
                reasons["MCQ missing an option"] = reasons.get("MCQ missing an option", 0) + 1
                skipped += 1
                continue

            has_figure = any(_clean(row.get(column)) for column in _IMAGE_COLUMNS)
            if has_figure:
                figures += 1
                if self.figure_status == "skip":
                    reasons["references a figure"] = reasons.get("references a figure", 0) + 1
                    skipped += 1
                    continue

            passage, stem = _split_text(row)
            if not stem:
                reasons["no question text"] = reasons.get("no question text", 0) + 1
                skipped += 1
                continue

            if _has_odd_dollars(stem) or _has_odd_dollars(passage):
                odd += 1

            status = (
                Question.Status.DRAFT
                if has_figure and self.figure_status == "draft"
                else Question.Status.PUBLISHED
            )

            fields = {
                "module": module,
                "category": skills.get(_clean(row.get("skill"))),
                "difficulty": _DIFFICULTY.get(_clean(row.get("difficulty")), 3),
                "status": status,
                "stem": stem,
                "passage": passage or None,
                "answer_type": (
                    Question.AnswerType.GRID_IN if is_grid_in else Question.AnswerType.MCQ
                ),
                "correct_answer": answer if is_grid_in else answer.upper(),
                "explanation": _normalize_math(_clean(row.get("explanation"))) or None,
                "has_math": module == Question.Module.MATH,
                "source": "imported",
                "created_by": self.author,
            }

            if self.dry_run:
                created += 1
                continue

            with transaction.atomic():
                question, was_created = Question.all_objects.update_or_create(
                    source_ref=source_ref, defaults={**fields, "deleted_at": None}
                )
                created, updated = (created + 1, updated) if was_created else (created, updated + 1)
                if not is_grid_in:
                    question.choices.all().delete()
                    QuestionChoice.objects.bulk_create(
                        QuestionChoice(
                            question=question,
                            label=letter.upper(),
                            text=choices[letter],
                            sort_order=index,
                        )
                        for index, letter in enumerate("abcd")
                    )

        self._report(len(rows), created, updated, skipped, reasons)
        if odd:
            self.stdout.write(
                self.style.WARNING(
                    f"  {odd} question(s) still hold an odd number of $ — a lone dollar "
                    "sign the escaping rules could not classify. They render fine unless "
                    "a second $ appears in the same text; worth an eyeball, not a blocker."
                )
            )
        if figures:
            note = {
                "draft": f"{figures} question(s) reference a figure — imported as DRAFT, "
                "so students never meet a question about a graph that is not there. "
                "Publish them once the figures are hosted.",
                "published": f"{figures} question(s) reference a figure that was NOT "
                "imported. They are published and will not make sense.",
                "skip": f"{figures} question(s) referenced a figure and were skipped.",
            }[self.figure_status]
            self.stdout.write(self.style.WARNING(f"  {note}"))

    def _paper_category(self, module, domain_name, skill_name):
        """Best honest home for a past-paper question.

        Question.category is PROTECTed and not nullable, and only 105 of the 1260
        past-paper rows carry a domain or skill at all. The other 1155 need
        somewhere to go, and the one thing that must not happen is inventing a
        skill for them: a Geometry question filed under Algebra is worse than an
        untagged one, because a student drilling their weak skill would be handed
        it and the analytics would count it.

        So: use what the export states when it states something, and otherwise
        say plainly that it is unclassified. It shows up as its own heading in
        the practice picker, which is the point — it is a visible list of content
        waiting to be tagged rather than 1155 quiet mislabelings.
        """
        if skill_name:
            leaf = self._paper_lookup.get((module, skill_name.strip().lower()))
            if leaf:
                return leaf
        if domain_name:
            root = self._paper_lookup.get((module, domain_name.strip().lower()))
            if root:
                return root

        key = (module, "unclassified")
        if key not in self._paper_lookup:
            category, _ = QuestionCategory.objects.get_or_create(
                module=module,
                slug=f"unclassified-{module.replace('_', '-')}",
                defaults={"name": "Unclassified", "parent": None, "sort_order": 99},
            )
            self._paper_lookup[key] = category
        return self._paper_lookup[key]

    # ─────────────────────────────────────
    # Past papers
    # ─────────────────────────────────────
    def _import_past_papers(self, path):
        if not path.exists():
            raise CommandError(f"No such file: {path}")
        self.stdout.write(self.style.MIGRATE_HEADING(f"Past papers — {path.name}"))

        # Lazy: question_bank must not depend on assessments at module scope.
        from apps.assessments.models import ExamQuestion, ExamSection, ExamTemplate

        # Past papers name their domain and skill in words rather than by id, so
        # this is a separate lookup from the bank's — keyed by module too, since
        # the two subjects have no name in common but nothing enforces that.
        self._paper_lookup = {
            (category.module, category.name.strip().lower()): category
            for category in QuestionCategory.objects.all()
        }

        rows = [
            row
            for row in csv.DictReader(path.open(encoding="utf-8-sig"))
            if _clean(row.get("source")) == "PASTPAPER"
        ]

        papers = {}
        created = skipped = 0
        reasons = {}

        for row in rows:
            container = _clean(row.get("container"))
            module = _MODULE_BY_QTYPE.get(_clean(row.get("question_type")))
            if not container or not module:
                reasons["no container or module"] = reasons.get("no container or module", 0) + 1
                skipped += 1
                continue

            passage, stem = _split_text(row)
            if not stem:
                reasons["no question text"] = reasons.get("no question text", 0) + 1
                skipped += 1
                continue

            answer = _clean(row.get("correct_answer"))
            if not answer:
                reasons["no correct answer"] = reasons.get("no correct answer", 0) + 1
                skipped += 1
                continue

            is_grid_in = _clean(row.get("is_math_input")) == "true"
            choices = {c: _normalize_math(_clean(row.get(f"option_{c}"))) for c in "abcd"}
            if not is_grid_in and not all(choices.values()):
                reasons["MCQ missing an option"] = reasons.get("MCQ missing an option", 0) + 1
                skipped += 1
                continue

            source_ref = f"legacy-paper-{_clean(row.get('id'))}"[:100]
            fields = {
                "module": module,
                "category": self._paper_category(
                    module, _clean(row.get("domain")), _clean(row.get("skill"))
                ),
                "difficulty": 3,
                "status": Question.Status.PUBLISHED,
                "stem": stem,
                "passage": passage or None,
                "answer_type": (
                    Question.AnswerType.GRID_IN if is_grid_in else Question.AnswerType.MCQ
                ),
                "correct_answer": answer if is_grid_in else answer.upper(),
                "explanation": _normalize_math(_clean(row.get("explanation"))) or None,
                "has_math": module == Question.Module.MATH,
                "source": "official",
                "source_ref": source_ref,
                "created_by": self.author,
            }

            slot = (
                int(_clean(row.get("module_order")) or 1),
                int(_clean(row.get("order")) or 0),
            )
            papers.setdefault(container, []).append((slot, module, fields, choices, is_grid_in))
            created += 1

        self.stdout.write(f"  {len(rows)} row(s) → {len(papers)} paper(s)")
        self._report(len(rows), created, 0, skipped, reasons)

        if self.dry_run:
            for name in sorted(papers)[:5]:
                self.stdout.write(f"    {name}: {len(papers[name])} question(s)")
            return

        for container, entries in sorted(papers.items()):
            entries.sort(key=lambda item: item[0])
            with transaction.atomic():
                exam, _ = ExamTemplate.all_objects.update_or_create(
                    title=container,
                    type=ExamTemplate.Type.PAST_PAPER,
                    defaults={
                        "description": "Imported from the legacy question system.",
                        "module": entries[0][1],
                        # No whole-paper limit: each module carries its own clock,
                        # and a paper-wide one would also be running during a break.
                        "time_limit": None,
                        "access_level": "public",
                        "created_by": self.author,
                        "deleted_at": None,
                    },
                )
                # Rebuilt wholesale so a re-run cannot leave a stale ordering
                # behind. Questions are matched on source_ref, so the rows the
                # sections point at survive.
                ExamSection.objects.filter(exam=exam).delete()

                sections = {}
                for (module_order, position), module, fields, choices, is_grid_in in entries:
                    section = sections.get(module_order)
                    if section is None:
                        section = ExamSection.objects.create(
                            exam=exam,
                            title=(
                                "Math" if module == Question.Module.MATH else "Reading and Writing"
                            ),
                            module=module,
                            section_number=module_order,
                            time_limit=_MODULE_MINUTES[module],
                            sort_order=module_order,
                        )
                        sections[module_order] = section

                    source_ref = fields["source_ref"]
                    question, _ = Question.all_objects.update_or_create(
                        source_ref=source_ref, defaults={**fields, "deleted_at": None}
                    )
                    if not is_grid_in:
                        question.choices.all().delete()
                        QuestionChoice.objects.bulk_create(
                            QuestionChoice(
                                question=question,
                                label=letter.upper(),
                                text=choices[letter],
                                sort_order=index,
                            )
                            for index, letter in enumerate("abcd")
                        )
                    ExamQuestion.objects.create(
                        section=section, question=question, position=position
                    )

        self.stdout.write(self.style.SUCCESS(f"  {len(papers)} past paper(s) built."))

    def _report(self, total, created, updated, skipped, reasons):
        self.stdout.write(
            f"  {total} row(s): {created} created, {updated} updated, {skipped} skipped"
        )
        for reason, count in sorted(reasons.items(), key=lambda item: -item[1]):
            self.stdout.write(f"    skipped {count:5} — {reason}")
