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
]
