"""
DSAT LMS v2 — Mailer tests
Domain: Mailer
Covers: the limits (they are the point — an unbounded sender is a bill), the
        outbox recording what happened either way, the suppression list, and
        the code lifecycle: hashed at rest, single-use, expiring, attempt-capped.
"""

from datetime import timedelta

import pytest
from django.core import mail
from django.test import override_settings
from django.utils import timezone

from apps.identity.tests.factories import UserFactory
from apps.mailer import codes, quota, service
from apps.mailer.models import EmailMessage, EmailSuppression, VerificationCode

pytestmark = pytest.mark.django_db

VERIFY = VerificationCode.Purpose.VERIFY_EMAIL
RESET = VerificationCode.Purpose.PASSWORD_RESET


def send_one(to="a@dsat.local", kind=EmailMessage.Kind.OTHER):
    return service.send(to, "Subject", "Body", kind=kind)


class TestOutbox:
    def test_a_send_is_a_row_and_a_delivery(self, mailoutbox):
        message = send_one()
        message.refresh_from_db()
        assert message.status == EmailMessage.Status.SENT
        assert message.sent_at is not None
        assert len(mailoutbox) == 1

    def test_the_address_is_normalised(self):
        assert send_one("  MixedCase@DSAT.local ").to_email == "mixedcase@dsat.local"

    def test_a_provider_failure_is_recorded_not_raised(self, mailoutbox):
        with (
            override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend"),
            pytest.MonkeyPatch.context() as patch,
        ):
            patch.setattr(
                mail.backends.locmem.EmailBackend,
                "send_messages",
                lambda self, messages: (_ for _ in ()).throw(OSError("smtp is down")),
            )
            message = send_one()
        message.refresh_from_db()
        assert message.status == EmailMessage.Status.FAILED
        assert "smtp is down" in message.error
        assert message.attempts == 1


class TestSuppression:
    def test_a_suppressed_address_is_never_queued(self, mailoutbox):
        EmailSuppression.objects.create(email="dead@dsat.local")
        with pytest.raises(quota.QuotaExceededError) as exc:
            send_one("dead@dsat.local")
        assert exc.value.reason == "suppressed"
        assert EmailMessage.objects.count() == 0
        assert len(mailoutbox) == 0

    def test_suppression_added_after_queueing_still_stops_delivery(self, mailoutbox):
        message = EmailMessage.objects.create(to_email="late@dsat.local", subject="s", body="b")
        EmailSuppression.objects.create(email="late@dsat.local")
        assert service.deliver(message) is False
        message.refresh_from_db()
        assert message.status == EmailMessage.Status.SUPPRESSED
        assert len(mailoutbox) == 0


@pytest.fixture
def tight_quotas(settings):
    """Small numbers so the limits are reachable in a test, not 2000 sends."""
    settings.MAIL_COOLDOWN_SECONDS = 60
    settings.MAIL_MAX_PER_RECIPIENT_PER_DAY = 3
    settings.MAIL_MAX_CODES_PER_RECIPIENT_PER_DAY = 2
    settings.MAIL_MAX_PER_DAY = 5
    settings.MAIL_RESERVE_FOR_CODES = 2


@pytest.mark.usefixtures("tight_quotas")
class TestQuotas:
    def test_the_cooldown_stops_the_impatient_resend(self):
        send_one()
        with pytest.raises(quota.QuotaExceededError) as exc:
            send_one()
        assert exc.value.reason == "cooldown"
        assert exc.value.retry_after and exc.value.retry_after <= 60

    def test_the_cooldown_is_per_kind(self):
        """A reset code must not be blocked by a verification code sent seconds ago."""
        send_one(kind=EmailMessage.Kind.VERIFY_EMAIL)
        send_one(kind=EmailMessage.Kind.PASSWORD_RESET)  # no raise

    def _sent(self, to, kind=EmailMessage.Kind.OTHER, n=1):
        for _ in range(n):
            EmailMessage.objects.create(
                to_email=to, subject="s", body="b", kind=kind, status=EmailMessage.Status.SENT
            )

    def test_the_daily_recipient_cap_bites(self):
        self._sent("a@dsat.local", EmailMessage.Kind.ANNOUNCEMENT, n=3)
        with pytest.raises(quota.QuotaExceededError) as exc:
            send_one(kind=EmailMessage.Kind.NOTIFICATION)
        assert exc.value.reason == "recipient_daily"

    def test_broadcast_volume_never_blocks_a_code(self):
        """The failure this separation exists to stop: a class that got ten
        announcements this morning being unable to reset a password."""
        self._sent("a@dsat.local", EmailMessage.Kind.ANNOUNCEMENT, n=3)
        send_one(kind=EmailMessage.Kind.PASSWORD_RESET)  # no raise

    def test_codes_have_their_own_smaller_recipient_cap(self):
        self._sent("a@dsat.local", EmailMessage.Kind.VERIFY_EMAIL, n=2)
        with pytest.raises(quota.QuotaExceededError) as exc:
            send_one(kind=EmailMessage.Kind.PASSWORD_RESET)
        assert exc.value.reason == "recipient_daily"

    def test_the_global_cap_stops_everything(self):
        for i in range(5):
            self._sent(f"u{i}@dsat.local", EmailMessage.Kind.VERIFY_EMAIL)
        with pytest.raises(quota.QuotaExceededError) as exc:
            send_one("fresh@dsat.local", kind=EmailMessage.Kind.PASSWORD_RESET)
        assert exc.value.reason == "global_daily"

    def test_bulk_stops_before_the_cap_so_codes_still_get_through(self):
        """MAIL_RESERVE_FOR_CODES: the last slice of the day is kept for people
        locked out of their accounts, not spent on a broadcast."""
        for i in range(3):  # cap 5, reserve 2 → bulk ceiling is 3
            self._sent(f"u{i}@dsat.local", EmailMessage.Kind.ANNOUNCEMENT)
        with pytest.raises(quota.QuotaExceededError) as exc:
            send_one("bulk@dsat.local", kind=EmailMessage.Kind.ANNOUNCEMENT)
        assert exc.value.reason == "global_daily"
        # ...and a code still goes.
        send_one("locked-out@dsat.local", kind=EmailMessage.Kind.PASSWORD_RESET)

    def test_a_refusal_does_not_count_against_the_sender(self):
        """A suppressed row never reached the provider, so it must not use quota."""
        send_one()
        with pytest.raises(quota.QuotaExceededError):
            send_one()  # cooldown
        service.send_quietly("a@dsat.local", "s", "b")  # records a SUPPRESSED row
        assert EmailMessage.objects.filter(status=EmailMessage.Status.SUPPRESSED).count() == 1
        # Two suppressed refusals later, the day's allowance is still 1 used.
        assert quota.usage()["sent_24h"] == 1

    def test_send_quietly_records_rather_than_raises(self):
        send_one()
        assert service.send_quietly("a@dsat.local", "s", "b") is None
        row = EmailMessage.objects.filter(status=EmailMessage.Status.SUPPRESSED).get()
        assert row.reason == "cooldown"


