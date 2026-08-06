"""
DSAT LMS v2 — SAT taxonomy
Domain: Question Bank
Description: The official Digital SAT domain → skill tree, in one place.

`QuestionCategory` is already a tree (`parent`), so a domain is a root category
and a skill is its child. Questions are tagged with the SKILL; a filter on a
domain means "any skill under it", which is what `descendant_ids` resolves.

The names below are the College Board's own, so a question tagged here can be
talked about with a student in the words they will meet on test day. Keep them
verbatim — they are matched by name when reseeding.

Difficulty is stored 1–5 on the question (finer than the SAT's own three tiers,
which is useful when ordering an adaptive module) but students think in easy /
medium / hard, so BANDS maps between the two. It lives here rather than in the
filter because both the filter and the practice-set builder need it.
"""

MATH = "math"
READING_WRITING = "reading_writing"

# module -> [(domain, [skill, ...]), ...]
TAXONOMY: dict[str, list[tuple[str, list[str]]]] = {
    READING_WRITING: [
        (
            "Information and Ideas",
            ["Central Ideas and Details", "Inferences", "Command of Evidence"],
        ),
        (
            "Craft and Structure",
            ["Words in Context", "Text Structure and Purpose", "Cross-Text Connections"],
        ),
        ("Expression of Ideas", ["Rhetorical Synthesis", "Transitions"]),
        ("Standard English Conventions", ["Boundaries", "Form, Structure, and Sense"]),
    ],
    MATH: [
        (
            "Algebra",
            [
                "Linear equations in one variable",
                "Linear functions",
                "Linear equations in two variables",
                "Systems of two linear equations in two variables",
                "Linear inequalities in one or two variables",
            ],
        ),
        (
            "Advanced Math",
            [
                "Equivalent expressions",
                "Nonlinear equations in one variable and systems of equations",
                "Nonlinear functions",
            ],
        ),
        (
            "Problem-Solving and Data Analysis",
            [
                "Ratios, rates, proportional relationships, and units",
                "Percentages",
                "One-variable data: distributions and measures of center and spread",
                "Two-variable data: models and scatterplots",
                "Probability and conditional probability",
                "Inference from sample statistics and margin of error",
                "Evaluating statistical claims: observational studies and experiments",
            ],
        ),
        (
            "Geometry and Trigonometry",
            [
                "Area and volume",
                "Lines, angles, and triangles",
                "Right triangles and trigonometry",
                "Circles",
            ],
        ),
    ],
}

# Student-facing band -> the stored 1–5 difficulties it covers.
BANDS: dict[str, tuple[int, ...]] = {
    "easy": (1, 2),
    "medium": (3,),
    "hard": (4, 5),
}


def band_of(difficulty: int) -> str:
    """Which band a stored difficulty falls in."""
    for band, values in BANDS.items():
        if difficulty in values:
            return band
    return "medium"


def difficulties_for(bands) -> list[int]:
    """Flatten a list of band names to the stored difficulties they select."""
    out: list[int] = []
    for band in bands or []:
        out.extend(BANDS.get(band, ()))
    return sorted(set(out))
