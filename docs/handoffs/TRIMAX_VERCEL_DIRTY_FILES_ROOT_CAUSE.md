# Vercel dirty-file forensics — package-lock.json and vercel.json

## Disposition

**Remote root cause remains UNKNOWN. No platform-transformation exception is justified.**
The fresh exact-Node Linux reproduction passes without modifying either file.
The failed Vercel deployment retained filename/status diagnostics, not the modified
file contents. Its Source view exposes the repository source and GitHub revision,
not an attested post-install build-workspace snapshot. It cannot establish the
missing remote working-file hashes/diffs.

The release machinery now captures the requested allowlisted byte/JSON/diff evidence
and independently checks immutable committed HEAD against the seal. vercel.json is
now explicitly included in the sealed source bundle. No dirty-file allowance,
semantic normalization allowance, npm rewrite allowance, or deployment was made.
A green local gate is not proof that the Vercel failure is repaired.

## Scope and provenance

Read: TRIMAX_POSTDEPLOYMENT_RESULT_V3.md, TRIMAX_VERCEL_BUILD_GUARD_REPAIR.md,
TRIMAX_RELEASE_AND_ACCEPTANCE_POLICY.md, and the complete release manifest.
Worktree: C:/Users/robbi/.codex/worktrees/trimax-release-candidate/trimax.
Original working repository was not modified.
Original candidate/main revision: 36fa59df8956afe2ef6988042136b1f03236e3fc.
Failed deployment: BDQMpegnMByHo8azCNi67JrPVw4j.
Serving production recorded in the rollout handoff: b5d0d51ab35a915292e54355d5c582a22876be11,
Ready deployment A6ZKcvjyxFE8483eBofsK9srxhHq. No rollout was attempted here.

## Canonical committed baseline

Baseline is `git show HEAD:<file>` at 36fa59df8956afe2ef6988042136b1f03236e3fc,
not a Windows working copy. Neither actual config nor dependency file was edited.

| File | Git blob SHA | SHA-256 | Bytes | CRLF | LF | UTF-8 BOM |
| --- | --- | --- | ---: | ---: | ---: | --- |
| package-lock.json | ac8d4e04ae4738e54f12c61fe7096b8c9f7aea50 | 0a3c6544b7116f8684cbb757427057ac79640e46c2061835c07164f71373b3cc | 284088 | 0 | 8242 | no |
| vercel.json | e517b1fe9594888d67f05dd3c338b207ba0c2037 | d243baaeae38232c49073439e0207dd72886a94184f08fc028c214642b37a46d | 447 | 0 | 17 | no |

`git check-attr -a` returns no applicable attributes. Explicit text, eol,
working-tree-encoding and filter attributes are all unspecified for both files.
The existing source contract normalizes CRLF to LF; BOM/lone CR remain meaningful.

## Fresh Linux reproduction of rc7

Fresh clone: /home/robbi/trimax-guard-portability/rc7-file-forensics.
Created from a Git bundle of exact 36fa59df8956afe2ef6988042136b1f03236e3fc.
Node v24.21.0; npm 11.19.0. Native Linux Node path:
/home/robbi/trimax-guard-portability/runtime/node-v24.21.0-linux-x64/bin/node.
The exact Vercel npm version remains UNKNOWN: the retained logs establish Node
v24.21.0 and Vercel CLI 62.7.0, not npm's numeric version. Matching Node alone is
not proof of matching Vercel's selected npm.

Starting checkout was clean. Ran only npm ci first. It exited 0. Immediately after:
Git status empty; git diff for both files empty; both raw SHA-256 values identical
to the canonical baseline above. Consequently bytes, newline counts and BOM also
match. No changes to lockfileVersion, dependencies, optional/platform packages,
integrity, bundled packages, metadata, whitespace or ordering were observed.
**npm ci did not reproduce a preinstall lockfile rewrite in this environment.**

Then ran the exact command with the committed rc7 receipt:

```sh
export TRIMAX_RELEASE_GATE_RESULT=release/evidence/vercel-portability-result.json
npm test &&
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/remittance-release-gate.ts &&
npm run build
```

Result: PASS. Git status and both-file diff remain empty; hashes remain identical.
Preinstall 2026-10-09T05:32:58.926Z, pretest 05:34:03.438Z, posttest
05:34:45.691Z and prebuild 05:34:45.835Z all list no dirty files. Prebuild is after
the remittance gate; the final independent status/hash check is after build.
No normal command in this sequence changed vercel.json.

Logs: /home/robbi/trimax-guard-portability/rc7-file-ci.log and
/home/robbi/trimax-guard-portability/rc7-file-sequence.log.
Only existing public Supabase build configuration was copied into ignored .env.local;
no worker credential was copied into Linux.

