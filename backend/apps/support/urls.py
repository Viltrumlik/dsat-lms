"""
DSAT LMS v2 — Support Center URLs
Domain: Support
Description: Student/staff-facing support endpoints (mounted at /api/v1/support/).
    S0 ships the mount only; feature routes arrive with their slices (S1 booking,
    S2 tickets, S5 office hours). Admin ops routes land as urls_admin.py in S7.
"""

app_name = "support"

urlpatterns = []
