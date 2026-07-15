"""
DSAT LMS v2 — Automation admin URLs
Domain: Automation
Description: Mounted at /api/v1/admin/. IsAdmin on every view.
"""

from django.urls import path

from .views_admin import (
    AutomationCatalogView,
    AutomationLogListView,
    AutomationRuleDetailView,
    AutomationRuleListCreateView,
    AutomationRuleTestView,
    AutomationSweepView,
)

app_name = "automation_admin"

urlpatterns = [
    path("automation/catalog/", AutomationCatalogView.as_view(), name="catalog"),
    path("automation/rules/", AutomationRuleListCreateView.as_view(), name="rule-list"),
    path("automation/rules/<uuid:pk>/", AutomationRuleDetailView.as_view(), name="rule-detail"),
    path("automation/rules/<uuid:pk>/test/", AutomationRuleTestView.as_view(), name="rule-test"),
    path("automation/run/", AutomationSweepView.as_view(), name="run-sweep"),
    path("automation/logs/", AutomationLogListView.as_view(), name="log-list"),
]
