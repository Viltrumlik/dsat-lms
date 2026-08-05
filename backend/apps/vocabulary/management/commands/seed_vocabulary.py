"""
DSAT LMS v2 — Vocabulary demo seed
Domain: Vocabulary
Description: One published word list split into decks of 25, so the flashcard
    surface has something real to run over.

Idempotent: re-running reuses the section (keyed by slug) and re-imports the
words, which updates rather than duplicates them.
"""

from django.core.management.base import BaseCommand

from apps.vocabulary.models import VocabSection, VocabSet
from apps.vocabulary.services import import_words

SECTION = {
    "title": "SAT Essential Words",
    "slug": "sat-essential-words",
    "description": "High-frequency words the Digital SAT keeps coming back to.",
}

# word; definition; example
WORDS = """
abate; to become less intense; The storm finally abated after midnight.
aberration; a departure from what is normal; The warm January was an aberration.
abstain; to choose not to do something; She abstained from commenting.
adversity; hardship or misfortune; He kept his humour through adversity.
advocate; to publicly support; The report advocates smaller class sizes.
aesthetic; concerned with beauty; The building's aesthetic is deliberately plain.
alleviate; to make less severe; The grant alleviated the school's funding gap.
ambiguous; open to more than one reading; The ending is deliberately ambiguous.
ambivalent; having mixed feelings; She was ambivalent about moving.
anecdote; a short account of an incident; He opened with an anecdote.
anomaly; something that deviates from the standard; The reading was an anomaly.
antagonize; to provoke hostility in; Do not antagonize the reviewers.
apathy; lack of interest or concern; Voter apathy decided the election.
arbitrary; based on whim rather than reason; The cut-off felt arbitrary.
articulate; expressing oneself clearly; An articulate defence of the plan.
astute; shrewd, perceptive; An astute reading of the market.
audacious; boldly daring; An audacious proposal.
augment; to make greater; They augmented the data with interviews.
austere; severe or plain; The austere room held one chair.
benevolent; kindly, well-meaning; A benevolent employer.
bolster; to support or strengthen; New figures bolster the argument.
brevity; shortness of expression; The essay's brevity is its strength.
candid; frank and honest; A candid assessment.
capricious; given to sudden changes; A capricious decision.
censure; to criticise formally; The board censured the director.
coherent; logically consistent; A coherent explanation.
complacent; smug, uncritically satisfied; Success made them complacent.
concede; to admit as true; He conceded the point.
condone; to accept behaviour that is wrong; The policy does not condone lateness.
conspicuous; clearly visible; A conspicuous error.
corroborate; to confirm with evidence; A second study corroborated the finding.
credible; believable; A credible witness.
cryptic; obscure in meaning; A cryptic reply.
deference; respectful submission; Deference to the older tradition.
deleterious; causing harm; A deleterious effect on sleep.
depict; to represent; The painting depicts a harvest.
deter; to discourage; Fines deter little.
didactic; intended to teach; A didactic novel.
diligent; showing careful effort; A diligent researcher.
discern; to perceive clearly; She discerned a pattern.
disparage; to belittle; He disparaged the idea.
disparate; essentially different; Two disparate accounts.
dogmatic; asserting opinions as certain; A dogmatic tone.
eclectic; drawing on many sources; An eclectic reading list.
egregious; outstandingly bad; An egregious oversight.
elicit; to draw out; The question elicited a long answer.
eloquent; fluent and persuasive; An eloquent appeal.
empirical; based on observation; Empirical evidence.
enigmatic; mysterious; An enigmatic smile.
ephemeral; lasting a very short time; Ephemeral fame.
""".strip()


class Command(BaseCommand):
    help = "Seed a published vocabulary section split into decks of 25."

    def handle(self, *args, **options):
        section, created = VocabSection.objects.get_or_create(
            slug=SECTION["slug"],
            defaults={
                "title": SECTION["title"],
                "description": SECTION["description"],
                "status": VocabSection.Status.PUBLISHED,
            },
        )
        if not created and section.status != VocabSection.Status.PUBLISHED:
            section.status = VocabSection.Status.PUBLISHED
            section.save(update_fields=["status", "updated_at"])

        lines = [line for line in WORDS.splitlines() if line.strip()]
        chunk = VocabSet.TARGET_WORD_COUNT
        total = 0
        for index, start in enumerate(range(0, len(lines), chunk), start=1):
            vocab_set, _ = VocabSet.objects.get_or_create(
                section=section,
                title=f"Set {index}",
                defaults={"sort_order": index},
            )
            total += import_words(vocab_set, "\n".join(lines[start : start + chunk]))

        self.stdout.write(
            self.style.SUCCESS(f"{section.title}: {section.sets.count()} sets, {total} new words.")
        )