## Remote evidence and classification

At Vercel preinstall 2026-10-09T03:35:05.599Z and prebuild 03:37:33.719Z:
package-lock.json and vercel.json each have tracked working modification ` M`.
No untracked/deleted files were recorded. The service-worker hash matched; it is
not the defect under investigation and its content was not changed.

The build failed with:

```text
Release worktree is dirty; Source bundle differs from manifest; Receipt is incomplete or not for the sealed release
```

The Vercel Source tab was inspected read-only at the failed deployment. Its
vercel.json view links to the exact committed GitHub revision and displays the
three canonical cron definitions and the same buildCommand. This proves only
what the Source view displays. It does NOT prove that the dirty build-workspace
JSON was semantically equal. Clipboard export returned unrelated stale text and
was discarded, not treated as file evidence.

| File | Classification | Proven facts | Missing evidence |
| --- | --- | --- | --- |
| package-lock.json | E: UNKNOWN | Modified by preinstall in Vercel; never modified in local fresh Linux sequence | Remote working bytes/hash, every changed JSON pointer/value, exact producing process, remote npm version |
| vercel.json | E: UNKNOWN | Modified by preinstall in Vercel; never modified in local fresh Linux sequence | Remote working bytes/hash/diff and exact producing process |

No remote byte-only cause, deterministic npm rewrite, Vercel transformation or
semantic change has been proven. No changed remote JSON keys can honestly be
listed. A Vercel-environment-specific difference is observed; attribution to the
Vercel platform itself rather than its invoked tooling remains unverified.

Preinstall is already too late to observe the pristine checkout in this failure.
The first modification occurred at some earlier unobserved point. The original
remote /tmp diagnostic path contains only the old evidence schema; its modified
file bytes were not downloaded or recorded. No build/deployment was run to obtain
new remote evidence because this task expressly prohibits a deployment retry.

## Contract and diagnostics changes

- scripts/release/file-forensics.cjs: only package-lock.json and vercel.json are
  allowed. Captures Git blob ID, committed and working SHA-256/length/newlines/BOM,
  attributes, parsed semantic equality, exhaustive JSON-pointer before/after
  changes, and `git diff HEAD --no-ext-diff --no-textconv --no-color`.
  Credentials accidentally introduced in these files are redacted. No environment
  dump or arbitrary-file contents are emitted. npm user-agent identifies the
  actual package-manager version when supplied by npm.
- scripts/release/build-diagnostics.cjs: includes these comparisons at preinstall,
  pretest, posttest and prebuild; full evidence persists outside the source tree.
  Missing files are explicitly unavailable. This is observation, not authorization.
- scripts/release/contract.cjs: includes vercel.json in sourcePaths; hashes HEAD
  blobs through Git cat-file separately from working files, and compares both to
  the sealed bundle. A clean but unsealed committed config edit now fails too.
- scripts/release/file-forensics-regression.cjs and gate-checks.cjs: mandatory tests
  for dependency/config mutations, unknown metadata rewrite rejection,
  formatting-only rejection, immutable baseline, unrelated source mutation,
  committed-file changes, sanitized diagnostics, wrong receipt/release/bundle.
- Policy explicitly preserves fail-closed behavior and distinguishes semantic
  diagnostics from authorization.

The old dirty check did reject uncommitted vercel.json, but vercel.json was absent
from sourcePaths; committed config changes were not covered by that explicit seal.
Adding it strengthens the requested integrity contract. No rule now accepts a
previously rejected dirty file. A formatting-only dirty JSON change still FAILS;
JSON canonical equality is not used to waive source integrity.

There is no "proven npm rewrite allowed" fixture because no such rewrite was
proven. The adversarial metadata rewrite test explicitly FAILS instead. Inventing
an allowed transformation would violate this task's evidence requirement.

## Safety / unchanged scope

No application/OCR/auth/payment/worker/recognizer/model files changed. No new worker
process was started or restarted. Full-gate private replay invokes existing test
pipelines without production jobs or payment calls. Production RPC use is read-only
attestation. No Supabase schema/configuration, feature flag, worker credential or
Vercel setting changed. No push and no production deployment.
Model bundle, model list, database contract, worker configuration, service-worker
contract, frozen acceptance corpus and runtime-source bundle compare identical to
rc7. Release helper changes are local candidate-only. Physical acceptance remains
PENDING.

## Final candidate and validation

