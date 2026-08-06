"""
DSAT LMS v2 — Admin content-studio tests
Domain: Question Bank
Covers: permission gate, question CRUD (+ MCQ/grid-in validation), draft-only edit,
        the review lifecycle (submit / approve / reject + invalid transitions),
        in-place editing at ANY status (questions are NOT versioned), reviews,
        and category/tag management (+ in-use guards).
"""

import pytest
from rest_framework.test import APIClient

from apps.identity.tests.factories import AdminUserFactory, UserFactory
from apps.question_bank.models import QuestionReview
from apps.question_bank.tests.factories import (
    CategoryFactory,
    ChoiceFactory,
    QuestionFactory,
    TagFactory,
)

pytestmark = pytest.mark.django_db

ADMIN = "/api/v1/admin/"


def admin_client():
    admin = AdminUserFactory()
    client = APIClient()
    client.force_authenticate(admin)
    client.user = admin
    return client


def mcq_payload(category, **over):
    payload = {
        "module": "math",
        "category": str(category.id),
        "difficulty": 3,
        "answer_type": "mcq",
        "stem": "What is $2+2$?",
        "correct_answer": "B",
        "choices": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "6"},
        ],
    }
    payload.update(over)
    return payload


class TestPermissions:
    def test_unauthenticated_401(self, api_client):
        assert api_client.get(ADMIN + "questions/").status_code == 401

    def test_non_admin_forbidden(self):
        teacher = UserFactory(role="teacher")
        client = APIClient()
        client.force_authenticate(teacher)
        assert client.get(ADMIN + "questions/").status_code == 403
        assert client.post(ADMIN + "questions/", {}, format="json").status_code == 403


class TestQuestionCreate:
    def test_create_mcq_draft(self):
        client = admin_client()
        cat = CategoryFactory()
        r = client.post(ADMIN + "questions/", mcq_payload(cat), format="json")
        assert r.status_code == 201
        data = r.data["data"]
        assert data["status"] == "draft"
        assert len(data["choices"]) == 4
        assert data["correct_answer"] == "B"
        assert data["created_by"]["id"] == str(client.user.id)

    def test_create_grid_in(self):
        client = admin_client()
        cat = CategoryFactory()
        r = client.post(
            ADMIN + "questions/",
            {
                "module": "math",
                "category": str(cat.id),
                "difficulty": 2,
                "answer_type": "grid_in",
                "stem": "Compute 7/2 as a decimal.",
                "correct_answer": "3.5",
            },
            format="json",
        )
        assert r.status_code == 201
        assert r.data["data"]["answer_type"] == "grid_in"
        assert r.data["data"]["choices"] == []

    def test_mcq_requires_choices(self):
        client = admin_client()
        cat = CategoryFactory()
        payload = mcq_payload(cat)
        del payload["choices"]
        r = client.post(ADMIN + "questions/", payload, format="json")
        assert r.status_code == 400
        assert "choices" in r.data["error"]["fields"]

    def test_mcq_correct_answer_must_match_a_choice(self):
        client = admin_client()
        cat = CategoryFactory()
        r = client.post(
            ADMIN + "questions/",
            mcq_payload(
                cat,
                correct_answer="D",
                choices=[{"label": "A", "text": "3"}, {"label": "B", "text": "4"}],
            ),
            format="json",
        )
        assert r.status_code == 400
        assert "correct_answer" in r.data["error"]["fields"]

    def test_grid_in_rejects_choices(self):
        client = admin_client()
        cat = CategoryFactory()
        r = client.post(
            ADMIN + "questions/",
            {
                "module": "math",
                "category": str(cat.id),
                "difficulty": 2,
                "answer_type": "grid_in",
                "stem": "x?",
                "correct_answer": "5",
                "choices": [{"label": "A", "text": "5"}],
            },
            format="json",
        )
        assert r.status_code == 400
        assert "choices" in r.data["error"]["fields"]


