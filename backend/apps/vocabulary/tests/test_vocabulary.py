"""
DSAT LMS v2 — Vocabulary tests
Domain: Vocabulary
Covers: what a student may see (published only, own progress only), how mastery
        moves, and the authoring path — including the paste import, which is how
        a six-hundred-word list actually gets in.
"""

import pytest
from rest_framework.test import APIClient

from apps.identity.tests.factories import UserFactory
from apps.vocabulary.models import (
    VocabSection,
    VocabSet,
    VocabStudySession,
    VocabWord,
    VocabWordProgress,
)
from apps.vocabulary.services import WordListError, import_words, parse_word_list

pytestmark = pytest.mark.django_db

VOCAB = "/api/v1/vocabulary/"
ADMIN = "/api/v1/admin/vocabulary/"


@pytest.fixture
def published():
    section = VocabSection.objects.create(
        title="SAT Essential", slug="sat-essential", status=VocabSection.Status.PUBLISHED
    )
    deck = VocabSet.objects.create(section=section, title="Set 1", sort_order=1)
    words = [
        VocabWord.objects.create(vocab_set=deck, word=w, definition=f"meaning of {w}", sort_order=i)
        for i, w in enumerate(["abate", "candid", "eclectic"], start=1)
    ]
    return {"section": section, "set": deck, "words": words}


@pytest.fixture
def admin_client():
    client = APIClient()
    user = UserFactory(role="admin", is_staff=True)
    client.force_authenticate(user)
    client.user = user
    return client


class TestBrowsing:
    def test_lists_published_sections_with_counts(self, auth_client, published):
        r = auth_client.get(f"{VOCAB}sections/")
        assert r.status_code == 200
        row = r.data["data"][0]
        assert row["title"] == "SAT Essential"
        assert row["set_count"] == 1
        assert row["word_count"] == 3
        assert row["mastered_count"] == 0

    def test_a_draft_list_is_invisible(self, auth_client, published):
        published["section"].status = VocabSection.Status.DRAFT
        published["section"].save()
        assert r_data(auth_client.get(f"{VOCAB}sections/")) == []
        assert auth_client.get(f"{VOCAB}sections/{published['section'].id}/").status_code == 404

    def test_set_detail_carries_every_card(self, auth_client, published):
        r = auth_client.get(f"{VOCAB}sets/{published['set'].id}/")
        assert r.status_code == 200
        assert [w["word"] for w in r.data["data"]["words"]] == ["abate", "candid", "eclectic"]
        assert {w["my_status"] for w in r.data["data"]["words"]} == {"new"}

    def test_a_set_in_a_draft_list_is_not_reachable(self, auth_client, published):
        published["section"].status = VocabSection.Status.DRAFT
        published["section"].save()
        assert auth_client.get(f"{VOCAB}sets/{published['set'].id}/").status_code == 404


def r_data(response):
    return response.data["data"]


class TestFlashcards:
    def _run(self, client, deck):
        r = client.post(f"{VOCAB}sessions/", {"vocab_set": str(deck.id)}, format="json")
        assert r.status_code == 201
        return r.data["data"]["id"]

    def test_a_verdict_moves_the_word_to_learning(self, auth_client, published):
        session = self._run(auth_client, published["set"])
        word = published["words"][0]
        r = auth_client.post(
            f"{VOCAB}sessions/{session}/report/",
            {"results": [{"word": str(word.id), "correct": True}]},
            format="json",
        )
        assert r.status_code == 200
        assert r.data["data"]["correct_count"] == 1
        progress = VocabWordProgress.objects.get(user=auth_client.user, word=word)
        assert progress.status == "learning"
        assert progress.streak == 1

    def test_three_in_a_row_masters_it(self, auth_client, published):
        session = self._run(auth_client, published["set"])
        word = published["words"][0]
        for _ in range(3):
            auth_client.post(
                f"{VOCAB}sessions/{session}/report/",
                {"results": [{"word": str(word.id), "correct": True}]},
                format="json",
            )
        assert VocabWordProgress.objects.get(user=auth_client.user, word=word).status == "mastered"

    def test_one_miss_demotes_a_mastered_word(self, auth_client, published):
        word = published["words"][0]
        VocabWordProgress.objects.create(
            user=auth_client.user, word=word, status="mastered", streak=5, correct_count=5
        )
        session = self._run(auth_client, published["set"])
        auth_client.post(
            f"{VOCAB}sessions/{session}/report/",
            {"results": [{"word": str(word.id), "correct": False}]},
            format="json",
        )
        progress = VocabWordProgress.objects.get(user=auth_client.user, word=word)
        assert progress.status == "learning"
        assert progress.streak == 0

    def test_counts_accumulate_across_batches(self, auth_client, published):
        session = self._run(auth_client, published["set"])
        for word in published["words"][:2]:
            auth_client.post(
                f"{VOCAB}sessions/{session}/report/",
                {"results": [{"word": str(word.id), "correct": True}]},
                format="json",
            )
        row = VocabStudySession.objects.get(pk=session)
        assert (row.correct_count, row.total_count) == (2, 2)

    def test_reporting_does_not_complete_the_set(self, auth_client, published):
        session = self._run(auth_client, published["set"])
        auth_client.post(
            f"{VOCAB}sessions/{session}/report/",
            {"results": [{"word": str(published["words"][0].id), "correct": True}]},
            format="json",
        )
        assert VocabStudySession.objects.get(pk=session).completed_at is None

        auth_client.post(f"{VOCAB}sessions/{session}/finish/")
        assert VocabStudySession.objects.get(pk=session).completed_at is not None

    def test_another_students_session_is_not_mine(self, auth_client, published):
        theirs = VocabStudySession.objects.create(
            user=UserFactory(role="student"), vocab_set=published["set"]
        )
        r = auth_client.post(
            f"{VOCAB}sessions/{theirs.id}/report/",
            {"results": [{"word": str(published["words"][0].id), "correct": True}]},
            format="json",
        )
        assert r.status_code == 404

    def test_progress_is_per_student(self, auth_client, published):
        other = UserFactory(role="student")
        VocabWordProgress.objects.create(
            user=other, word=published["words"][0], status="mastered", streak=3
        )
        r = auth_client.get(f"{VOCAB}sets/{published['set'].id}/")
        assert {w["my_status"] for w in r.data["data"]["words"]} == {"new"}
        assert r.data["data"]["mastered_count"] == 0


