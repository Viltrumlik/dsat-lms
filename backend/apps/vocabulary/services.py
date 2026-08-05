"""
DSAT LMS v2 — Vocabulary services
Domain: Vocabulary
Description: Progress folding and the bulk word import, kept out of the views
    because both are reachable from more than one place.
"""

from django.db import transaction
from django.db.models import Max

from .models import VocabWord, VocabWordProgress


class WordListError(ValueError):
    """A pasted word list that could not be read."""


@transaction.atomic
def record_results(user, results):
    """Fold a batch of flashcard verdicts into per-word progress.

    Returns (correct, total) actually applied. A word that is not in the set the
    session is running over is ignored rather than rejected: the runner reports
    what it showed, and a set edited mid-run would otherwise fail the whole batch.
    """
    if not results:
        return 0, 0

    word_ids = {r["word"] for r in results}
    known = set(VocabWord.objects.filter(id__in=word_ids).values_list("id", flat=True))
    rows = {
        p.word_id: p
        for p in VocabWordProgress.objects.select_for_update().filter(user=user, word_id__in=known)
    }

    correct = total = 0
    for result in results:
        word_id = result["word"]
        if word_id not in known:
            continue
        row = rows.get(word_id)
        if row is None:
            row = VocabWordProgress(user=user, word_id=word_id)
            rows[word_id] = row
        row.record(correct=result["correct"])
        total += 1
        correct += 1 if result["correct"] else 0

    for row in rows.values():
        row.save()
    return correct, total


def parse_word_list(text):
    """Read a pasted word list into dicts.

    One word per line, ``word`` and ``definition`` separated by a tab, a
    semicolon, or " - ". Authoring a 650-word list twenty-five rows at a time
    through a form is the kind of work nobody finishes, so paste is the primary
    path and the per-word editor is for corrections.

        laconic<TAB>using very few words
        laconic; using very few words
        laconic - using very few words

    A third column, if present, is the example sentence.
    """
    parsed = []
    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        parts = _split(line)
        if len(parts) < 2 or not parts[0] or not parts[1]:
            raise WordListError(f"Line {number} has no definition: {line[:60]}")
        parsed.append(
            {
                "word": parts[0][:120],
                "definition": parts[1],
                "example": parts[2] if len(parts) > 2 else "",
            }
        )
    if not parsed:
        raise WordListError("Nothing to import.")
    return parsed


def _split(line):
    for separator in ("\t", ";", " - ", " — ", "|"):
        if separator in line:
            return [part.strip() for part in line.split(separator, 2)]
    return [line]


@transaction.atomic
def import_words(vocab_set, text):
    """Append a pasted list to a set. Returns the number of words created.

    Re-importing a word that is already in the set UPDATES it rather than adding
    a duplicate — a corrected paste is the normal way an author fixes a typo in
    a list of six hundred.
    """
    parsed = parse_word_list(text)
    existing = {w.word.lower(): w for w in vocab_set.words.all()}
    next_order = vocab_set.words.aggregate(top=Max("sort_order"))["top"] or 0

    created = 0
    for entry in parsed:
        current = existing.get(entry["word"].lower())
        if current is not None:
            current.definition = entry["definition"]
            if entry["example"]:
                current.example = entry["example"]
            current.save(update_fields=["definition", "example", "updated_at"])
            continue
        next_order += 1
        VocabWord.objects.create(
            vocab_set=vocab_set,
            word=entry["word"],
            definition=entry["definition"],
            example=entry["example"],
            sort_order=next_order,
        )
        created += 1
    return created
