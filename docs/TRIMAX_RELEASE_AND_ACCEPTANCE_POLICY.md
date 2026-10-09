# Trimax release and acceptance policy

## Completion rule

No production repair is considered complete merely because unit tests pass, lint passes,
build passes, retained replay passes, or Codex reports success. A defect is fixed only when
its relevant acceptance gate passes. Any new production defect must add a regression
fixture before repair is considered complete. Any production OCR/capture/auth change must
pass the entire frozen acceptance suite before deployment.

## One release identity

`release/trimax-release-manifest.json` is the contract. A candidate starts from the deployed
commit in a separate worktree. Experiments are never copied wholesale into that candidate.
Web, legacy and v2 name the same committed executable revision. A subsequent metadata-only
seal commit can contain the manifest, reports and documentation; it cannot alter the
executable source paths checked by `scripts/release/contract.cjs`. The manifest pins both
the executable commit and the normalized UTF-8/LF SHA-256 bundle of tracked executable
files. All uncommitted tracked or untracked changes cause failure. This resolves the
self-referential problem of putting a commit's own hash inside that commit without using
a placeholder or accepting arbitrary descendant code.

The database fingerprint covers public columns, defaults, constraints, indexes, RLS
enablement, public function definitions/ACLs, public triggers, public/storage policies,
and public table grants. Only the read-only attestation function itself is excluded from
the function fingerprint; its source is pinned in the executable source bundle. A schema
fingerprint is not a migration ledger. Re-freezing a fingerprint requires review.

Catalog-v1's frozen digest joins sorted `name=value` entries with CRLF bytes
`0D 0A`, encoded as UTF-8. SQL must express this as `chr(13)||chr(10)`;
an editor's literal newline or an LF-only escape is not equivalent. The
2026-10-08 attestation repair preserves all five original database hashes and
coverage. Its regression independently hashes catalog rows in JavaScript,
checks installation self-exclusion, caller contexts and SQL file newline
invariance, and rejects the former LF-only serialization.

Model weights are pinned by SHA-256 and version/path. Node package versions are pinned by
the lockfile; WSL package versions and model paths are recorded separately. Missing model,
credential-scope, configuration, database or source evidence means FAIL, never an assumed match.

## Gates

Run `npm run trimax:release-gate -- --mode=predeployment` from the release candidate; use `--mode=postdeployment` for final deployed verification. Output and private crops go to
`%LOCALAPPDATA%/Trimax/release-gates`, never Git. Every test is attempted; an early failure
does not suppress later evidence. Failures are recorded, not repaired by the gate.

- `CODE_GATE_PASSED`: committed clean source, release integrity and required code checks pass.
- `RETAINED_REAL_GATE_PASSED`: frozen real images run through unchanged production pipelines;
  accepted amounts/totals/IDs are correct; previously automatic documents do not regress;
  review-only cases do not silently promote. Missing evidence fails, not skips.
- `PHYSICAL_ACCEPTANCE_PENDING`: default after all local/replay work. It is not a code failure
  and is never converted to physical success by a fixture/replay.
- `PHYSICAL_ACCEPTANCE_PASSED`: human-verified installed-iPhone production evidence for this
  exact release/deployment, source/model/DB identities and stable attempt/capture links.
  `scripts/release/physical-acceptance.cjs` validates that explicit operator evidence. It does
  not perform or fabricate the physical test. Evidence must include capture lifecycle,
  login stability, legacy review, diagnostic-only v2 and no unintended payment.

No wrong accepted amount, total, invoice record ID, automatic row/document, duplicate payment,
or unsafe promotion of ambiguous evidence is acceptable. Historical review-only cases retain
that expectation until a separate evidence-backed baseline review approves promotion.

## Truth and privacy

The eight retained documents are historical regression evidence, not fresh acceptance.
Verified annotations and historical read-only business snapshots supply truth. OCR outputs
do not supply expected answers. Scoring truth enters only after inference; only canonical
bytes and the existing frozen business snapshot reach the production resolver.
Unknown payor/date/record IDs stay null with provenance. Private image bytes/crops remain
outside Git. A/B/C/D are independent document families, not multiple captures counted as
new documents. B/C remain historically exposed holdouts and are not training inputs.