class TestCodes:
    def test_a_code_is_never_stored_in_the_clear(self, mailoutbox):
        user = UserFactory()
        row, plaintext = codes.issue(user, VERIFY)
        assert len(plaintext) == 6 and plaintext.isdigit()
        assert plaintext not in row.code_hash
        assert not VerificationCode.objects.filter(code_hash=plaintext).exists()
        # ...but it does reach the student.
        assert plaintext in mailoutbox[0].body

    def test_it_verifies_once(self):
        user = UserFactory()
        _, plaintext = codes.issue(user, VERIFY)
        codes.verify(user, VERIFY, plaintext)
        with pytest.raises(codes.CodeError) as exc:
            codes.verify(user, VERIFY, plaintext)
        assert exc.value.reason == "no_code"

    def test_issuing_again_retires_the_previous_code(self):
        user = UserFactory()
        _, first = codes.issue(user, VERIFY)
        with override_settings(MAIL_COOLDOWN_SECONDS=0):
            _, second = codes.issue(user, VERIFY)
        with pytest.raises(codes.CodeError):
            codes.verify(user, VERIFY, first)
        assert codes.verify(user, VERIFY, second) is not None

    def test_an_expired_code_is_refused(self):
        user = UserFactory()
        row, plaintext = codes.issue(user, VERIFY)
        row.expires_at = timezone.now() - timedelta(seconds=1)
        row.save(update_fields=["expires_at"])
        with pytest.raises(codes.CodeError) as exc:
            codes.verify(user, VERIFY, plaintext)
        assert exc.value.reason == "expired"

    def test_five_wrong_guesses_burn_it(self):
        user = UserFactory()
        _, plaintext = codes.issue(user, VERIFY)
        wrong = "111111" if plaintext != "111111" else "222222"
        for _ in range(VerificationCode.MAX_ATTEMPTS):
            with pytest.raises(codes.CodeError):
                codes.verify(user, VERIFY, wrong)
        # Even the RIGHT code is dead now.
        with pytest.raises(codes.CodeError) as exc:
            codes.verify(user, VERIFY, plaintext)
        assert exc.value.reason == "too_many_attempts"

    def test_purposes_do_not_cross(self):
        user = UserFactory()
        _, verify_code = codes.issue(user, VERIFY)
        with pytest.raises(codes.CodeError):
            codes.verify(user, RESET, verify_code)

    def test_one_students_code_is_useless_to_another(self):
        mine = UserFactory()
        theirs = UserFactory()
        _, plaintext = codes.issue(mine, VERIFY)
        with pytest.raises(codes.CodeError):
            codes.verify(theirs, VERIFY, plaintext)

    def test_a_refused_send_leaves_no_live_code(self):
        """Issuing is atomic: a code nobody was told about is a dead end."""
        user = UserFactory()
        codes.issue(user, VERIFY)
        before = VerificationCode.objects.filter(consumed_at__isnull=True).count()
        with pytest.raises(quota.QuotaExceededError):
            codes.issue(user, VERIFY)  # cooldown
        assert VerificationCode.objects.filter(consumed_at__isnull=True).count() == before

    def test_purge_drops_only_old_rows(self):
        user = UserFactory()
        row, _ = codes.issue(user, VERIFY)
        assert codes.purge_expired() == 0
        VerificationCode.objects.filter(pk=row.pk).update(
            created_at=timezone.now() - timedelta(days=10)
        )
        assert codes.purge_expired() == 1