Release: trimax-release-contract-20261008-rc8.
Machinery commit: 5bc2a6b1d1910d11af699dc3c2f5dd39bec2b91f.
Seal commit: bc0e9cc16041fd29da8857134fa2d32369c97500.
Source bundle: 544f1ca5b72267f10e838e3beb9a09c121ebcc85b29ff595206fa9169c120556.
Receipt: release/evidence/checkout-forensics-result.json.
Receipt commit: a6e06e0cc389be918a1e30511a4161e4296d075c.
A subsequent documentation-only commit do not alter executable source.
All commits are local; main was not pushed.

Full predeployment gate ran 2026-10-09T05:35:59.209Z to 05:40:54.413Z.
Private receipt: C:/Users/robbi/AppData/Local/Trimax/release-gates/2026-10-09T05-35-59-208Z/gate-result.json.
Status: READY_FOR_CONTROLLED_DEPLOYMENT. All 84 checks have PASS or the explicitly
permitted deployed-runtime prerequisite status; none failed.
Live DB legacy attestation PASS at 05:36:25.197175Z; v2 PASS at 05:36:27.685930Z.
Deployed runtime attestation remains DEPLOYMENT_PREREQUISITE, never reported as PASS.

| Frozen document | Result | Wrong authoritative totals | Wrong accepted amounts | Wrong invoice tokens | Wrong record IDs |
| --- | --- | ---: | ---: | ---: | ---: |
| check2715 | PASS | 0 | 0 | 0 | 0 |
| check2721 | PASS | 0 | 0 | 0 | 0 |
| check2734 | PASS | 0 | 0 | 0 | 0 |
| check2743 | PASS | 0 | 0 | 0 | 0 |
| A | PASS | 0 | 0 | 0 | 0 |
| D | PASS | 0 | 0 | 0 | 0 |
| B | PASS | 0 | 0 | 0 | 0 |
| C | PASS | 0 | 0 | 0 | 0 |

Lint PASS. TypeScript PASS. Production build PASS. Clean sealed source at start/end PASS.
The receipt retains every test, timing and intermediate rejected observation.
No recognition/acceptance failures were repaired or concealed.

Fresh rc8 Linux clone: /home/robbi/trimax-guard-portability/rc8-file-forensics.
Node v24.21.0 / npm 11.19.0. npm ci PASS with empty Git status. Receipt was then
added through its committed metadata-only revision, without changing source or dependencies.
With TRIMAX_RELEASE_GATE_RESULT=release/evidence/checkout-forensics-result.json:

```sh
npm test &&
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/remittance-release-gate.ts &&
npm run build
```

PASS (exit 0), including release prebuild authorization. Final Git status empty.
Both raw file hashes remain equal to canonical Git blobs; JSON semantic changes
empty and Git diff empty. Committed/working bundle match the manifest.

Linux evidence under /home/robbi/trimax-guard-portability/:
rc8-initial-files.json, rc8-after-ci-files.json, rc8-final-files.json,
rc8-file-ci.log, rc8-file-sequence.log. These retain exact hashes/bytes/JSON/diff
metadata. Windows canonical evidence:
C:/Users/robbi/.codex/worktrees/trimax-release-candidate/rc7-canonical-forensics.json.
Gate log: C:/Users/robbi/.codex/worktrees/trimax-release-candidate/rc8-full-gate.log.

## Final interpretation

- Source-integrity implementation/regression validation: PASS; strictly strengthened.
- Requested remote portability/root-cause repair: **FAIL / UNPROVEN**. Remote modified
  bytes were not retained, and a deterministic transformation was not reproduced.
- Semantic source change detected: none locally; **UNKNOWN remotely**. This is not
  a claim that the remote changes were byte-only or semantically harmless.
- Linux-equivalent build: PASS on the exact Node version, with Vercel npm version
  still unverified.
- Predeployment gate: READY_FOR_CONTROLLED_DEPLOYMENT, frozen acceptance 8/8.
- Ready for final Vercel retry: **NO**. A local PASS does not resolve the missing
  remote diff evidence. No dirty-file bypass is justified.
- Application/OCR behavior changed: NO. Production deployed: NO.

## Files changed

scripts/release/contract.cjs; scripts/release/build-diagnostics.cjs;
scripts/release/file-forensics.cjs; scripts/release/file-forensics-regression.cjs;
scripts/release/gate-checks.cjs; release/trimax-release-manifest.json;
release/evidence/checkout-forensics-result.json;
docs/TRIMAX_RELEASE_AND_ACCEPTANCE_POLICY.md;
this report; the existing untracked TRIMAX_POSTDEPLOYMENT_RESULT_V3.md was preserved
and committed as documentation rather than discarded.

Neither package-lock.json nor vercel.json was modified. The inclusion of vercel.json
in the seal changes integrity coverage only, not deployment configuration.

STOP. WAIT FOR CHATGPT REVIEW. No additional task or deployment was begun.