## Worker contract

Candidate workers validate before loading/claiming work and again before each claim.
They reject dirty source, wrong source bundle, missing/changed models, wrong project,
wrong configuration, non-anonymous API credentials, and missing/mismatched read-only
database credential-scope attestation. Mismatch exits before claim; no fallback to old code.
The SQL attestation is candidate-only until separately approved for installation.
This task does not replace or restart existing production workers and cannot retroactively
attest their in-memory modules. Diagnostics label absent attestations as runtime drift.

Worker autostart/supervision, reboot/logoff recovery and live health heartbeat remain an
explicit infrastructure release requirement, deferred from this task. Last-job identity
is not a live heartbeat. Existing processes can still run old code until a separately
approved release switch; this policy does not pretend otherwise.

## Deployment discipline

No deployment or production worker switch occurs in the baseline task. Local candidate
commits are permitted and must be reported. Production acceptance requires a reviewed
manifest, code and retained gates, followed by actual installed-iPhone evidence. Do not
remove compatibility paths, adjust OCR/authority rules, or change fixtures to turn a failing
baseline green. A gate failure is a recorded baseline fact pending review.

The candidate's `npm run build` has a `prebuild` guard requiring a matching POSTDEPLOYMENT PASS or PREDEPLOYMENT READY_FOR_CONTROLLED_DEPLOYMENT receipt
through `TRIMAX_RELEASE_GATE_RESULT`. The gate itself calls the Next build binary directly
to measure build success without a recursive prebuild dependency. A successful build alone
does not authorize deployment. Existing Vercel settings and branch protection are not changed
by this task; direct build-command overrides and administrator bypass are not claimed to be
prevented. No current production enforcement is claimed until the candidate is reviewed and
activated. The pinned private PGlite 0.5.8 test runtime is supplied through
`TRIMAX_SQL_TEST_RUNTIME` (default `%LOCALAPPDATA%/Trimax/phase6-dbtest`).

## Candidate-only validation and deployment prerequisites

A missing production attestation RPC (HTTP 404 / PGRST202) is explicitly recorded as
`DEPLOYMENT_PREREQUISITE`, never PASS. Unchanged old production workers also remain a
deployment prerequisite, not proof against the new candidate. Other failures, including
credential denials, wrong hashes and network errors, remain FAIL. A complete release cannot
be PASS while prerequisites remain. Local SQL validation is labeled LOCAL VALIDATION and
does not imply PRODUCTION INSTALLED. No production SQL is installed by the release gate.

The gate runs a real standard `npm ci`; it does not reuse a historical installation label.
Tesseract cache files use `os.tmpdir()/trimax-ocr/tesseract-js-7/eng`, outside source, with
the exact English traineddata hash pinned in the manifest. Cache provisioning must verify
the pinned bytes before startup. Cache location changes do not change OCR parameters.

## Optical evidence / authority boundary

Shared `documentFields/moneyService.ts` prepares source-bound crops and completes mature
numeric observations/consensus. It does not import or call the document-total decision
layer. Its existing preparation adapter still carries the legacy semantic-money envelope
(including the earlier Tesseract authority result); this task does not redesign that
compatibility envelope. It must not make a new authority decision from mature consensus.

`ocrV2/recognition/completeMoneyAuthority.ts` consumes that immutable optical result and
calls the existing document-total authority contract. The shadow pipeline orchestrates
these layers. A numeric consensus alone is not total/payment authority. The foundation
allowlist remains unchanged; the new regression explicitly forbids decision-layer imports
and completion logic in the shared service.

Once primary observations establish complete physical cells, local-contrast observations
can add aligned labels and row-attached evidence but cannot replace primary ownership
bands or fitted geometry. Total localization can select the larger, actually observed
same-field box only with source/overlap/right-edge and complete-token suffix evidence;
conflicting complete observations remain rejected. Neither rule uses frozen truth.

Gate scoring reports intermediate numeric consensuses separately from final authority.
A wrong intermediate value that is rejected remains visible, with provenance and rejection
reason. Wrong final authority, accepted row amounts, invoice tokens and record IDs fail.

