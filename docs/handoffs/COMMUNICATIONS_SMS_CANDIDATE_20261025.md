# Communications candidate — October 25, 2026

## Boundary and baseline

Candidate starts at verified live source `885d01f18b1811de7f2be8fe33ec9d8858056d20` (deployment `6G2N5TMoymwBRm48NKrtt8Qbr7Xc`). No production database, environment, credentials, deployment, scheduler, customer SMS or email changed. Existing October 19 **human-confirmed iPhone notification navigation** remains accepted; this candidate is not new physical acceptance.

## Implemented

- Separate tenant-scoped communications outbox follows the proven claim/lease/compare-and-set pattern. Existing scheduling outbox requires a request foreign key, so cannot safely represent invoice/payment communication for ordinary clients. Existing push/email outbox is preserved; request-linked communication alerts feed its existing push channel.
- Test adapter and Twilio adapter; no network call in test adapter. All nonproduction environments force test mode or disabled. Hosted test dispatch/preferences writes require explicitly isolated Supabase URL and reject known production project. Production defaults disabled; each business also defaults disabled with per-business sender/account/credential-reference settings.
- Explicit consent version/source/time on public request, independent of contact consent. E.164 validation; delivery-time consent checks; STOP suppression; verified START clears existing opt-in suppression only; HELP/inbound history. Web opt-in cannot clear a STOP. Twilio Advanced Opt-Out must supply STOP/START/HELP responses; the application avoids an extra billable response.
- Idempotent request received, accepted, appointment confirmation/reschedule/cancellation, 24h/1h reminders from durable request activity. Supersedes obsolete reminders; rechecks current Queue start/end/completion immediately before send. Quiet hours are evaluated in workspace time zone (including overnight windows). Deferred reminders are rechecked again after quiet hours.
- Estimate/invoice messages observe successful existing email-send audit entries and verify same-business document and client. Recorded batch-payment audit additionally requires positive actual stored paid amount; draft invoices never imply payment. No financial writes or payment reconciliation changes.
- Signed Twilio inbound/status hooks bind workspace by configured account and destination/source number, exact configured public URL and HMAC signature; durable unique webhook receipts prevent replay. Later `sent` cannot downgrade `delivered`. Replies never approve/book work. Provider errors and replies create persistent owner alerts, request-linked push alerts, and Communications audit history.
- Secure 256-bit expiring capability links, stored as hashes, resolve only same-business appointment or associated client document. Appointment links read current state, use existing calendar generator and stable Queue UID, including cancellation/revision support from scheduling workstream. Document view exposes only a short customer-facing summary; full document remains the existing emailed PDF. No internal notes, service-role key, predictable request-reference access, or registration required.
- Owner Communications inbox, audit and monthly estimated segments/cost summary. Owner preferences control milestones, quiet hours/time zone and monthly limit; preferences endpoint cannot activate a sender or change credentials. Provider billing/fees are not represented as verified actual cost.
- Unknown send outcomes/timeouts/expired leases are **uncertain**, require operator/provider reconciliation, and are not automatically retried. Twilio message creation lacks an app-level idempotency key: blindly retrying could duplicate a real SMS. Explicit rate-limit rejection retries with bounded backoff; at most five attempts. New activation does not replay historical queued messages.

## Integration

