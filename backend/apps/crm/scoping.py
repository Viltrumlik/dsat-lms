"""
DSAT LMS v2 — CRM access scoping
Domain: CRM
Description: Row-scoping for the leads pipeline. Coarse role gating (who may hit
    an endpoint) lives in common/permissions.py::IsFrontOffice; this decides WHICH
    leads a given front-office member may see. Out-of-scope → 404 (never 403),
    matching apps/academy/scoping.py.

Row-visibility matrix:
    admin, academic_manager → all leads
    receptionist            → own leads (owner = self)
    anyone else             → nothing
"""

from rest_framework.exceptions import NotFound

from .models import Lead


def scoped_leads(request):
    """Leads the requester may see, as a Lead queryset."""
    user = request.user
    if user.role in ("admin", "academic_manager"):
        return Lead.objects.all()
    if user.role == "receptionist":
        return Lead.objects.filter(owner=user)
    return Lead.objects.none()


def scoped_lead_or_404(request, pk):
    """The lead `pk`, but only if the requester may see it; else 404."""
    lead = scoped_leads(request).filter(pk=pk).first()
    if lead is None:
        raise NotFound("Lead not found.")
    return lead
