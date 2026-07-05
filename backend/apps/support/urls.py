"""
DSAT LMS v2 — Support Center URLs
Domain: Support
Description: Support endpoints (mounted at /api/v1/support/). S1 ships Book a
    Teacher: student discovery/slots/bookings + teacher availability + staff
    booking management. Admin ops routes land as urls_admin.py in S7.
"""

from django.urls import path

from . import views, views_staff

app_name = "support"

urlpatterns = [
    # ─── Student: Book a Teacher ───
    path("bookable-teachers/", views.BookableTeachersView.as_view(), name="bookable-teachers"),
    path("slots/", views.TeacherSlotsView.as_view(), name="slots"),
    path("bookings/", views.SupportBookingListCreateView.as_view(), name="booking-list"),
    path("bookings/<uuid:pk>/", views.SupportBookingDetailView.as_view(), name="booking-detail"),
    path(
        "bookings/<uuid:pk>/cancel/",
        views.SupportBookingCancelView.as_view(),
        name="booking-cancel",
    ),
    path("bookings/<uuid:pk>/rate/", views.SupportBookingRateView.as_view(), name="booking-rate"),
    # ─── Student: Ask a Question (tickets) ───
    path("tickets/", views.SupportTicketListCreateView.as_view(), name="ticket-list"),
    path("tickets/<uuid:pk>/", views.SupportTicketDetailView.as_view(), name="ticket-detail"),
    path(
        "tickets/<uuid:pk>/replies/",
        views.SupportTicketReplyView.as_view(),
        name="ticket-reply",
    ),
    path(
        "tickets/<uuid:pk>/status/",
        views.SupportTicketStatusView.as_view(),
        name="ticket-status",
    ),
    # ─── Student: support analytics summary ───
    path("analytics/", views.StudentSupportSummaryView.as_view(), name="student-analytics"),
    # ─── Student: proactive recommendations ───
    path(
        "recommendations/",
        views.SupportRecommendationListView.as_view(),
        name="recommendation-list",
    ),
    path(
        "recommendations/<uuid:pk>/dismiss/",
        views.SupportRecommendationDismissView.as_view(),
        name="recommendation-dismiss",
    ),
    # ─── Teacher: own availability (self-service) ───
    path("availability/", views_staff.MyAvailabilityView.as_view(), name="availability"),
    path(
        "availability/<uuid:pk>/",
        views_staff.MyAvailabilityDetailView.as_view(),
        name="availability-detail",
    ),
    # ─── Staff: manage bookings (row-scoped by teacher FK) ───
    path("staff/bookings/", views_staff.StaffBookingListView.as_view(), name="staff-booking-list"),
    path(
        "staff/bookings/<uuid:pk>/",
        views_staff.StaffBookingDetailView.as_view(),
        name="staff-booking-detail",
    ),
    path(
        "staff/bookings/<uuid:pk>/status/",
        views_staff.StaffBookingStatusView.as_view(),
        name="staff-booking-status",
    ),
    path(
        "staff/bookings/<uuid:pk>/outcome/",
        views_staff.StaffBookingOutcomeView.as_view(),
        name="staff-booking-outcome",
    ),
    # ─── Staff: ticket queue ───
    path("staff/tickets/", views_staff.StaffTicketListView.as_view(), name="staff-ticket-list"),
    path(
        "staff/tickets/<uuid:pk>/",
        views_staff.StaffTicketDetailView.as_view(),
        name="staff-ticket-detail",
    ),
    path(
        "staff/tickets/<uuid:pk>/replies/",
        views_staff.StaffTicketReplyView.as_view(),
        name="staff-ticket-reply",
    ),
    path(
        "staff/tickets/<uuid:pk>/assign/",
        views_staff.StaffTicketAssignView.as_view(),
        name="staff-ticket-assign",
    ),
    path(
        "staff/tickets/<uuid:pk>/status/",
        views_staff.StaffTicketStatusView.as_view(),
        name="staff-ticket-status",
    ),
    # ─── Staff: support analytics (own vs. all) ───
    path(
        "staff/analytics/", views_staff.StaffSupportAnalyticsView.as_view(), name="staff-analytics"
    ),
]
