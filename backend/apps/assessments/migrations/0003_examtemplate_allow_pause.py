# Domain: Assessments
# Description: Adds ExamTemplate.allow_pause and back-fills it from the exam type.
#   Pausing freezes the clock, so allowing it on a timed paper hands out unlimited
#   time. Existing rows keep working the way a teacher would expect: practice and
#   homework stay pausable, every invigilated type does not.

from django.db import migrations, models

PAUSABLE_TYPES = ["practice", "homework"]


def backfill(apps, schema_editor):
    ExamTemplate = apps.get_model("assessments", "ExamTemplate")
    ExamTemplate.objects.filter(type__in=PAUSABLE_TYPES).update(allow_pause=True)
    # Untimed papers have no clock to game, so pausing them is harmless.
    ExamTemplate.objects.filter(time_limit__isnull=True).update(allow_pause=True)


def unbackfill(apps, schema_editor):
    # allow_pause is dropped by the schema operation; nothing to undo.
    pass


class Migration(migrations.Migration):
    dependencies = [("assessments", "0002_examsession_section_started_at")]

    operations = [
        migrations.AddField(
            model_name="examtemplate",
            name="allow_pause",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(backfill, unbackfill),
    ]
