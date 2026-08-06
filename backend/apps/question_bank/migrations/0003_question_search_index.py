"""GIN index backing question search (see apps/question_bank/search.py).

A GIN over a tsvector is Postgres-only, and dev + CI run SQLite. The operation is
`AddIndexPostgresOnly`, which records the index in migration STATE everywhere but
only emits DDL on Postgres — so `makemigrations --check` stays clean on SQLite
while production still gets the index.
"""

import django.contrib.postgres.indexes
import django.contrib.postgres.search
import django.db.models.functions.comparison
from django.conf import settings
from django.db import migrations, models

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
                    django.db.models.functions.comparison.Coalesce(
                        "stem", models.Value(""), output_field=models.TextField()
                    ),
                    django.db.models.functions.comparison.Coalesce(
                        "passage", models.Value(""), output_field=models.TextField()
                    ),
                    django.db.models.functions.comparison.Coalesce(
                        "source_ref", models.Value(""), output_field=models.TextField()
                    ),
                    config="english",
                ),
                name="questions_search_gin",
            ),
        ),
    ]
