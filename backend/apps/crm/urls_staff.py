"""
DSAT LMS v2 — CRM staff URLs
Domain: CRM (front-office leads); mounted at /api/v1/staff/. IsFrontOffice.
"""

from django.urls import path

from .views_staff import (
    FollowUpTaskDetailView,
    LeadActivitiesView,
    LeadBoardView,
    LeadConvertView,
    LeadDetailView,
    LeadListCreateView,
    LeadTasksView,
)

app_name = "crm_staff"

urlpatterns = [
    path("leads/", LeadListCreateView.as_view(), name="lead-list"),
    path("leads/board/", LeadBoardView.as_view(), name="lead-board"),
    path("leads/tasks/<uuid:pk>/", FollowUpTaskDetailView.as_view(), name="task-detail"),
    path("leads/<uuid:pk>/", LeadDetailView.as_view(), name="lead-detail"),
    path("leads/<uuid:pk>/convert/", LeadConvertView.as_view(), name="lead-convert"),
    path("leads/<uuid:pk>/activities/", LeadActivitiesView.as_view(), name="lead-activities"),
    path("leads/<uuid:pk>/tasks/", LeadTasksView.as_view(), name="lead-tasks"),
]