class TestImport:
    def test_reads_the_three_separators(self):
        parsed = parse_word_list(
            "abate\tto lessen\ncandid; frank\neclectic - drawn from many sources"
        )
        assert [p["word"] for p in parsed] == ["abate", "candid", "eclectic"]
        assert parsed[1]["definition"] == "frank"

    def test_keeps_a_third_column_as_the_example(self):
        parsed = parse_word_list("abate; to lessen; The storm abated.")
        assert parsed[0]["example"] == "The storm abated."

    def test_refuses_a_line_with_no_definition(self):
        with pytest.raises(WordListError):
            parse_word_list("abate\ncandid; frank")

    def test_a_repeated_word_updates_rather_than_duplicates(self, published):
        deck = published["set"]
        created = import_words(deck, "abate; a corrected meaning\nnovel; new and original")
        assert created == 1
        deck.refresh_from_db()
        assert deck.words.count() == 4
        assert deck.words.get(word="abate").definition == "a corrected meaning"


class TestAuthoring:
    def test_a_student_cannot_author(self, auth_client):
        assert auth_client.get(f"{ADMIN}sections/").status_code == 403
        assert auth_client.post(f"{ADMIN}sections/", {"title": "Mine"}).status_code == 403

    def test_creating_a_section_invents_the_slug(self, admin_client):
        r = admin_client.post(f"{ADMIN}sections/", {"title": "650 Hard Words"}, format="json")
        assert r.status_code == 201
        assert r.data["data"]["slug"] == "650-hard-words"
        assert r.data["data"]["status"] == "draft"

    def test_two_sections_with_one_title_get_distinct_slugs(self, admin_client):
        admin_client.post(f"{ADMIN}sections/", {"title": "Hard Words"}, format="json")
        second = admin_client.post(f"{ADMIN}sections/", {"title": "Hard Words"}, format="json")
        assert second.data["data"]["slug"] == "hard-words-2"

    def test_the_authoring_path_end_to_end(self, admin_client):
        section = admin_client.post(
            f"{ADMIN}sections/", {"title": "College Panda"}, format="json"
        ).data["data"]
        deck = admin_client.post(
            f"{ADMIN}sections/{section['id']}/sets/", {"title": "Set 1"}, format="json"
        ).data["data"]

        imported = admin_client.post(
            f"{ADMIN}sets/{deck['id']}/import/",
            {"text": "abate; to lessen\ncandid; frank"},
            format="json",
        )
        assert imported.data["data"]["created"] == 2

        words = admin_client.get(f"{ADMIN}sets/{deck['id']}/words/").data["data"]
        assert [w["word"] for w in words] == ["abate", "candid"]

        edited = admin_client.patch(
            f"{ADMIN}words/{words[0]['id']}/", {"definition": "to subside"}, format="json"
        )
        assert edited.data["data"]["definition"] == "to subside"

        published = admin_client.patch(
            f"{ADMIN}sections/{section['id']}/", {"status": "published"}, format="json"
        )
        assert published.data["data"]["status"] == "published"
        assert published.data["data"]["word_count"] == 2

    def test_a_bad_paste_is_a_400_not_a_500(self, admin_client):
        section = admin_client.post(f"{ADMIN}sections/", {"title": "X"}, format="json").data["data"]
        deck = admin_client.post(
            f"{ADMIN}sections/{section['id']}/sets/", {"title": "Set 1"}, format="json"
        ).data["data"]
        r = admin_client.post(f"{ADMIN}sets/{deck['id']}/import/", {"text": "abate"}, format="json")
        assert r.status_code == 400
        assert r.data["error"]["code"] == "VALIDATION_ERROR"

    def test_deleting_is_soft(self, admin_client, published):
        r = admin_client.delete(f"{ADMIN}sections/{published['section'].id}/")
        assert r.status_code == 204
        assert not VocabSection.objects.filter(pk=published["section"].id).exists()
        assert VocabSection.all_objects.filter(pk=published["section"].id).exists()
