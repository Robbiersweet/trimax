# OCR stuck-pending investigation — 23 October 2026

**INCOMPLETE, not deployed or accepted. No payment applied.** Third morning capture remains unidentified without owner/admin browser capability.

At start neither worker was running and no Trimax/OCR Scheduled Task existed. Host last boot: **Oct22 08:35:12 PDT**; previous worker logs stop around06:01 before boot. These establish a restart gap, not continuous historical health observations.

Only the sealed deployed processor was restored: runtime checkout `C:/Users/robbi/.codex/worktrees/remittance-rebuild-runtime/trimax`, HEAD `eae8c497b2948794c1908619e7d8e9283725dad4`, executable `8d14453bfcd00e7f0bb5a3d46a0641b6a9fd497d`, release `trimax-canonical-money-20261022-rc1`. Real source/config/model/DB validation passed before claim. Restricted credentials unchanged/unexposed; no payment capability.

| Attempt/job | Capture stored PDT, Oct23 | Enqueued PDT | First claim PDT | Previous evidence | Terminal ACK observed PDT |
|---|---|---|---|---|---|
| `3b8f31f8-b587-4c6e-8e9a-a84463914d13` | 09:22:11.317530 | 09:22:12.613879 | 17:20:42.067693 | zero prior claims, empty evidence, no recovery | 17:20:44.776 HTTP422 failed: orientation uncertain, review saved photo |
| `3798915f-7afe-4403-a43d-e80e3487622f` | 09:24:09.760620 | 09:24:10.251134 | 17:20:45.211292 | zero prior claims, empty evidence, no recovery | 17:20:58.152 HTTP200 review, eight extracted rows, check/total unconfirmed |
| Third reported capture | **Unverified** | **Unverified** | **Unverified** | Owner saved-attempt evidence needed | **Unverified** |

Both claim responses reported claims1 AFTER claiming, proving no prior claim. Both reused their original canonical reference and persisted response_ready before terminal acknowledgement. Evidence hashes: first `63c12b929feedcbcc978264898b240ec4a204c2a487ebe3f3238f2ca94892fd7`; second `7a729b5feeb73debe8bb84531d1008e1ddfb836f8352615213cb937b9cea4b8c`. Both paymentCanApplyfalse. No new photograph or payment.

Queue empty at17:20:58.916 does NOT identify/explain the third capture: it could be terminal, unqueued, local-only or outside this pending set. Do not choose an explanation without the owner record. Deployed polling faithfully reported queued state but concealed missing worker health. The verified first failing handoff for the two known jobs is **enqueue → worker claim**. Lease reclaim existed but needed a running worker; no independent deadline/reaper existed.

Normal deployed workers restored: legacy9640/shadow16236 (verify commands before reusing PIDs). Shadow completions also observed: `bb67dea8-5e61-4a27-a982-5ba1c1c42f61`, `62f40b07-5ad6-4d8c-9ae5-eb2d261e70e6`; owner evidence must link their legacy attempts. Proof outside Git: `C:/Users/robbi/AppData/Local/Trimax/stuck-pending-20261023/recovery.jsonl` and worker logs.

## Candidate

Branch `codex/remittance-job-recovery` from deployed eae8c49; no failed photo-robustness experiments copied. No OCR, matching, money arithmetic, financial records, grants to financial tables, split or payment logic changed.

Restricted worker heartbeat separates live activity from last completed-job provenance. Named-pipe singleton supervisor restarts crashes/hangs, children exit on parent disconnect, and installer requires fresh validated child health. Database reaper bounds jobs to30minutes or3expiredclaims, fences stale writers, preserves evidence and saved captures, and explicitly fails unqueued orphans. Mandatory independent pg_cron watchdog continues while Windows host is off. Status/polling distinguish not-enqueued, queued, running, recoverable-stalled, persistence-pending, failed/review and unavailable worker. Existing chunk/hash/lease/provenance recovery remains.

**Candidate SQL/scheduler NOT installed; supervisor NOT operational; web NOT deployed; source/fingerprint seals NOT finalized.** An interim Scheduled Task was registered, tested, then REMOVED: native Task Scheduler could not find the script that the execution environment can read. Simple scheduled commands work; direct script invocation works. No host-access bypass attempted. Registration is not installation acceptance.

## Validation and remaining gates

Development runner:90code-check scripts, fullnpmtest, lint, TypeScript, direct production build, eight frozen documents both engines. **16/16 retained replays PASS**; application/payment/split/tenant checks pass. Two initial SQL test invocations lacked TRIMAX_PGLITE_MODULE; both passed with the existing pinned PGlite runtime. Original failed observations remain; supplemental report records corrections and latest changed-test checks. Latest lifecycle test includes real child-process crash/restart plus real isolated SQL for reclaim, retry/deadline bounds, stale writes, orphan/shadow jobs, failure authority, credentials/grants and owner/business isolation. Client deadline tests cover unavailable/stalled states. PowerShell parses. Read final supplemental-report.json before claiming completion.

This is DEVELOPMENT evidence, not a genuine sealed PRE/POST receipt. No source/runtime/DB evidence fabricated. Full release remains blocked by browser capability, third owner record, host-visible supervision installation, reviewed migration/scheduler/fingerprint, seal and actual production checks.

Resume using the EXISTING signed-in app.rnlcreations.com tab; no new context/login, cookie reset, preview owner checks or rescan. Account for third capture, inspect all3 terminal reviews, legitimately install host-visible supervision and reviewed database watchdog, record actual fingerprints, seal and run full PRE, push/deploy/switch under existing authorization, run full POST and owner saved-scan verification. No payment. Do not deploy the separate photo branch, whose physical corpus still fails.
