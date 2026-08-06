"""
DSAT LMS v2 — Taxonomy cache tests
Domain: Question Bank
Covers: the two ways a cache goes wrong — serving a stale tree after an edit,
        and taking the app down with it when Redis does. Plus the filter-key
        separation, which is the mistake that would serve a "math only" tree to
        someone asking for everything.
"""

from unittest import mock

import pytest
from django.core.cache import cache as django_cache

from apps.question_bank import cache as taxonomy_cache
from apps.question_bank.models import QuestionCategory, QuestionTag

pytestmark = pytest.mark.django_db

CATEGORIES = "/api/v1/questions/categories/"
TAGS = "/api/v1/questions/tags/"


@pytest.fixture(autouse=True)
def clean_cache():
    django_cache.clear()
    yield
    django_cache.clear()


def names(response):
    return {row["name"] for row in response.data["data"]}


class TestItCaches:
    def test_a_second_read_does_not_read_the_table(self, auth_client):
        """The property that matters, stated directly: the second request does
        not go near question_categories. Asserting a total query count would
        also be measuring the auth lookup and the request's savepoint."""
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        QuestionCategory.objects.create(module="math", name="Algebra", slug="alg")
        auth_client.get(CATEGORIES)  # warm

        with CaptureQueriesContext(connection) as ctx:
            auth_client.get(CATEGORIES)
        assert not any("question_categories" in q["sql"] for q in ctx.captured_queries)


class TestItInvalidates:
    def test_a_new_category_appears_immediately(self, auth_client):
        QuestionCategory.objects.create(module="math", name="Algebra", slug="alg")
        assert names(auth_client.get(CATEGORIES)) == {"Algebra"}

        QuestionCategory.objects.create(module="math", name="Geometry", slug="geo")
        assert names(auth_client.get(CATEGORIES)) == {"Algebra", "Geometry"}

    def test_a_rename_appears_immediately(self, auth_client):
        category = QuestionCategory.objects.create(module="math", name="Algbera", slug="alg")
        auth_client.get(CATEGORIES)

        category.name = "Algebra"
        category.save()
        assert names(auth_client.get(CATEGORIES)) == {"Algebra"}

    def test_a_soft_delete_appears_immediately(self, auth_client):
        category = QuestionCategory.objects.create(module="math", name="Algebra", slug="alg")
        auth_client.get(CATEGORIES)

        category.soft_delete()
        assert names(auth_client.get(CATEGORIES)) == set()

    def test_tags_invalidate_too(self, auth_client):
        QuestionTag.objects.create(name="Hard", slug="hard")
        assert names(auth_client.get(TAGS)) == {"Hard"}
        QuestionTag.objects.create(name="Tricky", slug="tricky")
        assert names(auth_client.get(TAGS)) == {"Hard", "Tricky"}


class TestFilterKeys:
    def test_a_filtered_tree_is_not_served_to_an_unfiltered_request(self, auth_client):
        QuestionCategory.objects.create(module="math", name="Algebra", slug="alg")
        QuestionCategory.objects.create(module="reading_writing", name="Transitions", slug="tr")

        assert names(auth_client.get(f"{CATEGORIES}?module=math")) == {"Algebra"}
        # The unfiltered request must not get the cached math-only answer.
        assert names(auth_client.get(CATEGORIES)) == {"Algebra", "Transitions"}


class TestItFailsOpen:
    def test_a_dead_cache_still_serves_the_tree(self, auth_client):
        """Slower is not broken. Redis being down must not take the bank down."""
        QuestionCategory.objects.create(module="math", name="Algebra", slug="alg")
        with mock.patch.object(
            taxonomy_cache, "cache", **{"get.side_effect": OSError("redis is gone")}
        ):
            response = auth_client.get(CATEGORIES)
        assert response.status_code == 200
        assert names(response) == {"Algebra"}
