"""
DSAT LMS v2 — Full mock exam tests
Domain: Assessments
Covers: the shape a four-module mock has to have for the runner to work — the
        break riding on the module it follows, full screen being published, and
        the thing that makes a break FREE: per-module clocks with no whole-paper
        clock above them, so resting never costs exam time.
"""

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.assessments.models import ExamSection, ExamTemplate
from apps.assessments.tests.factories import (
    ExamQuestionFactory,
    ExamSectionFactory,
    ExamTemplateFactory,
)
from apps.identity.tests.factories import UserFactory
from apps.question_bank.models import Question
from apps.question_bank.tests.factories import QuestionFactory

pytestmark = pytest.mark.django_db

SESSIONS = "/api/v1/sessions/"


def mock_exam():
    """Math 1 → Math 2 → 10-min break → English 1 → English 2."""
    exam = ExamTemplateFactory(
        type=ExamTemplate.Type.MOCK,
        access_level="public",
        time_limit=None,
        allow_pause=False,
        requires_fullscreen=True,
    )
    plan = [
        ("math", 35, None),
        ("math", 35, 10),
        ("reading_writing", 32, None),
        ("reading_writing", 32, None),
    ]
    for number, (module, minutes, break_after) in enumerate(plan, start=1):
        section = ExamSectionFactory(
            exam=exam,
            section_number=number,
            module=module,
            time_limit=minutes,
            break_after_minutes=break_after,
        )
        ExamQuestionFactory(
            section=section, question=QuestionFactory(module=module, correct_answer="A"), position=1
        )
    return exam


@pytest.fixture
def sitting(auth_client):
    exam = mock_exam()
    response = auth_client.post(SESSIONS, {"exam": str(exam.id)}, format="json")
    assert response.status_code == 201
    return exam, response.data["data"]


class TestShape:
    def test_the_runner_is_told_it_is_a_fullscreen_paper(self, sitting):
        _, detail = sitting
        assert detail["exam"]["requires_fullscreen"] is True
        assert detail["exam"]["allow_pause"] is False

    def test_the_break_rides_on_the_module_it_follows(self, sitting):
        _, detail = sitting
        breaks = [s["break_after_minutes"] for s in detail["sections"]]
        assert breaks == [None, 10, None, None]

    def test_four_modules_each_with_its_own_clock(self, sitting):
        _, detail = sitting
        assert [s["time_limit"] for s in detail["sections"]] == [35, 35, 32, 32]

    def test_no_whole_paper_clock_above_the_modules(self, sitting):
        """What makes the break free.

        With a paper-wide limit the ten minutes of rest would come out of the
        exam, because the exam clock runs from started_at regardless of where
        the student is. Only the module clocks bind, and the tighter of the two
        is therefore always the module's.
        """
        _, detail = sitting
        assert detail["exam_time_remaining"] is None
        assert detail["server_time_remaining"] == detail["section_time_remaining"]
        assert detail["section_time_remaining"] == pytest.approx(35 * 60, abs=5)

    def test_a_mock_cannot_be_paused(self, auth_client, sitting):
        _, detail = sitting
        r = auth_client.post(f"{SESSIONS}{detail['id']}/pause/")
        assert r.status_code == 400


class TestOnlyTheOpenModuleIsServed:
    """The break used to be a window with every remaining question already in
    the tab: the whole paper arrived at start. Modules are now fetched one at a
    time, which is safe precisely because sections are forward-only."""

    def test_start_ships_only_module_one(self, sitting):
        _, detail = sitting
        served = [len(s["questions"]) for s in detail["sections"]]
        assert served == [1, 0, 0, 0]

    def test_every_module_still_reports_its_size(self, sitting):
        _, detail = sitting
        assert [s["question_count"] for s in detail["sections"]] == [1, 1, 1, 1]
        # ...and its shape, so the break screen and the numbering still work.
        assert [s["break_after_minutes"] for s in detail["sections"]] == [None, 10, None, None]

    def test_advancing_hands_over_the_next_module(self, auth_client, sitting):
        _, detail = sitting
        after = auth_client.patch(
            f"{SESSIONS}{detail['id']}/",
            {"current_section": 2, "current_question": 1},
            format="json",
        )
        served = [len(s["questions"]) for s in after.data["data"]["sections"]]
        assert served == [0, 1, 0, 0]

    def test_a_reload_mid_paper_gets_only_the_module_in_hand(self, auth_client, sitting):
        _, detail = sitting
        # One module at a time — a jump is refused (see TestAdvanceIsOneStep).
        for section in (2, 3):
            auth_client.patch(
                f"{SESSIONS}{detail['id']}/",
                {"current_section": section, "current_question": 1},
                format="json",
            )
        reloaded = auth_client.get(f"{SESSIONS}{detail['id']}/")
        served = [len(s["questions"]) for s in reloaded.data["data"]["sections"]]
        assert served == [0, 0, 1, 0]


