"""
DSAT LMS v2 — Identity Serializers
Domain: Identity
Description: Registration, login, and the public user representation.
Permissions: RegisterSerializer/LoginSerializer are used by AllowAny auth views;
             UserSerializer is the safe read-only shape returned to the owner.
"""

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    """Safe, read-only representation of the authenticated user."""

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
            "is_email_verified",
            "avatar_url",
            "sat_target_score",
            "exam_date",
            "timezone",
            "created_at",
        ]
        read_only_fields = fields


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """Self-service profile fields (PATCH /auth/me/). Email/role are immutable."""

    sat_target_score = serializers.IntegerField(
        required=False, allow_null=True, min_value=400, max_value=1600
    )

    class Meta:
        model = User
        fields = ["first_name", "last_name", "sat_target_score", "exam_date", "timezone"]


class RegisterSerializer(serializers.ModelSerializer):
    """Public self-registration → always creates a role='public' user."""

    password = serializers.CharField(
        write_only=True, min_length=8, style={"input_type": "password"}
    )

    class Meta:
        model = User
        fields = ["email", "password", "first_name", "last_name"]

    def validate_email(self, value):
        value = value.lower().strip()
        # User.objects is unfiltered (no soft-delete manager on the custom User),
        # so a soft-deleted account still blocks re-registration of the same email.
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("This email is already registered.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        # create_user hashes the password; role defaults to 'public' on the model.
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    """Email + password → resolves the authenticated user in validated_data['user']."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, attrs):
        email = attrs["email"].lower().strip()
        password = attrs["password"]

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            # Generic message — don't leak which emails exist.
            raise serializers.ValidationError("Invalid email or password.") from None

        if not user.check_password(password):
            raise serializers.ValidationError("Invalid email or password.")
        if not user.is_active:
            raise serializers.ValidationError("This account is inactive.")

        attrs["user"] = user
        return attrs


class EmailVerifyConfirmSerializer(serializers.Serializer):
    """The six-digit code from the verification email, plus the address it went to.

    A code, not a link: a link only works in the browser that opened it, and a
    student who signs up on a laptop and reads mail on a phone has neither. The
    code is checked against the DB in the view (apps.mailer.codes) — this only
    shapes the input.
    """

    email = serializers.EmailField()
    code = serializers.CharField(min_length=4, max_length=10, trim_whitespace=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    """Just an email — the view never reveals whether an account exists."""

    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """The emailed code plus the new password.

    Password strength is validated in the view, once the code has been accepted
    and the user is known — `validate_password` wants the user to compare the
    password against their own name and email.
    """

    email = serializers.EmailField()
    code = serializers.CharField(min_length=4, max_length=10, trim_whitespace=True)
    new_password = serializers.CharField(write_only=True, min_length=8)


class PasswordChangeSerializer(serializers.Serializer):
    """Authenticated password change — verifies the current password first."""

    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context["request"].user)
        return value
