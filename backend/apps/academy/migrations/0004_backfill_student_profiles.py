"""Backfill a StudentProfile (status=ACTIVE) for every existing student."""

from django.db import migrations


def create_profiles(apps, schema_editor):
    User = apps.get_model("identity", "User")
    StudentProfile = apps.get_model("academy", "StudentProfile")
    for user in User.objects.filter(role="student"):
        StudentProfile.objects.get_or_create(
            user_id=user.id,
            defaults={"status": "active", "enrolled_at": user.created_at},
        )


def noop(apps, schema_editor):
    # Reverse: leave profiles in place (soft-delete convention — never hard-delete).
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("academy", "0003_studentprofile_guardian"),
        ("identity", "0002_alter_user_role"),
    ]

    operations = [migrations.RunPython(create_profiles, noop)]
