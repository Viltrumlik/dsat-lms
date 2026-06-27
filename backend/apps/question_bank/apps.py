"""
DSAT LMS v2 — Question Bank App Config
Domain: Question Bank
Description: Questions, categories, tags, versioning lifecycle.
"""

from django.apps import AppConfig


class QuestionBankConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.question_bank"
    label = "question_bank"
    verbose_name = "Question Bank"
