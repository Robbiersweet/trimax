# Trimax Vercel Preview Forensics — rc8

## Scope and release identity

Workstream A only. Existing release candidate `codex/trimax-release-contract` at
`1aef6d56a15a5344a28b3671f372a070ddb5c663` was clean and authorized locally.
Release: `trimax-release-contract-20261008-rc8`.
Executable machinery: `5bc2a6b1d1910d11af699dc3c2f5dd39bec2b91f`.
Sealed source bundle: `544f1ca5b72267f10e838e3beb9a09c121ebcc85b29ff595206fa9169c120556`.

Read the dirty-files root-cause report, build-guard repair report, release policy,
manifest, checkout-forensics receipt and parallel-workstream-a receipt.
Both receipts are READY_FOR_CONTROLLED_DEPLOYMENT with eight frozen documents PASS.
Fresh local `authorize-build.cjs` against the parallel receipt passed with no
localFailures. No application source, worker, model, OCR or payment change was made.

The known historical Production failure is deployment
`BDQMpegnMByHo8azCNi67JrPVw4j`, source `36fa59df8956afe2ef6988042136b1f03236e3fc`.
Its two dirty files were first observed at preinstall. Their modified bytes were
not retained by the historical diagnostic schema. This report does not retrospectively
invent those missing bytes or attribute their creator without evidence.

## Canonical baseline

| File | Git blob | SHA-256 | Bytes | CRLF | LF | BOM |
| --- | --- | --- | ---: | ---: | ---: | --- |
| package-lock.json | ac8d4e04ae4738e54f12c61fe7096b8c9f7aea50 | 0a3c6544b7116f8684cbb757427057ac79640e46c2061835c07164f71373b3cc | 284088 | 0 | 8242 | no |
| vercel.json | e517b1fe9594888d67f05dd3c338b207ba0c2037 | d243baaeae38232c49073439e0207dd72886a94184f08fc028c214642b37a46d | 447 | 0 | 17 | no |

No applicable Git attributes are returned for either file. Local baseline evidence
is outside Git at `C:/Users/robbi/.codex/worktrees/trimax-release-candidate/preview-forensics-local-baseline.json`.
Preinstall is an observation after package tooling has begun, not a pristine checkout claim.

## Authorized Preview deployment and exact fresh evidence

Only the non-secret Preview environment setting was added:
`TRIMAX_RELEASE_GATE_RESULT=release/evidence/parallel-workstream-a-result.json`.
The separate Production setting was not changed. Branch push was exclusively
`codex/trimax-release-contract`; main remained
`36fa59df8956afe2ef6988042136b1f03236e3fc`. No promotion, production deployment,
worker start, job submission or physical test occurred.

First diagnostic Preview: `BjKkNL28n4CdV8Fhm9tp1W8e22Lh`, exact rc8 HEAD above.
It FAILED after 2m40s at 2026-10-09T22:27:34Z. It ran in iad1/Washington DC,
2 cores/8 GB, clone 4.411s, and restored build cache from the existing Ready
Production deployment `A6ZKcvjyxFE8483eBofsK9srxhHq`; this was NOT cold-cache.
Node v24.21.0, npm 11.19.0, Vercel CLI 62.7.0.
The npm user agent was `npm/11.19.0 node/v24.21.0 linux x64 workspaces/false ci/vercel`.

Preinstall at 2026-10-09T22:25:03.105Z already had exactly the two tracked ` M`
files. Prebuild at 22:27:31.292Z retained the same hashes/diffs. Terminal error:
`Release worktree is dirty; Source bundle differs from manifest; Receipt is incomplete or not for the sealed release`.
The receipt check includes actual source identity; receipt-path correctness alone
cannot authorize a mutated working bundle.

Full sanitized remote record, including raw Git diffs and JSON changes:
`release/evidence/rc8-preview-file-forensics.json`.
It was read from the rendered Vercel Build Logs DOM. Stale clipboard output was
not used. Original private collection:
`C:/Users/robbi/AppData/Local/Trimax/preview-forensics/remote-preinstall-summary.json`.
No secret was present or exposed in the two allowlisted file comparisons.

| File | Working SHA-256 | Bytes | CRLF | LF | BOM | Semantic result |
| --- | --- | ---: | ---: | ---: | --- | --- |
| package-lock.json | f59c4191dbab35152626d37ecd849e1c20d17564df0cf62d2dbac122dff062b9 | 284120 | 0 | 8243 | no | one root metadata addition |
| vercel.json | 471510cb78bbf804feac04290af8a0b5ae512751b1cf5d6d9b4472380fe74233 | 357 | 0 | 1 | no | equal; no changed JSON values |

