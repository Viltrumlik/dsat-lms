"""
DSAT LMS v2 — Migration operations
Domain: Common
Description: Operations that only apply on some backends.

Production is Postgres; dev and CI are SQLite. A few things — a GIN index over a
tsvector, an extension — exist on one and not the other, and a migration that
simply assumes Postgres makes the test suite unrunnable.
"""

from django.db import migrations


class PostgresOnlyMixin:
    """Run this operation on Postgres and nowhere else.

    Deliberately a subclass of the real operation rather than a `RunSQL`: the
    migration STATE still records the index, so the autodetector on a SQLite dev
    box does not keep wanting to re-add it and `makemigrations --check` stays
    clean. Only the DDL is skipped.
    """

    def _is_postgres(self, schema_editor):
        return schema_editor.connection.vendor == "postgresql"

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        if not self._is_postgres(schema_editor):
            return
        super().database_forwards(app_label, schema_editor, from_state, to_state)

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        if not self._is_postgres(schema_editor):
            return
        super().database_backwards(app_label, schema_editor, from_state, to_state)


class AddIndexPostgresOnly(PostgresOnlyMixin, migrations.AddIndex):
    pass


class RemoveIndexPostgresOnly(PostgresOnlyMixin, migrations.RemoveIndex):
    pass
