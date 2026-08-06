"""
DSAT LMS v2 — Question search tests
Domain: Question Bank
Covers: the behaviour both backends must share (find by a word in the stem, in
        the passage, in the source ref; ignore an empty term), that the student
        bank and the admin studio search the SAME fields, and that the
        Postgres-only prefix query is only ever built from a safe term.

The backend-specific paths are asserted at the predicate level rather than over
HTTP, because CI runs SQLite: `_postgres_query` can be inspected anywhere, while
the tsvector match itself only exists where there is a tsvector.
"""

import pytest
from rest_framework.test import APIClient

from apps.identity.tests.factories import AdminUserFactory
from apps.question_bank.models import Question
from apps.question_bank.search import query_plan, search_questions
from apps.question_bank.tests.factories import QuestionFactory

pytestmark = pytest.mark.django_db

BANK = "/api/v1/questions/"
STUDIO = "/api/v1/admin/questions/"


def ids(response):
    return {row["id"] for row in response.data["data"]}


@pytest.fixture
def admin_client():
    client = APIClient()
    client.force_authenticate(AdminUserFactory())
    return client


@pytest.fixture
def corpus():
    return {
        "stem": QuestionFactory(
            status=Question.Status.PUBLISHED, stem="Solve the quadratic equation for x."
        ),
        "passage": QuestionFactory(
            status=Question.Status.PUBLISHED,
            stem="Which choice is best?",
            passage="The naturalist described a photosynthesis experiment.",
        ),
        "source": QuestionFactory(
            status=Question.Status.PUBLISHED,
            stem="Nothing notable here.",
            source_ref="SAT-2024-05-Q12",
        ),
    }


class TestItFindsTheRightRows:
    def test_a_word_in_the_stem(self, corpus):
        found = search_questions(Question.objects.all(), "quadratic")
        assert set(found) == {corpus["stem"]}

    def test_a_word_in_the_passage(self, corpus):
        found = search_questions(Question.objects.all(), "photosynthesis")
        assert set(found) == {corpus["passage"]}

    def test_a_source_reference(self, corpus):
        found = search_questions(Question.objects.all(), "SAT-2024-05-Q12")
        assert corpus["source"] in set(found)

    def test_an_empty_term_narrows_nothing(self, corpus):
        base = Question.objects.all()
        assert set(search_questions(base, "")) == set(base)
        assert set(search_questions(base, "   ")) == set(base)
        assert set(search_questions(base, None)) == set(base)


class TestBothSurfacesAgree:
    """The studio and the bank used to hold two copies of the predicate. A term
    that finds a question in one must find it in the other."""

    def test_the_bank_and_the_studio_return_the_same_question(
        self, auth_client, admin_client, corpus
    ):
        target = str(corpus["passage"].id)
        assert target in ids(auth_client.get(f"{BANK}?search=photosynthesis"))
        assert target in ids(admin_client.get(f"{STUDIO}?search=photosynthesis"))

    def test_a_term_that_matches_nothing_returns_nothing(self, auth_client, admin_client):
        assert ids(auth_client.get(f"{BANK}?search=zzzznotathing")) == set()
        assert ids(admin_client.get(f"{STUDIO}?search=zzzznotathing")) == set()

    def test_search_still_composes_with_the_other_filters(self, auth_client, corpus):
        """Search narrows the filtered set — it does not replace it."""
        response = auth_client.get(f"{BANK}?search=quadratic&module=reading_writing")
        assert ids(response) == set()


class TestThePostgresQueryPlan:
    """tsquery has syntax of its own; a term is only ever interpolated raw when it
    is known to be one plain word. Everything else goes through websearch, which
    parses the term as data."""

    def test_a_single_word_becomes_a_prefix_query(self):
        assert query_plan("algeb") == ("algeb:*", "raw")

    def test_a_phrase_goes_through_websearch(self):
        assert query_plan("quadratic equation") == ("quadratic equation", "websearch")

    @pytest.mark.parametrize(
        "term",
        ["drop:*|table", "a & b", "!negated", "(paren)", "SAT-2024", "quotes'here", "a:*"],
    )
    def test_anything_with_tsquery_syntax_is_never_raw(self, term):
        value, search_type = query_plan(term)
        assert search_type == "websearch"
        assert value == term  # handed over untouched, for Postgres to parse as data
