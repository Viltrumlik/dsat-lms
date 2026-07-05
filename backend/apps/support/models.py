"""
DSAT LMS v2 — Support Center models
Domain: Support
Description: Booking, tickets, office hours, recommendations, and support-ops
    rollups. S0 ships the app skeleton only — models arrive with their feature
    slices (S1 booking, S2 tickets, S4 recommendations, S5 office hours,
    S7 ops rollup). Shared choice sets live in apps/support/enums.py.

    The mentor layer (StudentProfile.mentor, MentorAssignment, MentorCheckIn,
    ParentContactLog) deliberately lives in apps/academy, not here — anchoring it
    on the academy CRM avoids a support→academy→support model dependency.
"""
