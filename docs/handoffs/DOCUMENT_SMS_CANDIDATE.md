# Explicit document SMS candidate

Isolated worktree document-sms, base07cf1d8. Candidate only; no hosted schema/data changes, provider activation, real messages, release seal or full gate.

Document pages now have Queue document text, separate from email. Endpoint POST /api/communications/documents uses existing bearer owner/admin authorization and exact approved lab preview gating. Production global SMS must already be activated separately. RPC additionally requires per-business enabled/milestone, current client explicit matching SMS consent and no suppression. Only issued estimates Sent/Accepted/Approved and invoices Sent/Partial/Paid/Overdue qualify; drafts/cancelled/unknown states remain private. Existing Mark Sent can establish issued status without sending email; this action itself never changes document status, money, payment or financial activity logs.

Mutation UUID remains stable for retries; conflicting reuse rejects. Queue result is not delivery. Existing worker, quiet hours, cap, signed callbacks and secure document viewer are reused. A new lease trigger suppresses manually queued messages whose document status/client/business is no longer eligible. Links independently revalidate current document on access. No new send transport or scheduler.

Migration 20261026_document_sms_request.sql follows communications migration (and normal full upgrade chain). It adds authenticated-owner RPC and private trigger; explicitly removes inherited execute grants before granting only the authenticated RPC. Add actual-catalog role projection and this regression to next release gate; no current release fingerprint/seal updated here.

Local validation: document-sms-regression.cjs16 assertions (including tenant denial, disabled settings, no consent, STOP, retry mismatch/dedup, null/draft status, withdrawn document suppression, no email dependency, unchanged invoice/money/activity, inherited restricted-role denial); TypeScript noEmit and targeted ESLint pass. These do not establish hosted or provider acceptance.

Remaining: integrate, project against actual catalog/grants, full gate/reseal, approved isolated migration/deployment and normal document-page controlled simulated acceptance. SMS remains separately disabled until approved activation. Payment reminders are outside this focused change.
