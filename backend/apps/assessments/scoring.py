"""
DSAT LMS v2 — SAT Scoring
Domain: Assessments
Description: Raw → scaled (200–800) section scores.

REPRESENTATIVE APPROXIMATION. The real Digital SAT maps a section's raw score to
a scaled score via per-form lookup tables, and module 2 is adaptive — neither is
published in full. This uses a fixed percent-correct → scaled curve shaped like
the published concordances: a hard 200 floor, a roughly linear middle, and mild
compression near the 800 ceiling. It is deterministic and monotonic. Swap CURVE
for an official per-form table when one is available (the call site is unchanged).
"""

SECTION_FLOOR = 200
SECTION_CEIL = 800

# (fraction_correct, scaled_score) anchors, ascending. Scores between anchors are
# linearly interpolated. Endpoints pin the 200 floor and the 800 ceiling.
CURVE = [
    (0.00, 200),
    (0.10, 230),
    (0.20, 280),
    (0.30, 340),
    (0.40, 410),
    (0.50, 480),
    (0.60, 550),
    (0.70, 620),
    (0.80, 690),
    (0.90, 750),
    (1.00, 800),
]


def scaled_section_score(correct: int, total: int) -> int:
    """Map a raw section result to the 200–800 SAT scale (representative curve)."""
    if total <= 0:
        return SECTION_FLOOR
    ratio = max(0.0, min(1.0, correct / total))
    for (x0, y0), (x1, y1) in zip(CURVE, CURVE[1:], strict=False):
        if ratio <= x1:
            span = x1 - x0
            t = 0.0 if span == 0 else (ratio - x0) / span
            return round(y0 + t * (y1 - y0))
    return SECTION_CEIL