### package-lock.json: classification B, deterministic package-manager metadata

The ONLY JSON change is pointer `/packages//hasInstallScript`:
`{"absent":true}` -> `true`. The empty middle segment denotes `packages[""]`,
the root package. Exact diff excerpt:

```diff
       "name": "trimax",
       "version": "0.1.0",
+      "hasInstallScript": true,
       "dependencies": {
```

A fresh isolated Linux clone with Node v24.21.0/npm 11.19.0 running **npm install**
reproduced the EXACT remote bytes/hash and this single JSON change. Earlier npm ci
runs did not rewrite the lockfile. The root actually has a committed preinstall
script, so this is factual lifecycle metadata, not a new dependency or executable
script. No version, dependency, integrity, resolution or package set changed.

The remote process that wrote the file was not instrumented before preinstall;
its exact PID/call stack remains UNKNOWN. The local npm-install reproduction
proves a deterministic npm rewrite matching remote bytes, not an observed remote
process trace. Logs/evidence:
`/home/robbi/trimax-guard-portability/preview-npm-install.log` and
`preview-npm-install-files.json`.

### vercel.json: classification A, byte-only JSON serialization

Parsed JSON is exactly equal, JSON changes `[]`. The working bytes equal:
`JSON.stringify(JSON.parse(committed Git blob)) + "\n"`.
This produces EXACTLY 357 bytes and SHA-256
`471510cb78bbf804feac04290af8a0b5ae512751b1cf5d6d9b4472380fe74233`.
All three cron paths/schedules and the buildCommand remain identical.
No semantic configuration injection occurred. npm install/ci/test/build locally
did not produce this formatting rewrite; it was observed in the Vercel build
before preinstall. The exact writer within the remote checkout/build tooling is
UNKNOWN; cache restoration alone does not establish causation.

Unlike the old historical build, this fresh Preview supplies the missing actual
working hashes and diffs. The historical files cannot be reconstructed with
certainty retroactively; the fresh reproduction explains the same failure class.

## Narrow repair: commit deterministic bytes, keep integrity strict

No exception or normalization rule was added to the guard. Instead:

1. Commit the true root `hasInstallScript: true` lockfile metadata.
2. Commit semantically identical compact vercel.json plus LF.
3. Reseal these exact committed bytes as rc9 and run the entire release gate.

This makes both source files match the demonstrated tooling output before the
build. Genuine dependency/config changes, unknown metadata rewrites, unrelated
source changes, dirty formatting, wrong receipts/releases/bundles still fail under
the unchanged rules. The existing file-forensics/portability/gate-state/contract
adversarial suites all passed in the fresh full gate.

Guard SHA-256 values are byte-identical to rc8 committed blobs:

| File | SHA-256 |
| --- | --- |
| scripts/release/contract.cjs | 8c31ccb39c813f371db61b7e4c64e413ebec5a6528030666bcec741aeba1c8bb |
| scripts/release/authorize-build.cjs | 88c7d10b41262c22f4415b3af851adc606441f18a57370a55c0049b29bed11b7 |
| scripts/release/gate-state.cjs | f56bdc9741b07b92c53bb487f21320080537fa90734721130612e8c1b52da839 |

## rc9 validation

Release `trimax-release-contract-20261009-rc9`.
Source commit `b9e4bb12852df0fb53084d5f237034e152f2148c`.
Seal `772063e30e78558500423ee4ad9757af35598db7`.
Source bundle `9914536ca189a9c39c47934ccc0abc91a2e26d63e97a78269059d5433c0e2c03`.
Receipt/evidence commit `c4f08b76c20da1d218d1a12e76648c57e0b9e15b`.

Full predeployment gate 2026-10-09T22:26:49Z–22:31:57.645Z:
**READY_FOR_CONTROLLED_DEPLOYMENT**. Frozen check2715/check2721/check2734/check2743/
A/D/B/C all PASS (8/8). Each document has wrong authoritative totals 0, wrong
accepted row amounts 0, wrong invoice tokens 0, wrong record IDs 0.
Live DB attestation PASS: legacy 22:27:17.787119Z, v2 22:27:20.281226Z.
Deployed candidate worker attestation remains DEPLOYMENT_PREREQUISITE, not PASS.
Lint/TypeScript/production build/clean source all PASS.
Physical acceptance remains PENDING.

