"""
DSAT LMS v2 — Vocabulary App Config
Domain: Vocabulary
Description: SAT word lists — Section → Set → Word — and the one way to study
    them: flashcards. Authored under /api/v1/admin/vocabulary/ from the content
    studio; studied under /api/v1/vocabulary/.
"""

from django.apps import AppConfig


class VocabularyConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.vocabulary"
    label = "vocabulary"
    verbose_name = "Vocabulary"
