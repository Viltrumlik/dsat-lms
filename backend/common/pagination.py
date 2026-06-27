"""
DSAT LMS v2 — Pagination
Domain: Common

Cursor-based pagination — offset emas.
Sababi: offset pagination katta dataset'larda sekin va inconsistent.
"""

from rest_framework.pagination import CursorPagination as BaseCursorPagination
from rest_framework.response import Response


class CursorPagination(BaseCursorPagination):
    """Standard cursor pagination for all list endpoints."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
    ordering = "-created_at"

    def get_paginated_response(self, data):
        return Response(
            {
                "success": True,
                "data": data,
                "meta": {
                    "pagination": {
                        "count": (
                            self.page.paginator.count if hasattr(self.page, "paginator") else None
                        ),
                        "next": self.get_next_link(),
                        "previous": self.get_previous_link(),
                    }
                },
            }
        )

    def get_paginated_response_schema(self, schema):
        return {
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "data": schema,
                "meta": {
                    "type": "object",
                    "properties": {
                        "pagination": {
                            "type": "object",
                            "properties": {
                                "count": {"type": "integer", "nullable": True},
                                "next": {"type": "string", "nullable": True},
                                "previous": {"type": "string", "nullable": True},
                            },
                        }
                    },
                },
            },
        }


class SmallCursorPagination(CursorPagination):
    page_size = 10


class LargeCursorPagination(CursorPagination):
    page_size = 50
