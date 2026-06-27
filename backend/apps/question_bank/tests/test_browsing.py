"""
DSAT LMS v2 — Question bank browsing tests
Domain: Question Bank
Covers: auth gate, published-only listing, filters, search, pagination,
        detail (study view), 404 for drafts, categories/tags lists.
"""

import pytest

from apps.question_bank.models import Question
from apps.question_bank.tests.factories import (
    CategoryFactory,
    ChoiceFactory,
    QuestionFactory,
    TagFactory,
)

pytestmark = pytest.mark.django_db

LIST = "/api/v1/questions/"
CATS = "/api/v1/questions/categories/"
TAGS = "/api/v1/questions/tags/"


class TestQuestionList:
    def test_requires_auth(self, api_client):
        assert api_client.get(LIST).status_code == 401

    def test_returns_only_published(self, auth_client):
        QuestionFactory(status=Question.Status.PUBLISHED, stem="Published one")
        QuestionFactory(status=Question.Status.DRAFT, stem="Draft hidden")
        r = auth_client.get(LIST)
        assert r.status_code == 200
        assert r.data["success"] is True
        stems = [q["stem"] for q in r.data["data"]]
        assert "Published one" in stems
        assert "Draft hidden" not in stems

    def test_list_item_is_lightweight(self, auth_client):
        QuestionFactory()
        item = auth_client.get(LIST).data["data"][0]
        assert "choices" not in item
        assert "correct_answer" not in item
        assert {"id", "module", "category", "difficulty", "stem", "tags"} <= set(item)

    def test_filter_module(self, auth_client):
        QuestionFactory(module="math")
        QuestionFactory(module="reading_writing")
        data = auth_client.get(LIST + "?module=reading_writing").data["data"]
        assert len(data) == 1
        assert data[0]["module"] == "reading_writing"

    def test_filter_difficulty_range(self, auth_client):
        for d in (1, 3, 5):
            QuestionFactory(difficulty=d)
        data = auth_client.get(LIST + "?difficulty_min=3").data["data"]
        assert sorted(q["difficulty"] for q in data) == [3, 5]

    def test_search(self, auth_client):
        QuestionFactory(stem="Quadratic equations are fun")
        QuestionFactory(stem="Reading comprehension passage")
        data = auth_client.get(LIST + "?search=Quadratic").data["data"]
        assert len(data) == 1

    def test_tag_filter(self, auth_client):
        tag = TagFactory(slug="algebra")
        QuestionFactory().tags.add(tag)
        QuestionFactory()
        data = auth_client.get(LIST + "?tag=algebra").data["data"]
        assert len(data) == 1

    def test_cursor_pagination(self, auth_client):
        QuestionFactory.create_batch(3)
        r = auth_client.get(LIST + "?page_size=2")
        assert len(r.data["data"]) == 2
        assert r.data["meta"]["pagination"]["next"]


class TestQuestionDetail:
    def test_published_detail_has_choices_and_answer(self, auth_client):
        q = QuestionFactory(status=Question.Status.PUBLISHED, correct_answer="B")
        ChoiceFactory(question=q, label="A", text="one")
        ChoiceFactory(question=q, label="B", text="two")
        r = auth_client.get(f"/api/v1/questions/{q.id}/")
        assert r.status_code == 200
        d = r.data["data"]
        assert d["correct_answer"] == "B"
        assert len(d["choices"]) == 2

    def test_draft_returns_404(self, auth_client):
        q = QuestionFactory(status=Question.Status.DRAFT)
        r = auth_client.get(f"/api/v1/questions/{q.id}/")
        assert r.status_code == 404
        assert r.data["error"]["code"] == "NOT_FOUND"


class TestCategoriesAndTags:
    def test_categories_list(self, auth_client):
        CategoryFactory(name="Algebra")
        r = auth_client.get(CATS)
        assert r.status_code == 200
        assert r.data["success"] is True
        assert any(c["name"] == "Algebra" for c in r.data["data"])

    def test_tags_list(self, auth_client):
        TagFactory(slug="geometry")
        r = auth_client.get(TAGS)
        assert r.status_code == 200
        assert any(t["slug"] == "geometry" for t in r.data["data"])
