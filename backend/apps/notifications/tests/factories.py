"""
DSAT LMS v2 — Notifications Test Factories
Domain: Notifications
"""

import factory

from apps.identity.tests.factories import UserFactory
from apps.notifications.models import Notification


class NotificationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Notification

    user = factory.SubFactory(UserFactory)
    type = Notification.Type.SYSTEM
    title = factory.Sequence(lambda n: f"Notification {n}")
    body = "Body text"
