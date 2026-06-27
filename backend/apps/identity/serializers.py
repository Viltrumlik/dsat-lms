"""
DSAT LMS v2 — Identity Serializers
Domain: Identity
Description: Registration, login, and the public user representation.
Permissions: RegisterSerializer/LoginSerializer are used by AllowAny auth views;
             UserSerializer is the safe read-only shape returned to the owner.
"""

from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import User
from .tokens import email_verification_token, get_user_from_uidb64


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
    """uid + token from the verification link → resolves the user to verify."""

    uid = serializers.CharField()
    token = serializers.CharField()

    def validate(self, attrs):
        user = get_user_from_uidb64(attrs["uid"])
        if user is None or not email_verification_token.check_token(user, attrs["token"]):
            raise serializers.ValidationError("Invalid or expired verification link.")
        attrs["user"] = user
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    """Just an email — the view never reveals whether an account exists."""

    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """uid + token from the reset link + the new password."""

    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        user = get_user_from_uidb64(attrs["uid"])
        if user is None or not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError("Invalid or expired reset link.")
        try:
            validate_password(attrs["new_password"], user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)}) from exc
        attrs["user"] = user
        return attrs


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