class TestQuestionListAndDetail:
    def test_list_all_statuses_with_filters(self):
        client = admin_client()
        QuestionFactory(status="draft", module="math")
        QuestionFactory(status="published", module="reading_writing")
        assert len(client.get(ADMIN + "questions/").data["data"]) >= 2
        drafts = client.get(ADMIN + "questions/?status=draft").data["data"]
        assert drafts and all(q["status"] == "draft" for q in drafts)
        rw = client.get(ADMIN + "questions/?module=reading_writing").data["data"]
        assert rw and all(q["module"] == "reading_writing" for q in rw)

    def test_search_by_stem(self):
        client = admin_client()
        QuestionFactory(stem="Unique parabola vertex problem")
        rows = client.get(ADMIN + "questions/?search=parabola").data["data"]
        assert len(rows) == 1

    def test_detail(self):
        client = admin_client()
        q = QuestionFactory(status="draft")
        ChoiceFactory(question=q, label="A")
        r = client.get(f"{ADMIN}questions/{q.id}/")
        assert r.status_code == 200
        assert r.data["data"]["id"] == str(q.id)

    def test_detail_404(self):
        client = admin_client()
        assert (
            client.get(f"{ADMIN}questions/00000000-0000-0000-0000-000000000000/").status_code == 404
        )


