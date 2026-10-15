# Disabled scheduling implementation candidate

## Implemented in this task

- sites/rnl/lib/submissionRuntime.ts: explicit server-only transport dispatch; existing static-JWT default retained; direct runtime cached once per process; unknown/direct failures never fall back to another credential.
- sites/rnl/app/api/public-scheduling/[slug]/route.ts: existing protected submission handler now receives the website runtime loader. All preview, slug and production activation checks remain.
- sites/rnl/lib/credentialLifecycle/directRuntimeCandidate.ts: uses packaged shared provider implementation; source gate remains false. No environment switch can activate it.
- src/app/admin/service-requests/components/OwnerWorkspace.tsx and page.tsx: caller-authenticated inbox refresh; same-tick lock; new-request status notice; cross-workspace/duplicate result rejection; failures preserve existing list. Detail edits are not overwritten by refresh. Existing revision-aware review, private notes/history, filters and manual workflow preserved.
- scripts/public-scheduling-owner-ui-regression.cjs: actual component tests for refresh locking, incoming notices and wrong-workspace response rejection, plus existing review retry/revision tests.
- sites/rnl/scripts/submission-runtime-regression.mjs: actual route verifies disabled direct, invalid transport and inactive-production fail closed without network calls.
- sites/rnl/scripts/regression.mjs and package.json: exercise actual transport loader under server-only test conditions.

Minimum new-request alert is the owner inbox notice after authenticated refresh; no claim of unattended push/email. Existing durable outbox intent, synthetic delivery fencing/retry/uncertainty and recipient isolation implementations were retained and passed the development gate. No external sender, hosted dispatch schema or timer was enabled. Manual refresh is explicit, no background polling or extra infrastructure.

## Validation

Active development worktree: complete scheduling-development-gate.mjs 43/43 PASS after these source edits, including SQL/security, owner isolation, dispatcher/recovery, lint, TypeScript and website build.
Isolated candidate: public scheduling suite PASS; owner actual-component regression PASS; direct actual-handler integration PASS; actual-route disabled tests PASS; website regression 77 checks PASS; root TypeScript PASS; changed owner lint PASS; website lint PASS; optimized website production build PASS. Local build only, no deployment.
Existing Node module-type/React test-renderer and Next multiple-lockfile warnings remain. Git diff whitespace check PASS after trimming a pre-existing final blank line in productionRuntime.ts. Heuristic secret scan of candidate changes found zero matches; this is not a formal secret audit.

## Candidate scope and reproducibility

Branch codex/rnl-scheduling-minimum-rc, base e94f321090150db37d6bd0680246a648f89d6ed4. RNL_MINIMUM_RC_CONTENTS.json lists explicitly copied scheduling inputs, including previously tested scheduling fixes. No hosted runner, Auth refresh journal, credential-store lab, secret/private files, OCR/payment edits or experimental history was copied. Dependencies reused through ignored local junctions for validation; repository lockfiles retained for installation on another machine. Existing release guard unchanged. This is a clean source-review candidate, NOT a re-sealed or production-authorized release. Root Trimax production build is still subject to its existing manifest/gate authorization; website build PASS does not satisfy that guard.

## Exact remaining production acceptance sequence

1. Establish permitted private custom-role credential provisioning, with existing postgres password unchanged. No password experiment or policy workaround.
2. Revalidate Section52 exact approved manifest and six hashes, project, ACL/RPC fingerprints/capacity; run bounded pilot and verified revocation/cleanup. No submission in pilot.
3. Review this source candidate, aggregate connection budget and durable restricted credential custody/rotation. Prepare exact final executable release identity. Source activation gate changes require separate review; false remains in this commit.
4. Obtain scoped production permissions/credential, disabled deployment and acceptance authorization; preserve internal Trimax release guards. No general pilot approval substitutes for deployment approval.
5. Verify real provider connectivity, owner access, exact runtime/database identity and protected baseline. Enable intake only in approved acceptance window; submit exactly one controlled synthetic request with real Turnstile/rate limiting, inspect persisted record and activity, owner reload/review and idempotency as explicitly authorized. Never convert or send real notifications.
6. Compare protected state and required runtime health. Failures keep/return intake disabled; preserve requests; use approved role/grant/session containment when necessary. Promote public availability only after explicit go/no-go acceptance. No installed-iPhone OCR acceptance is inferred.

Credential/pooler acceptance, aggregate serverless budget, release seal, actual provider/owner acceptance and explicit public activation remain blocked. Real notification delivery remains separately unverified and disabled; manual owner inbox operation requires acceptance if chosen for minimum launch. No production mutations, deployments, customer submissions, credential changes or notifications occurred in this task.
