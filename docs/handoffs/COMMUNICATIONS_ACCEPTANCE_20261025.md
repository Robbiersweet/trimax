# Communications acceptance checkpoint — 2026-10-25

Workspace communications-acceptance, based on 50e656c. No deployment, production writes, credentials, real messages, registration, purchase or new infrastructure.

## Implemented and verified

Existing SMS tests pass: 40 base SQL, 21 direct Queue, 21 customer reply, plus simulated provider/signature/template checks. Coverage includes consent, tenant separation, STOP/START replay, unknown START, terminal delivery status, obsolete appointments/reminders, same-day behavior, quiet hours, monthly cap, unknown provider outcome, retries and verified financial audit events. This is simulated acceptance, not carrier delivery or physical SMS acceptance. The separately confirmed physical iPhone web-push acceptance remains valid evidence for the deployed original implementation.

Added request-email test provider forced off production and requiring EMAIL_TEST_SUPABASE_URL exactly equal the isolated database URL. Production project ref is rejected. SERVICE_REQUEST_EMAIL_TEST_MODE=enabled permits existing CRON-authenticated worker to claim email only in previews, with stable test-email-ID references and no network transport. Response labels emailSimulated.

Production email now requires SERVICE_REQUEST_EMAIL_ACTIVATED_AT in addition to the existing verified-sender/business/key and enable flags. Older backlog is terminally recorded rather than sent. Send-time checks reject changed recipient/consent, obsolete request approvals and stale appointment/reminder snapshots. New private email claim/finish functions leave push behavior unchanged. Durable email_first_attempt_at prevents resends after 23h because Resend only retains idempotency keys for 24h. Such rows require provider reconciliation, not automatic resetting. New 24h/1h request-linked reminders are future-only and superseded on reschedule/cancellation. No direct-Queue-only email reminders are claimed.

35 email template/transport/current-state assertions, 15 isolated email SQL assertions, TypeScript and targeted ESLint pass. New candidate migration: supabase/migrations/20261025_request_email_acceptance.sql, after existing request-delivery migration. Include actual-catalog inherited-grant replay and hosted isolated acceptance before deployment.

## Audit limitations

Provider acceptance is not mailbox delivery; no Resend bounce/delivery webhook exists in this workflow. Existing estimate/invoice send-email routes remain protected and unchanged. Request emails use safe plain text; they do not yet contain customer capability links or an email-only information-reply path. Secure SMS information replies and document links work only where SMS consent/current phone identity exists. Do not manufacture SMS consent to enable email replies. A generic email capability requires an explicit recipient-bound design. No customer email or SMS activation is performed here.

## Costs checked against official pages

[Twilio US pricing](https://www.twilio.com/en-us/sms/pricing/us): US SMS base $0.0083 per inbound/outbound segment; long-code number $1.15/month, toll-free $2.15/month; additional carrier and registration fees. [Twilio registration fees](https://help.twilio.com/articles/1260803965530-What-pricing-and-fees-are-associated-with-the-A2P-10DLC-service) depend on business/campaign type.

[Telnyx messaging pricing](https://telnyx.com/pricing/messaging): base $0.004 per inbound/outbound part, plus carrier fees, separate number and 10DLC costs. Example arithmetic: 500 two-part outbound messages = 1000 parts, base $8.30 Twilio versus $4 Telnyx, before carrier/number/registration/tax and inbound traffic. Actual templates with long private URLs can exceed two parts. Telnyx adapter is not implemented; at this volume changing provider saves only $4.30 base per month, so reuse the tested Twilio adapter unless broader verified requirements justify switching. No account or purchase initiated.

[Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys): key deduplication lasts 24h; implementation uses 23h replay cutoff to leave margin.

## Separate activation requirements

1. Owner approves exact provider/account, sender number purchase or existing-number use, registration costs/campaign, business identity and consent disclosures. Do not port an existing business line implicitly.
2. Complete applicable 10DLC registration or toll-free verification. Verify sender supports inbound SMS and configure Advanced Opt-Out/HELP/START replies; exercise them on owner's test handset.
3. Store Twilio auth token only in server environment TRIMAX_SMS_<credential_key>_AUTH_TOKEN; configure account SID/sender/business mapping and exact HTTPS TRIMAX_SMS_PUBLIC_ORIGIN. Signed inbound/status callback URL is /api/communications/webhooks/twilio. Do not expose token in chat/logs/client.
4. Apply reviewed candidate migrations and release-gated code under production approval. Keep SMS globally disabled until provider callback, consent, tenant and synthetic delivery acceptance pass. Then configure per-business provider, milestone selection, timezone/quiet hours and cap, followed by approved global SERVICE_REQUEST_SMS_ENABLED. Existing activated_at excludes historical SMS backlog.
5. For email: verify sender domain and mailbox/reply handling; configure existing RESEND_API_KEY, SERVICE_REQUEST_EMAIL_FROM and SERVICE_REQUEST_EMAIL_BUSINESS_ID securely; set the exact activation timestamp; approve a controlled owner-address delivery and verify receipt before customer enablement. SERVICE_REQUEST_EMAIL_ENABLED remains independent of SMS. Report provider accepted separately from mailbox delivered.
6. Confirm scheduled worker points to matching deployed revision. Run controlled request→owner notification→client/Queue→schedule/reschedule/cancel with owner recipients only. Verify real SMS delivery, STOP suppression, HELP, START, signed status replay, customer private links and reminder cancellation before claiming live SMS acceptance.
7. Recovery: disable only affected outbound channel, preserve rows and audits, reconcile uncertain provider IDs before retrying. Never replay historical dead letters automatically or reset suppression. Existing production rollback checkpoints remain untouched.

Resume: integrate candidate commit, add both request-email regression scripts to gate, apply migration to isolated catalog rehearsal, and use workflow_ui's lab runner with preview test flags. Live activation requires the separate approvals above.
