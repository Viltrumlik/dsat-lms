"""
DSAT LMS v2 — Identity Test Factories
Domain: Identity
"""

import factory

from apps.identity.models import User

DEFAULT_PASSWORD = "TestPass123!"


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@dsat.local")
    first_name = "Test"
    last_name = factory.Sequence(lambda n: f"User{n}")
    role = User.Role.PUBLIC
    is_active = True

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        # Use create_user so the password is hashed and saved.
        password = kwargs.pop("password", DEFAULT_PASSWORD)
        return model_class.objects.create_user(password=password, **kwargs)


class AdminUserFactory(UserFactory):
    email = factory.Sequence(lambda n: f"admin{n}@dsat.local")
    role = User.Role.ADMIN
    is_staff = True
    is_superuser = True
    is_email_verified = True
