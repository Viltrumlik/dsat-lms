"""
DSAT LMS v2 — Assessment service tests
Domain: Assessments
Covers: answers_match — grid-in rational equivalence + string fallback;
        scaled_section_score — representative curve bounds + monotonicity.
"""

import pytest

from apps.assessments.scoring import SECTION_CEIL, SECTION_FLOOR, scaled_section_score
from apps.assessments.services import answers_match


class TestScaledSectionScore:
    def test_floor_and_ceiling(self):
        assert scaled_section_score(0, 10) == SECTION_FLOOR
        assert scaled_section_score(10, 10) == SECTION_CEIL

    def test_empty_section_floors(self):
        assert scaled_section_score(0, 0) == SECTION_FLOOR

    def test_half_correct_matches_curve_anchor(self):
        assert scaled_section_score(1, 2) == 480

    def test_scores_are_in_range_and_monotonic(self):
        prev = SECTION_FLOOR - 1
        for correct in range(0, 28):
            score = scaled_section_score(correct, 27)
            assert SECTION_FLOOR <= score <= SECTION_CEIL
            assert score >= prev  # non-decreasing as raw rises
            prev = score


class TestAnswersMatch:
    @pytest.mark.parametrize(
        ("chosen", "correct"),
        [
            ("3.5", "7/2"),
            ("7/2", "3.5"),
            (".5", "0.5"),
            ("36.0", "36"),
            ("1/3", "2/6"),
            ("-0.25", "-1/4"),
            (" 7/2 ", "3.5"),
        ],
    )
    def test_equivalent_numeric_forms_match(self, chosen, correct):
        assert answers_match(chosen, correct)

    @pytest.mark.parametrize(
        ("chosen", "correct"),
        [
            ("3.5", "7/3"),
            ("0.33", "1/3"),  # 0.33 is not exactly 1/3
            ("36", "-36"),
        ],
    )
    def test_non_equivalent_numbers_do_not_match(self, chosen, correct):
        assert not answers_match(chosen, correct)

    def test_mcq_letters_fall_back_to_string_compare(self):
        assert answers_match("B", "b")
        assert not answers_match("B", "C")

    def test_none_and_empty_are_safe(self):
        assert answers_match(None, None)
        assert not answers_match("", "36")

    def test_division_by_zero_falls_back_to_string_compare(self):
        assert answers_match("1/0", "1/0")
        assert not answers_match("1/0", "2/0")