class TestAdvanceIsOneStep:
    """Forward-only stopped a student going BACK; it did nothing about going too
    far forward. A client could name any later section and land there, skipping
    whole modules — every question in them graded as omitted, and no way back."""

    def test_a_jump_past_the_next_module_is_refused(self, auth_client, sitting):
        _, detail = sitting
        response = auth_client.patch(
            f"{SESSIONS}{detail['id']}/",
            {"current_section": 3, "current_question": 1},
            format="json",
        )
        assert response.status_code == 400
        assert auth_client.get(f"{SESSIONS}{detail['id']}/").data["data"]["current_section"] == 1

    def test_the_next_module_is_allowed(self, auth_client, sitting):
        _, detail = sitting
        response = auth_client.patch(
            f"{SESSIONS}{detail['id']}/",
            {"current_section": 2, "current_question": 1},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["data"]["current_section"] == 2


class TestBreakDoesNotCostTime:
    def test_the_next_module_starts_its_own_clock_on_advance(self, auth_client, sitting):
        """A long rest delays the next module; it does not shorten it."""
        _, detail = sitting
        after = auth_client.patch(
            f"{SESSIONS}{detail['id']}/",
            {"current_section": 2, "current_question": 1},
            format="json",
        )
        assert after.status_code == 200
        # Module 2's own 35 minutes, counted from the moment the advance landed.
        assert after.data["data"]["section_time_remaining"] == pytest.approx(35 * 60, abs=5)


def seed_bank():
    """Enough published questions for the paper the seed builds.

    Module 2 of each subject is adaptive, so it needs TWO forms: 22+22+22 math
    and 27+27+27 reading & writing. Spread across the difficulty range, because
    the seed draws the lower form from the easy end and the upper from the hard
    one — a flat bank would make the two forms indistinguishable.
    """
    UserFactory(role="admin", is_staff=True)
    for module, needed in (("math", 66), ("reading_writing", 81)):
        for index in range(needed):
            QuestionFactory(
                module=module, status=Question.Status.PUBLISHED, difficulty=(index % 5) + 1
            )


class TestSeedCommand:
    def test_it_builds_the_paper_the_runner_expects(self):
        seed_bank()

        call_command("seed_full_mock")
        exam = ExamTemplate.objects.get(title="Full Mock Exam 1")
        assert exam.type == ExamTemplate.Type.MOCK
        assert exam.requires_fullscreen is True
        assert exam.allow_pause is False
        assert exam.time_limit is None

        sections = list(exam.sections.order_by("section_number"))
        assert [s.module for s in sections] == [
            "math",
            "math",
            "reading_writing",
            "reading_writing",
        ]
        assert [s.break_after_minutes for s in sections] == [None, 10, None, None]
        # Module 2 of each subject carries BOTH forms; a student is served one.
        assert [s.exam_questions.count() for s in sections] == [22, 44, 27, 54]

    def test_the_second_module_of_each_subject_is_routed(self):
        """The paper is adaptive like the real thing: module 1 is the same for
        everyone and is what the routing decision is made FROM, so it is never
        itself routed."""
        seed_bank()
        call_command("seed_full_mock")
        exam = ExamTemplate.objects.get(title="Full Mock Exam 1")
        assert exam.is_adaptive is True

        forms = [
            sorted(set(s.exam_questions.values_list("routing", flat=True)))
            for s in exam.sections.order_by("section_number")
        ]
        assert forms == [["standard"], ["lower", "upper"], ["standard"], ["lower", "upper"]]

    def test_the_two_forms_are_the_same_length_and_do_not_overlap(self):
        """Two forms of one module, not two different modules — and no question
        may sit in both, or its difficulty would say nothing about the form."""
        seed_bank()
        call_command("seed_full_mock")
        exam = ExamTemplate.objects.get(title="Full Mock Exam 1")

        for section in exam.sections.filter(section_number__in=(2, 4)):
            lower = set(
                section.exam_questions.filter(routing="lower").values_list("question_id", flat=True)
            )
            upper = set(
                section.exam_questions.filter(routing="upper").values_list("question_id", flat=True)
            )
            assert len(lower) == len(upper)
            assert not lower & upper

    def test_re_running_refills_rather_than_duplicating(self):
        seed_bank()

        call_command("seed_full_mock")
        call_command("seed_full_mock")
        assert ExamTemplate.objects.filter(title="Full Mock Exam 1").count() == 1
        assert ExamSection.objects.filter(exam__title="Full Mock Exam 1").count() == 4

    def test_a_module_never_reuses_another_modules_questions(self):
        seed_bank()

        call_command("seed_full_mock")
        exam = ExamTemplate.objects.get(title="Full Mock Exam 1")
        ids = [
            eq.question_id for section in exam.sections.all() for eq in section.exam_questions.all()
        ]
        assert len(ids) == len(set(ids))


class TestVisibility:
    def test_a_mock_is_academy_only(self):
        exam = mock_exam()
        exam.access_level = ExamTemplate.AccessLevel.ACADEMY
        exam.save()

        public = APIClient()
        public.force_authenticate(UserFactory(role="public"))
        r = public.post(SESSIONS, {"exam": str(exam.id)}, format="json")
        assert r.status_code in (400, 403)