## Evidence-driven rollout states

The gate requires an explicit PREDEPLOYMENT or POSTDEPLOYMENT mode. PREDEPLOYMENT
returns READY_FOR_CONTROLLED_DEPLOYMENT only when all required code checks and all
frozen retained documents pass, with at most the runtime/database deployment prerequisites
outstanding. Only these two named checks may have prerequisite status. Missing tests,
duplicate checks, mismatches, network failures and credential denials fail. POSTDEPLOYMENT
requires both attestations and every other check to PASS. Readiness authorizes the sealed
controlled-deployment build; it is not final release PASS or physical acceptance.

Build authorization re-evaluates the receipt rather than trusting its status string, checks
all required check names and corpus members, exact source/release/corpus identities, completion
and a clean source tree. A result from the wrong source or with an omitted failure is denied.

The runtime probe uses the existing read-only RPC with each restricted engine credential.
Only HTTP404/PGRST202 means the RPC is not installed. A successful RPC with no persisted
worker release is a deployment prerequisite; an existing incompatible release is FAIL.
Persisted legacyRelease/v2Release must match release, engine, commit, source, model and runtime
bundles, schema hash and no-payment-write declaration. Project/business/scope/DB/flags are
checked against the authenticated RPC and pinned local configuration. Existing validateStartup
source, itself hash-bound, verifies actual models and sanitized config before emitting a worker
record. No local startup result is substituted for a deployed record. This is completed-job
provenance, not live process liveness; separate rollout worker health verification remains
required. No worker or application behavior was modified for these gate states.

The gate always reports PHYSICAL_ACCEPTANCE_PENDING. Only separately verified installed-iPhone
evidence can establish physical acceptance; neither mode grants it.

## Platform-stable build contract (rc6)

Release text files with extensions .cjs, .css, .js, .json, .md, .mjs, .py, .sql,
.svg, .ts and .tsx are decoded as strict UTF-8 and normalize CRLF to LF before
hashing. BOM and lone CR remain significant. Other assets are hashed as raw bytes;
model/runtime-package byte contracts remain unchanged. public/sw.js uses that
same explicit text contract, rather than a Windows working-tree byte digest.
No application or service-worker content is changed by this rule.

All dirty files still fail closed. Build diagnostics print only file status,
paths, revision and service-worker hash/byte metadata, never file contents or
configuration secrets. npm preinstall, pretest, posttest and prebuild snapshots
are stored outside the repository in os.tmpdir()/trimax-build-diagnostics.
First-observed stage is evidence, not proof of the exact creating command.
A missing initial-checkout snapshot is reported as unverified. These diagnostics
do not whitelist generated files or bypass the manifest/receipt checks.

The explicit text list also includes files named .gitignore. Linux comparison
identified scripts/ocr-v2/training/.gitignore as the only extensionless source
entry converted by Git; it is text, not a binary asset. Other extensionless
files remain raw bytes.

## Committed baseline and two-file checkout forensics

The sealed executable set explicitly includes package-lock.json AND vercel.json.
Integrity compares committed HEAD blobs against the sealed bundle separately from
working-file hashes and Git cleanliness. Metadata-only descendants cannot change
either file. No npm/Vercel dirty-file exception is authorized: the rc7 mutation has
not been reproduced locally and its remote modified bytes were not retained.

Formatting-only JSON edits remain denied when Git reports them dirty. Parsed JSON
semantic equality is diagnostic evidence, not build authorization. Existing strict
UTF-8 CRLF-to-LF source hashing remains unchanged; dependency/configuration edits,
unproven package-manager metadata rewrites and unrelated dirty files fail closed.

Allowlisted build forensics compare HEAD and working package-lock.json/vercel.json:
blob IDs, SHA-256, bytes, CRLF/LF, BOM, JSON-pointer changes and sanitized Git diff.
Secrets accidentally present in these files are redacted. No arbitrary file or
process environment dump is permitted. Preinstall remains a post-tool observation,
not proof of a pristine checkout. npm user-agent is recorded to identify the actual
package manager on a future separately authorized build. No deployment is performed
merely to collect diagnostics in this forensic task.
