# OCR stuck-pending investigation — 23 October 2026

Production lifecycle repair deployed and postdeployment gate PASS; installed-iPhone confirmation remains pending. No payment applied. Scope is the TWO confirmed captures; the user explicitly withdrew the uncertain third-scan requirement.

## Evidence and first failing boundary

Both captured images and durable jobs existed. At investigation start neither legacy nor shadow worker was running and no Trimax/OCR startup task existed. Host boot was Oct22 08:35:12 PDT; previous logs stopped around06:01 before boot. There was no historical live-health table, so continuous health at each enqueue cannot be reconstructed. Both first claim responses reported claims1: neither job had ever been claimed. Before recovery there was no OCR checkpoint/result/terminal acknowledgement. The first failed handoff was **durable enqueue → worker claim**, not image recognition, upload, financial arithmetic, or UI result parsing.

All times below are Oct23 Pacific. Attempt ID equals legacy job ID.

| Attempt/job | Image stored | Enqueued | First claim | Terminal persistence | Result |
|---|---|---|---|---|---|
| `3b8f31f8-b587-4c6e-8e9a-a84463914d13` | 09:22:11.317530 | 09:22:12.613879 | 17:20:42.067693 | 17:20:44.405264 | failed422, orientation uncertain; saved-photo review required |
| `3798915f-7afe-4403-a43d-e80e3487622f` | 09:24:09.760620 | 09:24:10.251134 | 17:20:45.211292 | 17:20:57.781053 | review200, eight extracted rows, document total unconfirmed |

Expected claimant was the restricted R&L legacy worker; the shadow worker was diagnostic only. Restoring the previously sealed deployed processors recovered both original IDs and canonical image hashes without a new photograph. Both persisted response_ready and a terminal status. First last stage: response_ready. Second: orientation_complete → pass_complete → ocr_complete → response_ready. Both now have saved OCR evidence, owner-visible terminal states, and Apply allowed No. Associated original shadow attempts `bb67dea8-5e61-4a27-a982-5ba1c1c42f61` and `62f40b07-5ad6-4d8c-9ae5-eb2d261e70e6` also completed with review results. There were exactly two morning storage captures/two legacy jobs/two shadows. Polling originally reflected genuine queued state, but lacked worker-health/deadline information and no independent process could terminate abandoned work.

These are terminal processing outcomes, **not successful document recognition or physical OCR acceptance**. No unsupported total or invoice was promoted.

## General repair

- Restricted worker heartbeat, validated before claim, separates current health from last completed-job release provenance.
- Named-pipe singleton supervisor restarts a crashed child after 5 seconds and terminates a child without a successful health acknowledgement for 120 seconds. Child disconnect terminates orphan workers. Startup validation still pins clean source, models, runtime, database, project, business, config and restricted credentials.
- Existing lease/hash/chunk/provenance recovery and stale-writer fencing remain. Expired jobs can be reclaimed;3 expired claims or an absolute 30-minute budget produce an actionable terminal failure, never a synthetic successful OCR result.
- Independent database pg_cron reaper runs every minute even if the Windows host is offline. It also accounts for diagnostic shadow timeouts and saved-but-not-enqueued captures. Evidence, canonical photos and audit history remain retained.
- Owner-only status returns queued/running/recoverable-stalled/completion-persistence-pending/terminal states and health. Client wait is bounded to 90 seconds with saved-scan recovery messages. Reopen resumes the existing ID through the idempotent enqueue/status boundary.
- No OCR inference, client matching, invoice selection, money, split, reconciliation or payment-application algorithm was changed.

## Actual production installation

Release `trimax-ocr-job-lifecycle-20261023-rc1`; common executable `e28196c99a592a46ef9ade0fc86825288fe6ddef`; deployed metadata/build `4432439bcee110d14a9def3d7257698ae133e54b`. Main was fast-forwarded after genuine PRE readiness. Vercel production deployment `5hsxXQvDjVRFDPcMEYj2QaagjYRE` is Ready/Latest/Current, alias `app.rnlcreations.com`. Owner checks used only the existing authenticated production origin; no login, cookie/storage reset or preview-host owner workflow was used.

Atomic committed database install at2026-10-24T01:58:13.240594Z: schema fingerprint `2c889492d0b90aed1c83e36a20464df87bd3c1041e7b409ef6ab0f94bd2ab72b`, all 5 reviewed catalog hashes matched. Policy and trigger hashes unchanged. Actual pg_cron job 4 `trimax-ocr-watchdog` is active every minute; real autonomous run history showed succeeded, including02:11, 02:12, 02:13 UTC. Exact forward/rollback rehearsal restored all 5 previous hashes before the actual installation. Rollback SQL and original byte-exact function definitions remain private; it preserves jobs/evidence/financial data.