1. Apply candidate `20261025_communications.sql` **only after separate migration approval**, then workflow consent-intake replacement RPC `20261025_service_request_consent_intake.sql`. SMS checkbox payload fields: `smsConsent`, `smsDisclosureVersion`; exact version `transactional-sms-2026-10-25`. Intake server sets timestamp and `public-web` source. Scheduling migration supplies appointment revision/status/previous timestamps used by secure calendar endpoint. Apply `20261025_sms_queue.sql` after that migration.
2. Add tests to coordinated release gate: `node --experimental-strip-types scripts/communications-regression.ts` and `node scripts/communications-sql-regression.cjs` and `node scripts/communications-queue-regression.cjs`. Run full source, OCR/payment/Queue and hosted gates before deployment; no manifest was re-frozen in this workstream.
3. `GET /api/communications?business=slug`, owner bearer JWT; `PATCH` changes safe preferences only. UI `/admin/communications?business=slug`; existing notification center links here.
4. `GET /api/communications/deliver` requires existing CRON_SECRET. `POST /api/communications/webhooks/twilio` requires signed provider body and exact `TRIMAX_SMS_PUBLIC_ORIGIN` HTTPS origin. Callback path must match exactly, with no query.
5. Production outbound requires `SERVICE_REQUEST_SMS_ENABLED=enabled`, workspace `enabled=true`, registered sender/account, and `TRIMAX_SMS_<credential_key>_AUTH_TOKEN`. None was provisioned or activated. Keep customer email's existing flag independently disabled.
6. Candidate scheduler SQL reuses existing private `trimax_scheduler.http` and Vault credential, creates a **paused** dedicated job. It never installs `pg_net`, rotates credentials or changes current push scheduler. Explicit activation required after acceptance.

## Remaining acceptance / limitations

- No actual SMS provider, number, registration, sender ownership, real SMS delivery or STOP/HELP handset acceptance tested. Owner must approve provider/sender/campaign and secure credential provisioning; no purchase or paid infrastructure added. Verify Advanced Opt-Out and signature callbacks against a controlled number, then approve production activation independently.
- Local PostgreSQL fixture and adapter tests are not hosted preview or production evidence. Real carrier billing reconciliation is not implemented; usage is estimated, actual-cost field is reserved and remains null.
- Existing individual-invoice, deposit and batch payment UI pathways all use `/api/payments/apply-batch` and its verified `invoice.batch_payment_applied` audit. Their shared adapter is covered; speculative legacy `invoice.paid` labels are not treated as a recorded payment. Any future new payment path must emit verified durable events. Split-group send summary uses its verified root document; individual split documents remain the existing email workflow.
- Both request-linked and direct Queue timed appointment changes generate reminders. Direct Queue uses `20261025_sms_queue.sql` after workflow-experience migration, explicit same-business client ID or linked-estimate client, rejects conflicting identity, and skips date-only/unmapped/unconsented records. No property-name matching. Queue/revision keys avoid duplicates; current client/phone is checked again before delivery and capability viewing. Unlinked inbound messages are visible/audited in Communications but cannot be forced into existing request-only push outbox; no fabricated requests are created.
- Capability document summary is not an online document-signing/payment portal. Requests for more information do not yet have a public capability reply form; inbound SMS replies are supported.
- Per-business monthly cap counts message attempts accepted/uncertain plus in-flight reservations, not a guaranteed carrier spending cap. Estimated cost excludes carrier surcharges and fees. Provider sends after network outcome uncertainty must be reconciled manually before retry.
- SMS stop/re-enable deliberately does not replay old backlog. Explicit recovery may requeue a reviewed message only after provider reconciliation and current consent/appointment checks.

## Primary sources consulted

- [Twilio webhook signature security](https://www.twilio.com/docs/usage/webhooks/webhooks-security): exact public URL and every form parameter are signed.
- [Twilio status callback behavior](https://help.twilio.com/hc/en-us/articles/360008989454-Tracking-the-Delivery-Status-of-an-Outbound-Twilio-SMS-or-MMS-Message).
- [Twilio Advanced Opt-Out](https://help.twilio.com/articles/31560110671259-How-to-Track-Opt-Out-Opt-In-and-Help-Messages-Using-the-OptOutType-Parameter).
- Existing Telnyx/Twilio comparison retained in `SERVICE_WORKFLOW_DELIVERY_AND_SMS.md`; no new pricing assumption, subscription or account action. Twilio chosen for a contained signed adapter; provider interface permits later Telnyx adapter without replacing lifecycle/outbox storage.

Recovery: disable only SMS global flag/workspace/job, preserve all additive tables and history, keep existing push/email routes and Queue/payment behavior. Do not roll back by deleting customer records or consent evidence.

