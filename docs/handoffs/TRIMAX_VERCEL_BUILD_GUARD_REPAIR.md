# Vercel release-guard portability repair

## Disposition

The service-worker mismatch is proven and repaired in local release machinery. The entire executable-source hash now matches between clean Windows and Linux checkouts. The separate historical Vercel dirty-worktree error was NOT reproduced and its exact files remain UNKNOWN. No dirty-file exemption was added. No deployment, push, worker start, production configuration update, schema/RPC change, or physical scan occurred.

Ready to retry controlled rollout: **NO** until the unresolved Vercel-specific dirty-checkout evidence is reviewed. A passing local Linux build cannot identify the files in an expired remote build workspace.

## Proven hash root cause

The previous service-worker guard hashed raw working-tree bytes. The manifest was sealed from a Windows checkout with core.autocrlf=true. Git's committed blob and the Linux checkout contain LF. The Windows checkout contains CRLF. Removing only CR from CRLF makes the two byte buffers exactly equal. No service-worker content changed.

| Observation | SHA-256 | Bytes | CRLF | LF bytes | BOM |
| --- | --- | ---: | ---: | ---: | --- |
| rc5 manifest / clean Windows working copy | cbef97a011007c67e5c20d54bea593e507926a57fa5161f2c9ddf608e837cd85 | 1560 | 65 | 65 | no |
| Committed Git blob / clean Linux working copy | dba6df014e916ca5ec28619d4cfe89f400c3b6a0f3bc37966bf8bf1c4874c21e | 1495 | 0 | 65 | no |
| New canonical text contract | dba6df014e916ca5ec28619d4cfe89f400c3b6a0f3bc37966bf8bf1c4874c21e | 1495 | 0 | 65 | no |

`git check-attr -a -- public/sw.js` returned no attributes. `.gitattributes` contains only `*.pdf binary`. Windows `core.autocrlf=true` is inherited from `C:/Program Files/Git/etc/gitconfig`; Linux has no configured autocrlf override. No .gitattributes or sw.js changes were made.

The old general source hasher decoded every tracked source-path file as UTF-8, including PNG/ICO files. The repair explicitly distinguishes text and binary. An intermediate Linux validation identified one additional text-policy omission: `scripts/ocr-v2/training/.gitignore`. That filename is now explicitly text. No actual .gitignore content was modified.

## Reproduction before repair

Base commit: `64fcc72c5ed8024438c9dc8998879601f6640e1f`.

Fresh Windows clone: `C:/Users/robbi/AppData/Local/Trimax/guard-portability/windows`.
Fresh Linux clone: `/home/robbi/trimax-guard-portability/linux`.
Linux Node: v24.21.0, matching the failed Vercel log. Official nodejs.org archive SHA-256 verified against the same version's SHASUMS256.txt; extracted only into `/home/robbi/trimax-guard-portability/runtime`. No production runtime was replaced.

| Stage | Windows | Linux |
| --- | --- | --- |
| Initial Git checkout | clean | clean |
| npm ci | completed; clean afterward | completed; clean afterward |
| npm test | FAIL at existing literal LF source assertion in queue-workspace-polish-regression.ts:75; clean afterward | PASS; clean afterward |
| remittance-release-gate.ts | PASS; clean afterward | PASS; clean afterward |
| Original authorize-build | PASS | FAIL: Service worker hash mismatch only |

The remittance gate was run separately on Windows to collect the requested later-stage evidence after npm test failed; this is not reported as a successful `&&` chain. The unrelated Queue test was not repaired or weakened. Its assertion includes a literal newline in a source substring; the fresh Windows source is CRLF.

No modified, deleted, or untracked files were produced by the observed Linux npm ci/test/remittance sequence. No sw.js rewrite was observed. The final raw Windows and Linux sw.js hashes remained those in the table above. Original intermediate per-command SW hashes were not separately captured; the repaired hooks capture those stages for the final run.

## Exact dirty-file finding

The old failed Vercel build `EZ7U8q31oMBRqFDcpd9X5EU6egcL` reported only `Release worktree is dirty; Service worker hash mismatch`. It did not report a filename list. Local fresh Linux reproduction produced no dirty files. Therefore the exact remote dirty paths and their origin remain **UNKNOWN**, not attributed to tests, Vercel, generated output, or line endings without evidence.

No current source or generated file is exempted. Source mutations, unexpected generated source, and untracked files continue to fail. Existing ignored node_modules/.next output follows the repository's existing policy; no ignore entries were added.

## Repair and diagnostics

- `scripts/release/contract.cjs`: explicit strict UTF-8 text extensions plus `.gitignore`; CRLF -> LF only. BOM/lone CR remain meaningful. All other files hash raw bytes. Service-worker hashing uses the same text policy.
- `scripts/release/build-diagnostics.cjs`: Git porcelain-v1 -z status parser records paths/status (including deleted/untracked/renamed paths), HEAD, SW raw/canonical hashes, sizes, newline counts and BOM. It never prints file contents or environment values.
- package.json hooks record npm preinstall, pretest and posttest. authorize-build records prebuild.
- Evidence resides in `os.tmpdir()/trimax-build-diagnostics`, outside source. Each record reports first-observed stage. Missing initial-checkout evidence is explicitly unverified. Preinstall observation is not falsely labeled a pre-npm checkout observation.
- Receipt checks, dirty-tree checks, expected-source checks and committed-source ancestry checks remain fail-closed.
- New portability regression is mandatory in the full release gate.

No OCR/application/worker code or model acceptance rule was changed. Model hashes, model bundle, runtime dependencies, DB fingerprints, flags, acceptance corpus and worker configuration compare identical to rc5.

## Regression coverage

