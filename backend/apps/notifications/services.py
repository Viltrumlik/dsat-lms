"""
DSAT LMS v2 — Notification Services
Domain: Notifications
Description: notify() — the one seam other domains call to create a notification.
"""


def notify(user, notification_type, title, body="", data=None):
    """Create an in-app notification for a user. Returns the Notification."""
    from .models import Notification

    return Notification.objects.create(
        user=user,
        type=notification_type,
        title=title,
        body=body,
        data=data or {},
    )
