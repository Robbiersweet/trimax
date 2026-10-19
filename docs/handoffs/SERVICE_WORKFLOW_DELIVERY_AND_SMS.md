# Delivery readiness and SMS decision — October 18, 2026

## Existing infrastructure and activation boundaries

Verified source: invoices, estimates and Queue reminders use Resend. Vercel environment-name inspection confirms RESEND_API_KEY, VAPID keys, SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET exist for Production and Preview; values were not revealed or tested. Business-domain sender verification and authorization to reuse it for requests remain unverified. The new six-template dispatcher uses the existing Resend API and web-push package. It is disabled in every preview, regardless of credentials.

Production activation requires a separately approved migration/contract rollout, SERVICE_REQUEST_WORKFLOW_ENABLED=enabled, and, independently, SERVICE_REQUEST_DELIVERY_ENABLED=enabled. Push then uses the existing VAPID subscription path. Email also requires SERVICE_REQUEST_EMAIL_ENABLED=enabled, SERVICE_REQUEST_EMAIL_FROM (verified R&L sender), and SERVICE_REQUEST_EMAIL_BUSINESS_ID. Keep these flags unset until acceptance. SMS is never claimed by this dispatcher.

Prepared activation: [Supabase scheduler SQL](../../supabase/sql/2026-10-18-service-request-scheduler.sql) invokes the existing endpoint once per minute only when push/email rows are due or leases expire. Read-only production inspection confirmed pg_cron 1.6.4 and Vault 0.3.1 installed; pg_net 0.20.0 is available but not installed. No Vercel plan upgrade or new scheduler subscription is needed. After production authorization, enable pg_net and provision the existing CRON_SECRET in Vault through the approved secret process, then activate the named job. Do not commit secrets or paste them into retained SQL history. SQL orchestration was tested with disposable extension stand-ins; real pg_net HTTP delivery remains a deployment acceptance check. The scheduler is not activated. Persistent internal alerts remain independent of provider delivery. See [Supabase's supported scheduling pattern](https://supabase.com/docs/guides/functions/schedule-functions).

Claims use channel-specific leases, at most five attempts and bounded backoff. Completion is a lease-token compare-and-set. The outbox records attempt history and sanitized errors. Resend uses the persisted idempotency key; push uses a stable request notification tag. Provider acceptance is not proof of handset or inbox delivery. Provider webhook delivery/bounce tracking is not implemented. A crash after push acceptance can cause a retry; a stable tag reduces duplicate visible notifications but does not guarantee exactly-once OS delivery. Persistent notification and Queue creation are database-unique.

## Verified US list pricing

| Provider | Local SMS outbound / inbound | Local number / month | Fit |
|---|---|---|---|
| Twilio | $0.0083 / $0.0083 per segment | from $1.15 | Reasonable low-volume direct API option |
| Telnyx | $0.004 / $0.004 per part | from $1 + $0.10 SMS capability | Lowest listed base cost; useful hosted-number option |
| Plivo | $0.0077 / $0.0077 listed SMS rate | $0.50 | Current onboarding minimum makes it unsuitable here |

Carrier surcharges, taxes, registration and campaign fees are additional; long or Unicode messages can cost multiple parts. Sources: [Twilio SMS](https://www.twilio.com/en-us/sms/pricing/us), [Twilio numbers](https://www.twilio.com/en-us/phone-numbers), [Telnyx SMS](https://telnyx.com/pricing/messaging), [Telnyx numbers](https://telnyx.com/pricing/numbers), [Plivo SMS](https://www.plivo.com/sms/pricing/us/), [Plivo numbers](https://www.plivo.com/phone-numbers/pricing/).

[Plivo's current availability policy](https://docs.plivo.com/docs/messaging/sms-availability) requires direct-brand sales onboarding with a USD1,000/month minimum commitment for US SMS and excludes ISVs/resellers. This overrides an assumption that its low unit rates imply self-service small-business access.

US business local-number messaging requires brand/campaign A2P10DLC registration. [Twilio fees](https://help.twilio.com/articles/1260803965530-What-pricing-and-fees-are-associated-with-the-A2P-10DLC-service) include brand registration and campaign review, with recurring campaign fees by use case. [Telnyx fees](https://support.telnyx.com/en/articles/5634625-10dlc-fees-and-charges) list $4.50 brand registration, $15 campaign review, and monthly categories including $1.50 low-volume mixed, $2 sole proprietor and $10 customer care. Eligibility determines the category; do not assume the cheapest. [Plivo registration guidance](https://www.plivo.com/docs/messaging/a2p-10dlc/registration-guidelines) also requires registration. Toll-free routes use separate verification.

## Existing business number

No carrier lookup, port or purchase was performed. [Telnyx hosted messaging](https://support.telnyx.com/en/articles/5336668-hosted-sms-messaging-process) can move messaging while retaining the current voice provider for eligible numbers. It requires authorized ownership, LOA and provider documentation. Wireless numbers and Google Voice are excluded by that guidance; provider blocks may require coordination. [Twilio hosted-number eligibility](https://www.twilio.com/docs/phone-numbers/hosted-numbers/hosted-numbers-api/eligibility-resource) is public beta, so access and number eligibility must be confirmed before promising preservation of voice service. A full voice port is not authorized.

Recommendation (engineering judgment): evaluate Telnyx first if retaining the existing number is important and it is eligible; otherwise use a separately approved Twilio local number for a straightforward low-volume launch. Do not choose Plivo under its current minimum. At 1,000 single-part outbound messages, base usage is $4 Telnyx versus $8.30 Twilio, before all other fees; operational simplicity matters more than this difference.

## Planned integration boundaries — not active

Reuse public_scheduling_outbox with channel=sms and a provider adapter; do not couple provider calls to the request transaction. Store a workspace-specific sender and secret reference server-side. Require explicit transactional SMS opt-in with wording/version/time/source; the existing general contact preference is not sufficient activation evidence. Normalize to E.164; honor STOP immediately, allow HELP and deliberate START resubscription, and check suppression again at send time.

Key confirmations/reschedules/cancellations by request and appointment revision. Key reminders by appointment revision and reminder offset; cancel stale reminders on reschedule/cancellation and recheck the live appointment before delivery. Respect configured local quiet hours. Use signed, replay-resistant provider webhooks with unique event IDs for accepted/delivered/failed outcomes and inbound replies. Resolve workspace by configured destination sender, not caller-supplied workspace. Keep customer messages free of internal notes. Future two-way conversations remain owner-visible audit records, never automatic approval or booking. Keep SMS independently disabled until credentials, registered sender, consent and opt-out acceptance all pass.
