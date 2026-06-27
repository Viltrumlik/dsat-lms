"""
DSAT LMS v2 — Common Response Helpers
Domain: Common

Standard success response format:
{
    "success": true,
    "data": { ... }
}
"""

from rest_framework import status
from rest_framework.response import Response


def success_response(data, status_code=status.HTTP_200_OK, meta=None):
    """Standard success response."""
    payload = {"success": True, "data": data}
    if meta:
        payload["meta"] = meta
    return Response(payload, status=status_code)


def created_response(data):
    """201 Created."""
    return success_response(data, status_code=status.HTTP_201_CREATED)


def no_content_response():
    """204 No Content."""
    return Response(status=status.HTTP_204_NO_CONTENT)
