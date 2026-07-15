"""
DSAT LMS v2 — CRM test factories
Domain: CRM
"""

import factory

from apps.crm.models import Lead


class LeadFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Lead

    name = factory.Sequence(lambda n: f"Lead {n}")
    email = factory.Sequence(lambda n: f"lead{n}@example.com")
    phone = "+998900000000"
    stage = Lead.Stage.NEW
    source = Lead.Source.WALK_IN
