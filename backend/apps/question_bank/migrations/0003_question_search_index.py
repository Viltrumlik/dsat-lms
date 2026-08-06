"""GIN index backing question search (see apps/question_bank/search.py).

A GIN over a tsvector is Postgres-only, and dev + CI run SQLite. The operation is
`AddIndexPostgresOnly`, which records the index in migration STATE everywhere but
only emits DDL on Postgres — so `makemigrations --check` stays clean on SQLite
while production still gets the index.
"""

import django.contrib.postgres.indexes
import django.contrib.postgres.search
from django.conf import settings
from django.db import migrations

from common.migration_ops import AddIndexPostgresOnly


class Migration(migrations.Migration):

    dependencies = [
        ("question_bank", "0002_remove_question_parent_remove_question_version"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        AddIndexPostgresOnly(
            model_name="question",
            index=django.contrib.postgres.indexes.GinIndex(
                django.contrib.postgres.search.SearchVector(
                    "stem", "passage", "source_ref", config="english"
                ),
                name="questions_search_gin",
            ),
        ),
    ]