Native host-visible runtime: `C:/Users/robbi/AppData/Local/Trimax/ocr-native-runtime/trimax`, deployed4432439. Existing restricted configuration/keys copied unchanged to owner+SYSTEM protected `.../ocr-native-runtime/config`; no credentials/grants expanded. Task `Trimax OCR Supervisor` is enabled/Running, same-user Interactive/Limited, logon plus minute recovery triggers, hidden launcher. Windows denied S4U registration; no elevation, password, permission bypass or security weakening was attempted. Therefore OCR execution requires the logged-in Windows session; the independent DB watchdog still guarantees bounded actionable failure while that host/session is unavailable. Do not promise before-login/offline OCR execution. Temporary native staging/probe tasks were exported privately then removed after use. Old unsupervised workers were verified and stopped at cutover.

## Production retained-image and interruption verification

| Diagnostic attempt | Source original | Actual result |
|---|---|---|
| `5137071b-3864-4d83-9baf-fd99bd71b248` | 3798915f | review200 at02:08:08.864654UTC; normal deployed processing |
| `70380de2-a659-4554-8f8f-8edf798c14b2` | 3798915f | controlled worker crash, same ID reclaimed and completed review200 |
| `ac65aa66-bea6-40e6-8f12-b2c3b66e48ee` | 3b8f31f8 | failed422 at02:10:41.203257UTC; actionable orientation message |

Controlled crash: legacy child 34092 was verified by full script/config command and stopped at02:08:53.995UTC after pass_complete. Supervisor 4688 restarted child 3820, validated by02:09:04. Existing job lease expired naturally02:11:53.102837UTC; same job reclaimed02:11:58.128774UTC with claims 2; response_ready persisted02:12:14.828145UTC and terminal review02:12:14.938445UTC. No timestamp/state manipulation, duplicate attempt, duplicate completion or payment side effect. Client stopped indefinite spinning at its 90-second bound; reopening the saved scan resumed this same job and displayed the terminal review when available.

All three diagnostic shadow jobs also completed. Both ORIGINAL morning scans were reopened from saved scans: same terminal orientation failure / total-unconfirmed review, Confirm and Apply Payment disabled. No new job was created by reopen. Latest web/legacy/v2 release identities all matched in owner diagnostics. Actual DB health was fresh for both engines and there were zero pending legacy jobs.

Financial baseline and postverification: 272 invoices; ordered financial-state SHA256 `cf101f6aa4b62dc253edcd83c11569e5a781bcccf9ae2fa061fef5fef6e62744` unchanged; zero `invoice.batch_payment_applied` activity since investigation began. Neither new nor existing payments were applied.

## Validation / release evidence

Private evidence root: `C:/Users/robbi/AppData/Local/Trimax/stuck-pending-20261023`. Contains morning database audit, original owner diagnostics, actual recovery ACKs, byte-exact rollback, real install fingerprints, health/cron/job states, controlled interruption and terminal recovery, saved-resume UI evidence, financial before/after checksums, screenshot and genuine gate reports. Credentials and retained image bytes stay outside Git.

PRE `release-gates/2026-10-24T01-47-26-797Z/gate-result.json`: READY_FOR_CONTROLLED_DEPLOYMENT;119 checks, all 8 frozen documents both engines PASS; lint/TypeScript/build PASS. Prior runtime/DB prerequisites correctly recorded before installation. First PRE invocation failed only missing public build environment; preserved, superseded by genuine complete success. Development full `npm test` also passed. Real isolated SQL tests cover queued/running/stalled/terminal, crash reclaim, retry/deadline exhaustion, stale writes, orphan/shadow records, failed-result authority, restricted credentials/grants and owner/tenant isolation. Real child-process tests cover crash restart; deterministic supervisor tests cover hangs.

POST `release-gates/2026-10-24T02-11-06-328Z/gate-result.json`: PASS, all 119 checks and 8 documents / 16 engine replays PASS, including actual production worker/database attestation, lint, TypeScript and production build. Exact receipt is tracked at `release/evidence/remittance-job-lifecycle-postdeployment.json`. Physical installed-iPhone confirmation remains pending. No new scan required for lifecycle confirmation; reopen an existing saved morning scan and verify it returns the saved terminal result without an endless spinner. Leave payment unapplied.
