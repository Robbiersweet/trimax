# Controlled production rollout V2 — STOPPED

## Outcome

The rollout stopped at stage 3, Vercel production build. The release guard rejected the build. No repair, bypass, redeployment, worker launch, health job, or physical acceptance test followed the failure.

## Release identity and fresh preflight

- Release: `trimax-release-contract-20261008-rc5`.
- Machinery: `155353b42e2abfb5e7ab671f560bbb745100971e`.
- Seal: `3c3e59b5dfbadd8e7a9a2085b31dbefcf30b7dd9`.
- Exact candidate pushed: `64fcc72c5ed8024438c9dc8998879601f6640e1f`.
- Executable source bundle: `f412373f1800ffadc6637d92bc7f7cfa5dbc33aa982b58db24a56dc7f83f6aed`.
- Candidate worktree: `C:\Users\robbi\.codex\worktrees\trimax-release-candidate\trimax`.
- Worktree clean before push; local manifest failures: none; source bundle matched.
- Local release build authorization passed with the committed predeployment receipt.
- Supabase project: `gqknefosisnsjuzmhvts`.
- Fresh live DB attestation: legacy PASS at `2026-10-09T01:43:06.774136Z`; v2 PASS at `2026-10-09T01:43:12.296229Z`.
- Runtime observation: `2026-10-09T01:43:12.592Z`. Both deployed worker records remained `DEPLOYMENT_PREREQUISITE`; live database PASS is not a deployed-worker PASS.
- Legacy queue: queued 0, running 0, failed 2, review 5.
- V2 queue: queued 0, running 0, completed 37, failed 1.
- Local worker process check found no matching legacy/shadow worker processes. Neither worker was launched or replaced.

## Authorized rollout actions completed

1. Added Vercel Production-only `TRIMAX_RELEASE_GATE_RESULT=release/evidence/live-attestation-repair-result.json`. This is a non-secret build receipt path. It remains configured; no flags or credentials changed.
2. Pushed the exact candidate HEAD to `main` through the existing Git remote. Fast-forward from `b5d0d51ab35a915292e54355d5c582a22876be11`; no merge or new code commit.
3. Observed the automatic Vercel deployment through its terminal failure.

No OCR, capture, auth, payment, model, frozen-truth, database schema, RPC, or trigger changes were made in this task.

## Exact failed stage and evidence

- Stage: 3 — deploy web production.
- Deployment: `EZ7U8q31oMBRqFDcpd9X5EU6egcL`.
- URL: https://vercel.com/trimax-s-projects/trimax/EZ7U8q31oMBRqFDcpd9X5EU6egcL
- Deployment hostname: `trimax-9969tkvft-trimax-s-projects.vercel.app`.
- Candidate source: `64fcc72c5ed8024438c9dc8998879601f6640e1f`.
- Failure logged approximately `2026-10-09 01:46:39 UTC` (October 8, 6:46:39 PM PDT).
- Reported build duration: 1 minute 54 seconds.
- Node: `v24.21.0`.

```text
/vercel/path0/scripts/release/authorize-build.cjs:7
if(failures.length)throw Error('Release build blocked: '+failures.join('; '));
                   ^
Error: Release build blocked: Release worktree is dirty; Service worker hash mismatch
    at Object.<anonymous> (/vercel/path0/scripts/release/authorize-build.cjs:7:26)

Error: Command "npm test && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/remittance-release-gate.ts && npm run build" exited with 1
```

VERIFIED: local preflight was clean and matched the seal; Vercel's build guard reported both errors above.

UNKNOWN: which files were dirty inside the Vercel checkout, the actual service-worker digest there, and the underlying cause of those discrepancies. This task stopped without investigating or repairing the failed checks. The errors are not evidence by themselves of a particular line-ending, generation, or checkout cause.

## Serving production after failure

- Production still serves the previous Ready deployment `A6ZKcvjyxFE8483eBofsK9srxhHq`.
- Serving production SHA: `b5d0d51ab35a915292e54355d5c582a22876be11`.
- Remote `main`, verified after failure: `64fcc72c5ed8024438c9dc8998879601f6640e1f`.
- PRODUCTION = MAIN: NO. The candidate push succeeded but the candidate build failed; the prior production deployment remains serving.
- `https://app.rnlcreations.com/` returned HTTP 200 at `2026-10-09T01:49:01Z`.
- Authenticated Payments and release diagnostics were not verified. The browser showed login, and the rollout stopped before those acceptance steps.
- No successful candidate service-worker/build identity verification occurred.
- No rollback was performed; the failed deployment did not replace the serving production deployment.

## Remaining stages — not executed

| Stage | Result |
| --- | --- |
| Web candidate deployment | FAIL — build guard |
| Fresh live database attestation | PASS |
| Legacy deployed-worker attestation | NOT ATTEMPTED — deployment prerequisite unmet |
| V2 deployed-worker attestation | NOT ATTEMPTED — deployment prerequisite unmet |
| Unified deployed identity | NO |
| Worker synthetic/non-payment health jobs | NOT RUN |
| Full postdeployment release gate | NOT RUN — rollout FAIL/blocked |
| Physical acceptance | PENDING |

The new candidate workers were not started. No claim, OCR execution, result persistence, pairing, idle-health, or worker coexistence result is asserted for this rollout.

## Acceptance and test evidence — scope distinction

The committed PREDEPLOYMENT receipt `release/evidence/live-attestation-repair-result.json` records `READY_FOR_CONTROLLED_DEPLOYMENT`, frozen acceptance 8/8, wrong authoritative totals 0, wrong accepted row amounts 0, wrong invoice tokens 0, wrong record IDs 0, and passing regressions/lint/TypeScript/local build.

Those are prior predeployment results. They were NOT rerun as a successful postdeployment matrix in this task. No postdeployment PASS, common-runtime PASS, or installed-iPhone acceptance is claimed. The Vercel production build failed regardless of the prior local build result.

## Business/payment safety

All 18 business-table row counts and SHA-256 checksums were freshly read before rollout and again after failure. Every count and checksum matched. The checksum method sorts each table's `to_jsonb(t)::text` using C collation, joins with newline, converts to UTF-8, and hashes with SHA-256.

- Payment/business state changed: NO, across the recorded 18-table safety snapshot.
- Apply-payment endpoints called: NO.
- Synthetic or physical OCR jobs created: NO.
- Worker credential scopes changed: NO.
- Payment-write capability granted: NO.
- Feature flags changed: NO.
- Workers started/stopped/replaced: NO.

Private evidence:

- `C:\Users\robbi\AppData\Local\Trimax\controlled-rollout-v2-20261008\before.json`
- `C:\Users\robbi\AppData\Local\Trimax\controlled-rollout-v2-20261008\after.json`
- `C:\Users\robbi\AppData\Local\Trimax\live-attestation-repair-20261008\rollout-v2-preflight.json`

## Final disposition

Runtime coherence is not established: production web remains on the previous revision and deployed candidate worker attestations are absent. The source/build guard additionally detected discrepancies inside the failed build. This is not a verified common release.

READY FOR ONE INSTALLED-IPHONE PHYSICAL ACCEPTANCE TEST: NO.

Exact blocker: Vercel release build guard rejected the candidate with `Release worktree is dirty; Service worker hash mismatch`.

This report is an uncommitted documentation artifact written after the stop. No repair was made, no checks were weakened, and no further rollout was attempted. WAIT FOR CHATGPT REVIEW.