class TestQuestionUpdate:
    def test_edit_draft_in_place(self):
        client = admin_client()
        q = QuestionFactory(status="draft", stem="old")
        r = client.patch(f"{ADMIN}questions/{q.id}/", {"stem": "new stem"}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["stem"] == "new stem"

    def test_replace_choices_on_update(self):
        client = admin_client()
        q = QuestionFactory(status="draft", answer_type="mcq", correct_answer="A")
        ChoiceFactory(question=q, label="A", text="old-a")
        new_choices = [{"label": "A", "text": "new-a"}, {"label": "B", "text": "new-b"}]
        r = client.patch(f"{ADMIN}questions/{q.id}/", {"choices": new_choices}, format="json")
        assert r.status_code == 200
        assert {c["text"] for c in r.data["data"]["choices"]} == {"new-a", "new-b"}

    def test_edit_published_in_place(self):
        """No versioning — a published question is edited directly and stays published."""
        client = admin_client()
        q = QuestionFactory(status="published", stem="old")
        r = client.patch(f"{ADMIN}questions/{q.id}/", {"stem": "new stem"}, format="json")
        assert r.status_code == 200
        assert r.data["data"]["stem"] == "new stem"
        assert r.data["data"]["status"] == "published"
        q.refresh_from_db()
        assert q.stem == "new stem"

    def test_edit_published_answer_key_in_place(self):
        """The correct answer can be corrected without cloning the question."""
        client = admin_client()
        q = QuestionFactory(status="published", answer_type="mcq", correct_answer="A")
        for label in ("A", "B", "C", "D"):
            ChoiceFactory(question=q, label=label, text=label.lower())
        r = client.patch(f"{ADMIN}questions/{q.id}/", {"correct_answer": "C"}, format="json")
        assert r.status_code == 200
        q.refresh_from_db()
        assert q.correct_answer == "C"

    def test_edit_archived_in_place(self):
        client = admin_client()
        q = QuestionFactory(status="archived", stem="old")
        assert (
            client.patch(f"{ADMIN}questions/{q.id}/", {"stem": "new"}, format="json").status_code
            == 200
        )

    def test_soft_delete(self):
        client = admin_client()
        q = QuestionFactory(status="draft")
        assert client.delete(f"{ADMIN}questions/{q.id}/").status_code == 204
        q.refresh_from_db()
        assert q.deleted_at is not None


class TestLifecycle:
    def test_submit_approve_flow(self):
        client = admin_client()
        q = QuestionFactory(status="draft")
        assert client.post(f"{ADMIN}questions/{q.id}/submit-for-review/").status_code == 200
        q.refresh_from_db()
        assert q.status == "review"
        r = client.post(f"{ADMIN}questions/{q.id}/approve/")
        assert r.status_code == 200
        q.refresh_from_db()
        assert q.status == "published"
        assert q.published_at is not None
        assert q.reviewed_by_id == client.user.id
        assert QuestionReview.objects.filter(question=q, status="approved").count() == 1

    def test_reject_records_note(self):
        client = admin_client()
        q = QuestionFactory(status="review")
        r = client.post(
            f"{ADMIN}questions/{q.id}/reject/", {"note": "Fix the stem."}, format="json"
        )
        assert r.status_code == 200
        q.refresh_from_db()
        assert q.status == "draft"
        review = QuestionReview.objects.get(question=q, status="rejected")
        assert review.note == "Fix the stem."

    def test_reject_requires_note(self):
        client = admin_client()
        q = QuestionFactory(status="review")
        r = client.post(f"{ADMIN}questions/{q.id}/reject/", {}, format="json")
        assert r.status_code == 400
        assert "note" in r.data["error"]["fields"]

    def test_cannot_approve_draft(self):
        client = admin_client()
        q = QuestionFactory(status="draft")
        r = client.post(f"{ADMIN}questions/{q.id}/approve/")
        assert r.status_code == 400
        q.refresh_from_db()
        assert q.status == "draft"

    def test_cannot_submit_published(self):
        client = admin_client()
        q = QuestionFactory(status="published")
        assert client.post(f"{ADMIN}questions/{q.id}/submit-for-review/").status_code == 400


class TestNoVersioning:
    """Versioning was removed — the endpoints are gone and edits are live."""

    def test_new_version_endpoint_is_gone(self):
        client = admin_client()
        q = QuestionFactory(status="published")
        assert client.post(f"{ADMIN}questions/{q.id}/new-version/").status_code == 404

    def test_revisions_endpoint_is_gone(self):
        client = admin_client()
        q = QuestionFactory(status="published")
        assert client.get(f"{ADMIN}questions/{q.id}/revisions/").status_code == 404

    def test_approving_does_not_archive_anything(self):
        client = admin_client()
        published = QuestionFactory(status="published")
        other = QuestionFactory(status="review")
        client.post(f"{ADMIN}questions/{other.id}/approve/")
        published.refresh_from_db()
        other.refresh_from_db()
        assert published.status == "published"
        assert other.status == "published"


class TestReviewHistory:
    def test_reviews_history(self):
        client = admin_client()
        q = QuestionFactory(status="review")
        client.post(f"{ADMIN}questions/{q.id}/reject/", {"note": "n1"}, format="json")
        rows = client.get(f"{ADMIN}questions/{q.id}/reviews/").data["data"]
        assert len(rows) == 1
        assert rows[0]["status"] == "rejected"
        assert rows[0]["reviewer"]["id"] == str(client.user.id)


class TestCategories:
    def test_crud(self):
        client = admin_client()
        r = client.post(
            ADMIN + "categories/",
            {"module": "math", "name": "Algebra", "slug": "algebra"},
            format="json",
        )
        assert r.status_code == 201
        cat_id = r.data["data"]["id"]
        assert any(c["slug"] == "algebra" for c in client.get(ADMIN + "categories/").data["data"])
        r = client.patch(f"{ADMIN}categories/{cat_id}/", {"name": "Algebra I"}, format="json")
        assert r.data["data"]["name"] == "Algebra I"
        assert client.delete(f"{ADMIN}categories/{cat_id}/").status_code == 204

    def test_cannot_delete_category_in_use(self):
        client = admin_client()
        cat = CategoryFactory()
        QuestionFactory(category=cat)
        assert client.delete(f"{ADMIN}categories/{cat.id}/").status_code == 400

    def test_filter_by_module(self):
        client = admin_client()
        CategoryFactory(module="math", slug="m1")
        CategoryFactory(module="reading_writing", slug="rw1")
        rows = client.get(ADMIN + "categories/?module=reading_writing").data["data"]
        assert rows and all(c["module"] == "reading_writing" for c in rows)


class TestTags:
    def test_crud(self):
        client = admin_client()
        r = client.post(ADMIN + "tags/", {"name": "Parabolas", "slug": "parabolas"}, format="json")
        assert r.status_code == 201
        tag_id = r.data["data"]["id"]
        assert (
            client.patch(f"{ADMIN}tags/{tag_id}/", {"color": "#4F46E5"}, format="json").data[
                "data"
            ]["color"]
            == "#4F46E5"
        )
        assert client.delete(f"{ADMIN}tags/{tag_id}/").status_code == 204

    def test_cannot_delete_tag_in_use(self):
        client = admin_client()
        tag = TagFactory()
        q = QuestionFactory()
        q.tags.add(tag)
        assert client.delete(f"{ADMIN}tags/{tag.id}/").status_code == 400