LF/CRLF source equivalence; clean CRLF checkout; actual sw.js change fails; tracked application change fails; unexpected untracked source fails; deletion diagnostics; extensionless .gitignore text; binary bytes remain raw; external temp output leaves Git clean; stage attribution; wrong source; existing wrong-release/missing-check/dirty-receipt denials.

All diagnostics preserve the strict failure, including when a filename is only an initial observation with no proven creating stage.

## Final release identity

Release: `trimax-release-contract-20261008-rc7`.
Machinery commit: `70813dc3237cf078e21a369940df8fadd5981781`.
Source bundle: `cd3e12eac740f9e318b4d5d41f7608e488ecf14f8ed94e169bb352e62041020e`.

Application source changed: NO.
Release machinery changed: YES.
Service-worker script content changed: NO.
Database/models/frozen truth/worker configuration changed: NO.

## Production

Vercel Overview was read during this task and still identifies Ready production deployment `A6ZKcvjyxFE8483eBofsK9srxhHq`, SHA `b5d0d51ab35a915292e54355d5c582a22876be11`, serving app.rnlcreations.com. The latest attempted deployment remains the prior failed EZ7U8q31oMBRqFDcpd9X5EU6egcL. No Vercel setting or environment variable was changed this task. The configured rc5 receipt path will not authorize rc7; it must not be represented as updated.

No push was performed. No workers were started or replaced. The release tests use isolated mocks/disposable data; live production activity is read-only attestation. No payment was applied. Physical acceptance remains PENDING.

## Private evidence

Windows evidence: `C:/Users/robbi/AppData/Local/Trimax/guard-portability/` (forensics.json, Windows install/test/remittance/status logs, rc6/rc7 gate logs).
Linux evidence: `/home/robbi/trimax-guard-portability/` (original and repaired build sequence logs).

WAIT FOR CHATGPT REVIEW. No deployment or further task was begun.

## Final validation results

Final receipt: `release/evidence/vercel-portability-result.json`.
Full private gate: `C:/Users/robbi/AppData/Local/Trimax/release-gates/2026-10-09T02-36-20-408Z/gate-result.json`.

- PREDEPLOYMENT: READY_FOR_CONTROLLED_DEPLOYMENT.
- Frozen real acceptance: 8/8 (check2715, check2721, check2734, check2743, A, D, B, C).
- Wrong authoritative totals: 0.
- Wrong accepted row amounts: 0.
- Wrong invoice tokens: 0.
- Wrong record IDs: 0.
- Lint, TypeScript, production build, clean source at start/end: PASS.
- Live DB attestation: PASS for legacy at 2026-10-09T02:36:41.500499Z and v2 at 2026-10-09T02:36:42.943153Z.
- Deployed candidate worker records: DEPLOYMENT_PREREQUISITE, not PASS. No production worker was launched.
- Windows build authorization with final rc7 receipt: PASS.
- Linux source bundle exactly equals the manifest: cd3e12eac740f9e318b4d5d41f7608e488ecf14f8ed94e169bb352e62041020e; differing files: none.
- Linux npm ci, authorize-build, npm test, remittance gate, npm run build, post-build authorize-build: PASS.
- Linux final Git status: empty.

The exact production-equivalent command was run with TRIMAX_RELEASE_GATE_RESULT set to the committed rc7 receipt:

```sh
npm test && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/remittance-release-gate.ts && npm run build
```

Linux posttest observation at 2026-10-09T02:42:06.616Z, prebuild at 02:42:06.745Z, and post-build validation at 02:42:19.312Z all report an empty dirty-file list and the same raw/canonical SW hash dba6df014e916ca5ec28619d4cfe89f400c3b6a0f3bc37966bf8bf1c4874c21e (1495 bytes, 65 LF, zero CRLF, no BOM). The prebuild observation occurs after the remittance gate. The source stayed clean throughout.

The Linux checkout contains only the existing public Supabase URL/anon build configuration in its ignored .env.local; no worker secret or service credential was copied into it. Test logs and caches are external or in existing ignored build/dependency directories.

The Windows npm-test limitation from the fresh CRLF clone remains separately documented above. The full rc7 release gate and Linux production command passed; this is not a claim that the unrelated Windows literal-newline assertion was fixed.

## Local commits made (not pushed)

- 04addc80a75fcaa07318bfe431be1030e7ca7840 — initial portability guard, diagnostics, regressions, policy and prior rollout handoff.
- fb8a5a9fc52ba0064eaf32a1c75aa039a53f699e — intermediate rc6 seal.
- d9ab0619e74ee24daaba6658d5817d1c6bfd44df — intermediate rc6 receipt, superseded.
- 70813dc3237cf078e21a369940df8fadd5981781 — explicit .gitignore text contract.
- 7f34dfc968b49e98525567a2ae3ba334b5841554 — final rc7 seal.
- 4606a6562f394cf95b03a506eb2579b9eaf9cfd5 — final rc7 receipt and Linux-tested checkout.
- A subsequent documentation-only commit records this report; executable source remains the sealed rc7 bundle.

Changed files across this task: package.json; scripts/release/contract.cjs; scripts/release/authorize-build.cjs; scripts/release/build-diagnostics.cjs; scripts/release/portability-regression.cjs; scripts/release/gate-checks.cjs; release/trimax-release-manifest.json; release/evidence/vercel-portability-result.json; docs/TRIMAX_RELEASE_AND_ACCEPTANCE_POLICY.md; preserved docs/handoffs/TRIMAX_POSTDEPLOYMENT_RESULT_V2.md; this report.

No untracked-file exemption, application repair, worker modification, or service-worker content change was introduced. The Vercel-only dirty-file cause remains the exact unresolved item; deployment readiness must not silently convert that unknown into a resolved fact.

