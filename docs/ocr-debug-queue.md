# OCR Debug Queue and stable attempt links

This is an inspection layer over durable OCR history. No camera, extraction, matching, duplicate, reconciliation, payment, correction, split, Queue, job-session or tax decisions change.

## Routes and access

- `/admin/ocr-attempts?business=<workspace-slug>`: owner/admin Debug Queue.
- `/admin/ocr-attempts/<uuid>?business=<workspace-slug>`: permanent attempt detail. Without a workspace parameter, the server derives the correct workspace from the RLS-authorized attempt and redirects to its canonical URL.
- Payments → Recent Scans also links to the queue and each attempt page.
- Server requests verify the signed-in Supabase user and the existing `trimax_is_business_admin` helper. Unauthorized identities receive no attempt evidence. Database RLS protects direct REST queries independently of navigation visibility. The view uses `security_invoker=true`; no service-role client or public sharing is introduced.
- Copy Attempt Link copies the stable internal route. Sign-in and owner/admin workspace access remain required. Existing login behavior is unchanged: after signing in, reopen the original link if necessary.

## Lightweight queue

The default Needs Investigation filter includes uninvestigated failed/review/duplicate/apply-blocked attempts, inconsistent successful summaries, and pinned attempts. Clean successful scans appear only when explicitly choosing All Recent or opening history/direct links.

Quick filters: Needs Investigation, Failed, Review Required, Pinned, All Recent. Server reads at most 31 summary/metadata rows (30 displayed plus next-page detection), with timestamp/ID keyset pagination. Existing business/recent and original-attempt indexes support these reads. There is no diagnostic table join or diagnostic preload.

## Investigation annotations

`ocr_attempt_debug` contains only status, a note (2,000 characters), related regression/fixture ID (160 characters), investigated/resolved timestamps and last editor/time. Statuses:

- Needs Investigation
- Investigated
- Regression Covered
- Resolved

`trimax_update_ocr_debug` checks the actual authenticated workspace role and updates this separate table only. It never edits `ocr_attempts.summary`, immutable diagnostic payloads or retention. Marking investigated/regression-covered does not mark resolved. Resolved requires an explicit save after applicable repair/acceptance; reopening clears the resolved timestamp. Page visits and deployments never resolve a case automatically.

## Evidence inspection

The detail page first loads the compact summary, annotations and small original/retry relationship list. Original/Previous/all listed retry links are directly addressable. Compare attempts in separate tabs; no separate diff engine is introduced.

The existing Recent Scans evidence viewer is reused for details, pinning, compact copy and Create Debug File. Full diagnostics load only after explicit expansion or file creation. Raw JSON is not rendered/stringified until Raw Diagnostics is opened. Expired reports leave a permanent summary/metadata page with an explicit unavailable message.

Credential-shaped fields and bearer/JWT values are redacted at the inspection boundary without mutating the stored evidence. OCR word tokens and coordinates remain visible. The retention scheduler, canonical payment image workflow and history persistence logic are unchanged.

## Investigation procedure

1. Open the queue and select the newest Needs Investigation attempt, or open a supplied UUID permalink.
2. Check build, source, header, row count, reconciliation and blockers.
3. Expand What Trimax Saw and Candidate Decisions; inspect Raw Diagnostics when complete source/OCR/row/resolution evidence is needed.
4. Follow original/retry links to identify the first divergent stage. Do not infer success from a deployed build or missing evidence.
5. Save an investigation note/status separately. Link a regression identifier when one actually exists. Physical acceptance remains authoritative where required.

## Validation

`npm test` includes server authorization/filter/read tests, retry linkage, expired summary rendering, lazy diagnostics, copy-link correctness, credential redaction and metadata-only writes. Existing history/export/outbox tests and unchanged golden/OCR/duplicate/payment regressions remain in place. The rollback-only SQL regression checks actual RLS, anonymous/non-admin denial, metadata isolation and explicit-only resolution.
