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

Model weights are pinned by SHA-256 and version/path. Node package versions are pinned by
the lockfile; WSL package versions and model paths are recorded separately. Missing model,
credential-scope, configuration, database or source evidence means FAIL, never an assumed match.

## Gates

Run `npm run trimax:release-gate` from the release candidate. Output and private crops go to
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

The candidate's `npm run build` has a `prebuild` guard requiring a matching PASS receipt
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