Receipt `release/evidence/parallel-workstream-a-result.json` now records rc9.
The prior rc8 receipt is preserved as `release/evidence/rc8-preview-baseline-result.json`.
Complete private gate output:
`C:/Users/robbi/AppData/Local/Trimax/release-gates/2026-10-09T22-26-49-514Z/`.

Fresh Linux clone `/home/robbi/trimax-guard-portability/rc9-preview` uses the same
Node24.21.0/npm11.19.0. npm install, npm ci, npm test, remittance-release-gate and
receipt-guarded npm run build all PASS. Final Git status empty; both file hashes
remain byte-equal to committed normalized blobs after all tools. Logs/evidence
under `/home/robbi/trimax-guard-portability/`: rc9-npm-install.log, rc9-npm-ci.log,
rc9-tests.log, rc9-build.log, rc9-after-install.json, rc9-final-files.json.

No application/OCR/auth/payment/model/worker implementation changed. No schema,
Production flag/environment, worker permission or business data was changed.
Only the Preview branch was pushed for the verification build; no main push.

## Final remote verification — Preview PASS

Second Preview: **H44vhMFixuseVsVtAbkjRJ4954nG**.
Source **c4f08b76c20da1d218d1a12e76648c57e0b9e15b**, environment **Preview**.
Hostname `trimax-7f98pm305-trimax-s-projects.vercel.app`.
Dashboard terminal state **Ready**, duration **2m26s**, 2026-10-09T22:35:08Z
(October 9, 2026, 3:35:08 PM PDT). Assigning Custom Domains: Skipped.

Preinstall 22:32:46.059Z, posttest 22:34:16.761Z, prebuild 22:34:17.086Z:
Git files `[]`, differences `[]`. Both files have committed=working hashes,
bytesEqual true, semantic.equal true, changes `[]`, gitDiff empty.

| File | New committed Git blob | Committed AND working SHA-256 | Bytes | LF |
| --- | --- | --- | ---: | ---: |
| package-lock.json | f9cdddd17069e3c545570dd17a7a90efadb1243a | f59c4191dbab35152626d37ecd849e1c20d17564df0cf62d2dbac122dff062b9 | 284120 | 8243 |
| vercel.json | 819a96df83da939eded2e7a67d85147022b4e377 | 471510cb78bbf804feac04290af8a0b5ae512751b1cf5d6d9b4472380fe74233 | 357 | 1 |

Both have zero CRLF and no BOM. Same Node24.21.0/npm11.19.0/VercelCLI62.7.0.
Prebuild explicitly reported:
`Exact sealed release authorized for build; predeployment readiness is not final release PASS; physical acceptance remains separate`.
Next16.2.6 compilation completed in12.4s; the terminal Ready state confirms the
complete Preview build, not merely the compile step.

Durable raw diagnostic evidence: `release/evidence/rc9-preview-preinstall.json`
and `release/evidence/rc9-preview-prebuild.json`. These were read from the rendered
Vercel log by the coordinating agent and preserved without credential content.
The local report/evidence commit after c4f08b7 is documentation-only, not pushed;
there was no third build trigger.

## Final disposition and production boundary

- Preview build: **PASS** after the proven byte/metadata normalization.
- package-lock cause: missing true root install-script metadata, exactly reproduced
  by npm11.19.0 install; no dependency change.
- vercel.json cause: JSON compaction plus LF only; no semantic configuration change.
- Remote writing process: not observed; no claim of a specific Vercel internal writer.
- Integrity contract relaxed: **NO**. All strict guard code remains byte-identical.
- Ready for a separately approved controlled Production rollout retry: **YES**.
- Production release/receipt settings were NOT updated for rc9; a future controlled
  rollout must deliberately select the reviewed rc9 receipt and perform deployed
  runtime attestation. Preview readiness is not coherent live-worker attestation.
- Serving production remains the prior b5d0d51 release; no app.rnlcreations.com
  replacement, main push, worker switch or physical acceptance occurred here.
- Physical acceptance: **PENDING**.
- Application/OCR/payment behavior changed: **NO**.
- Public scheduling worktree/files included: **NO**.

Files changed in this workstream: package-lock.json (one true metadata field),
vercel.json (format only), release manifest (rc9 identity/seal), acceptance receipt,
preserved rc8 receipt, remote forensic evidence JSON, and this report.
Commits pushed only to the Preview branch: b9e4bb12852df0fb53084d5f237034e152f2148c,
772063e30e78558500423ee4ad9757af35598db7,
c4f08b76c20da1d218d1a12e76648c57e0b9e15b.
Final report/evidence commit remains local and changes no sealed executable source.

STOP. WAIT FOR CHATGPT REVIEW.
