"""
DSAT LMS v2 — Custom Exception Handler
Domain: Common

Barcha API error javoblarini standart formatga keltiradi:
{
    "success": false,
    "error": {
        "code": "ERROR_CODE",
        "message": "Human readable message.",
        "field": null | "field_name"
    }
}
"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    """DRF exception handler'ni override qilamiz."""
    response = exception_handler(exc, context)

    if response is None:
        return None

    # Validation errors
    if response.status_code == status.HTTP_400_BAD_REQUEST:
        if isinstance(response.data, dict) and any(
            isinstance(v, list) for v in response.data.values()
        ):
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": "Please fix the errors below.",
                        "fields": response.data,
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    # Authentication errors
    if response.status_code == status.HTTP_401_UNAUTHORIZED:
        return Response(
            {
                "success": False,
                "error": {
                    "code": "AUTHENTICATION_REQUIRED",
                    "message": "Authentication credentials were not provided or are invalid.",
                    "field": None,
                },
            },
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # Permission errors
    if response.status_code == status.HTTP_403_FORBIDDEN:
        return Response(
            {
                "success": False,
                "error": {
                    "code": "PERMISSION_DENIED",
                    "message": "You do not have permission to perform this action.",
                    "field": None,
                },
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    # Not found
    if response.status_code == status.HTTP_404_NOT_FOUND:
        return Response(
            {
                "success": False,
                "error": {
                    "code": "NOT_FOUND",
                    "message": "The requested resource was not found.",
                    "field": None,
                },
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    # Method not allowed
    if response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED:
        return Response(
            {
                "success": False,
                "error": {
                    "code": "METHOD_NOT_ALLOWED",
                    "message": "This HTTP method is not allowed.",
                    "field": None,
                },
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    # Rate limit
    if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        return Response(
            {
                "success": False,
                "error": {
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": "Too many requests. Please slow down.",
                    "field": None,
                },
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    # Generic fallback
    return Response(
        {
            "success": False,
            "error": {
                "code": "SERVER_ERROR",
                "message": "An unexpected error occurred.",
                "field": None,
            },
        },
        status=response.status_code,
    )


class DSATAPIException(Exception):
    """Base exception for custom API errors."""

    status_code = status.HTTP_400_BAD_REQUEST
    code = "API_ERROR"
    message = "An error occurred."
    field = None

    def __init__(self, message=None, field=None, code=None, extra=None):
        """`code` and `extra` exist so a client can localize the refusal.

        `message` is written in English on the server, and the interface may be
        in Uzbek — so a message is something to fall back to, not something to
        show by preference. A specific `code` gives the client a stable key to
        translate against, and `extra` carries the numbers a translated sentence
        needs (how many attempts are left, how long to wait) rather than leaving
        them embedded in an English string the client would have to parse back
        out.
        """
        if message:
            self.message = message
        if field:
            self.field = field
        if code:
            self.code = code
        self.extra = extra or {}

    def to_response(self):
        error = {
            "code": self.code,
            "message": self.message,
            "field": self.field,
        }
        error.update(getattr(self, "extra", {}))
        return Response({"success": False, "error": error}, status=self.status_code)


class NotFoundError(DSATAPIException):
    status_code = status.HTTP_404_NOT_FOUND
    code = "NOT_FOUND"
    message = "Resource not found."


class PermissionError(DSATAPIException):
    status_code = status.HTTP_403_FORBIDDEN
    code = "PERMISSION_DENIED"
    message = "You do not have permission."


class ValidationError(DSATAPIException):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "VALIDATION_ERROR"
    message = "Validation failed."


class ExamSessionError(DSATAPIException):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "EXAM_SESSION_ERROR"
    message = "Exam session error."
