# apps/identity/serializers_admin.py
# Domain: Identity
# Description: Admin-facing user serializers (read, create, update, role, set-password)
#             for the /api/v1/admin/users/ surface. Admin-only — exposes status fields
#             (is_active, is_staff, deleted_at) the owner-facing UserSerializer hides.
# Permissions: consumed only by IsAdmin views (see views_admin.py).

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import OrgSetting, User


class AdminUserSerializer(serializers.ModelSerializer):
    """Full read representation for admins (includes status + audit fields)."""

    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "is_active",
            "is_staff",
            "is_email_verified",
            "avatar_url",
            "sat_target_score",
            "exam_date",
            "timezone",
            "last_login_at",
            "created_at",
            "updated_at",
            "deleted_at",
        ]
        read_only_fields = fields


class AdminUserCreateSerializer(serializers.ModelSerializer):
    """Admin creates a user of any role with an explicit password.

    Admin-created accounts default to email-verified (the admin is vouching) so
    they can sign in immediately — no verification email is sent on this path.
    """

    password = serializers.CharField(
        write_only=True, min_length=8, style={"input_type": "password"}
    )
    role = serializers.ChoiceField(choices=User.Role.choices)

    class Meta:
        model = User
        fields = ["email", "password", "first_name", "last_name", "role", "is_email_verified"]
        extra_kwargs = {
            "first_name": {"required": True},
            "last_name": {"required": True},
            "is_email_verified": {"required": False, "default": True},
        }

    def validate_email(self, value):
        value = value.lower().strip()
        # User.objects is unfiltered (no soft-delete manager), so a soft-deleted
        # account still blocks re-use of its email.
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("This email is already registered.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        # create_user hashes the password.
        return User.objects.create_user(**validated_data)


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    """Admin edits profile + verification fields. Role goes through its own
    endpoint; password + active-status have dedicated actions."""

    sat_target_score = serializers.IntegerField(
        required=False, allow_null=True, min_value=400, max_value=1600
    )

    class Meta:
        model = User
        fields = [
            "first_name",
            "last_name",
            "email",
            "is_email_verified",
            "avatar_url",
            "sat_target_score",
            "exam_date",
            "timezone",
        ]

    def validate_email(self, value):
        value = value.lower().strip()
        qs = User.objects.filter(email__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This email is already registered.")
        return value


class AdminUserRoleSerializer(serializers.Serializer):
    """Change a user's role only."""

    role = serializers.ChoiceField(choices=User.Role.choices)


class AdminSetPasswordSerializer(serializers.Serializer):
    """Admin sets a new password for a user (forces re-login everywhere)."""

    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class OrgSettingSerializer(serializers.ModelSerializer):
    """Read/update the org-settings singleton. Admin-only."""

    class Meta:
        model = OrgSetting
        fields = [
            "academy_name",
            "academic_year",
            "display_timezone",
            "grading_thresholds",
            "logo_url",
            "default_email_sender",
            "feature_flags",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def validate_grading_thresholds(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Must be an object of band → minimum percent.")
        for band, minpct in value.items():
            if isinstance(minpct, bool) or not isinstance(minpct, int | float):
                raise serializers.ValidationError(f"{band}: minimum percent must be a number.")
            if not 0 <= minpct <= 100:
                raise serializers.ValidationError(f"{band}: minimum percent must be 0–100.")
        return value

    def validate_feature_flags(self, value):
        if not isinstance(value, dict) or any(not isinstance(v, bool) for v in value.values()):
            raise serializers.ValidationError("Must be an object of flag → boolean.")
        return value
