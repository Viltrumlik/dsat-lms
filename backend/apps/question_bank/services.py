# apps/question_bank/services.py
# Domain: Question Bank
# Description: Content-lifecycle helpers — cloning a published question into a new
#             draft revision (§9 versioning) and walking a question's version chain.

from .models import Question, QuestionChoice

# Content fields copied verbatim when a published question is revised.
_COPIED_FIELDS = (
    "module",
    "category",
    "difficulty",
    "answer_type",
    "has_math",
    "stem",
    "stem_image_url",
    "passage",
    "passage_image_url",
    "correct_answer",
    "explanation",
    "explanation_image_url",
    "source",
    "source_ref",
)


def create_new_version(question, user):
    """Clone a PUBLISHED question into a new DRAFT revision (parent = the published
    question, version + 1). The old version is archived only once the revision is
    approved (see the approve view)."""
    if question.status != Question.Status.PUBLISHED:
        raise ValueError("Only published questions can be revised.")

    new_version = Question.objects.create(
        version=question.version + 1,
        parent=question,
        status=Question.Status.DRAFT,
        created_by=user,
        **{field: getattr(question, field) for field in _COPIED_FIELDS},
    )
    new_version.tags.set(question.tags.all())
    for choice in question.choices.all():
        QuestionChoice.objects.create(
            question=new_version,
            label=choice.label,
            text=choice.text,
            image_url=choice.image_url,
            sort_order=choice.sort_order,
        )
    return new_version


def version_chain(question):
    """All questions in `question`'s lineage, ordered by version. Walks up to the
    root (parent = None), then collects every descendant via the `versions` reverse
    relation."""
    root = question
    guard = set()
    while root.parent_id is not None and root.parent_id not in guard:
        guard.add(root.id)
        root = root.parent

    chain, frontier = [root], [root]
    while frontier:
        nxt = []
        for node in frontier:
            for child in node.versions.all():
                chain.append(child)
                nxt.append(child)
        frontier = nxt
    return sorted(chain, key=lambda q: q.version)
