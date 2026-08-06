"""
DSAT LMS v2 — Question search
Domain: Question Bank
Description: One search predicate, shared by the student bank and the admin studio.

It used to be `icontains` on both surfaces: `LIKE '%term%'` over `stem` and
`passage`, which no index can serve, so every search read every published row.
Fine at a thousand questions and a table scan per keystroke at a hundred thousand
— and a hundred thousand is the number the architecture notes were written for.

Postgres now matches against a GIN-indexed `tsvector` (see Question.Meta.indexes;
the index and the query build their vector from `question_search_vector()`, so
they cannot drift apart into an index the planner declines to use). SQLite — dev
and CI — keeps the LIKE scan, which is correct, just unindexed, and the row
counts there are tiny.

A single word is matched as a PREFIX (`algeb:*` finds "algebra"), because that is
what someone typing into a search box expects. Two or more words go through
`websearch`, so quotes and `-exclusions` work the way they do everywhere else.
The one thing plain FTS gives up against LIKE is matching inside a word —
"gebra" no longer finds "algebra". That is the trade for not scanning the table.
"""

import re

from django.contrib.postgres.search import SearchQuery, SearchVector
from django.db import connection
from django.db.models import Q

SEARCH_CONFIG = "english"

# Every field a search covers, in one place. Adding one here without also
# rebuilding the index just makes that field unsearchable on Postgres.
SEARCH_FIELDS = ("stem", "passage", "source_ref")

# tsquery has its own syntax (&, |, !, :, parentheses). Anything that isn't a
# word character would either change the meaning of a raw query or make Postgres
# raise, so a prefix search is only attempted on a term that is purely one word.
_SINGLE_WORD = re.compile(r"^\w+$", re.UNICODE)


def question_search_vector():
    """The tsvector the index stores and the query matches — one definition.

    Returns a fresh expression each call: Django expressions carry per-query
    state, so a shared module-level instance is a bug waiting for a second
    caller.

    Bare field names, no explicit COALESCE. SearchVector already wraps each
    field in `COALESCE(field, '')` — a NULL `passage` would otherwise make the
    whole concatenated vector NULL — so adding our own only doubled it, and it
    doubled it in a way that could not survive `makemigrations --check`: an
    explicit Coalesce across a TextField and a CharField needs `output_field`,
    `output_field` needs a `TextField()` instance, and Django compares field
    instances by creation counter. A new instance every call meant the
    autodetector saw the index change on every run, forever.
    """
    return SearchVector(*SEARCH_FIELDS, config=SEARCH_CONFIG)


def query_plan(term: str) -> tuple[str, str]:
    """Decide what to hand tsquery, and how it should be parsed.

    Split out from building the SearchQuery so the decision — the part that
    matters, because getting it wrong means either a syntax error from Postgres
    or a term interpreted as operators — is a pure function that can be asserted
    on directly.
    """
    if _SINGLE_WORD.match(term):
        # Type-ahead: match the start of a word. Safe as RAW tsquery precisely
        # because the term is known to hold nothing but word characters.
        return f"{term}:*", "raw"
    # Anything else is parsed as data, never as syntax.
    return term, "websearch"


def _postgres_query(term: str) -> SearchQuery:
    value, search_type = query_plan(term)
    return SearchQuery(value, config=SEARCH_CONFIG, search_type=search_type)


def search_questions(queryset, term):
    """Narrow `queryset` to questions matching `term`. Empty term → unchanged."""
    term = (term or "").strip()
    if not term:
        return queryset

    if connection.vendor == "postgresql":
        return queryset.annotate(_search=question_search_vector()).filter(
            _search=_postgres_query(term)
        )

    predicate = Q()
    for field in SEARCH_FIELDS:
        predicate |= Q(**{f"{field}__icontains": term})
    return queryset.filter(predicate)
