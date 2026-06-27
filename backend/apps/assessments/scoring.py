"""
DSAT LMS v2 — SAT Scoring
Domain: Assessments
Description: Raw → scaled (200–800) section scores.

This is a LINEAR APPROXIMATION. The real Digital SAT maps raw scores to scaled
scores via per-form lookup tables (and module 2 is adaptive). Replace
scaled_section_score with an official lookup table when one is available.
"""

SECTION_FLOOR = 200
SECTION_CEIL = 800


def scaled_section_score(correct: int, total: int) -> int:
    """Map a raw section result to the 200–800 SAT scale (linear approximation)."""
    if total <= 0:
        return SECTION_FLOOR
    ratio = max(0.0, min(1.0, correct / total))
    return round(SECTION_FLOOR + ratio * (SECTION_CEIL - SECTION_FLOOR))
