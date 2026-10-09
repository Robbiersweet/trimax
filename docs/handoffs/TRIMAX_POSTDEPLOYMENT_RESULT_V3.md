# rc7 controlled rollout — postdeployment result V3

## Outcome: STOPPED at stage 4

Vercel rejected the rc7 build. No repair, bypass, additional deployment, worker launch, health job, postdeployment gate, or physical scan followed the failure. The prior production deployment remains serving.

## Fresh preflight

- Release: trimax-release-contract-20261008-rc7.
- Machinery: 70813dc3237cf078e21a369940df8fadd5981781.
- Seal: 7f34dfc968b49e98525567a2ae3ba334b5841554.
- Receipt commit: 4606a6562f394cf95b03a506eb2579b9eaf9cfd5.
- Reviewed HEAD including documentation: 36fa59df8956afe2ef6988042136b1f03236e3fc.
- Source bundle: cd3e12eac740f9e318b4d5d41f7608e488ecf14f8ed94e169bb352e62041020e.
- Worktree clean; localFailures empty; actual bundle exactly matched manifest.
- Local authorization with release/evidence/vercel-portability-result.json passed before push.
- Live DB legacy attestation PASS at 2026-10-09T03:33:13.737075Z; v2 PASS at 03:33:19.856216Z.
- Deployed candidate worker records remained DEPLOYMENT_PREREQUISITE, not PASS.
- Fresh queues: legacy failed=2, review=5, queued=0, running=0; v2 completed=37, failed=1, queued=0, running=0. No other states returned.
- No matching local legacy/shadow Node worker processes were found; none was started or replaced.
- Fresh 18-table business checksum snapshot captured; all values matched the prior snapshot.
- Serving production before rollout: b5d0d51ab35a915292e54355d5c582a22876be11 / A6ZKcvjyxFE8483eBofsK9srxhHq, Ready.

A read-only queue inspection initially used an incorrect column name (`status` rather than `state`) and returned SQLSTATE 42703. The inspection query was corrected to the existing schema, then returned the counts above. No database/schema/application repair or mutation occurred.

## Authorized changes performed

1. Changed only Production TRIMAX_RELEASE_GATE_RESULT from release/evidence/live-attestation-repair-result.json to release/evidence/vercel-portability-result.json. Saved successfully and revealed the saved non-secret value to verify both value and Production-only scope. No other environment variable or feature flag was changed.
2. Pushed exact HEAD 36fa59df8956afe2ef6988042136b1f03236e3fc to main. Fast-forward 64fcc72..36fa59d; remote main verified afterward. No merge or additional executable edits.
3. Observed the normal automatic production deployment until its terminal failure.

No commit was created during this rollout. This report is a subsequent uncommitted documentation artifact and has not been pushed.

## Vercel deployment

- ID: BDQMpegnMByHo8azCNi67JrPVw4j.
- URL: https://vercel.com/trimax-s-projects/trimax/BDQMpegnMByHo8azCNi67JrPVw4j
- Hostname: trimax-31l75g7av-trimax-s-projects.vercel.app.
- Source: 36fa59df8956afe2ef6988042136b1f03236e3fc.
- Status: Error / Build Failed.
- Duration: 2 minutes 36 seconds.
- Terminal timestamp shown: October 8, 2026, 8:37:35 PM PDT (2026-10-09T03:37:35Z).
- Node v24.21.0; Vercel CLI 62.7.0.

Exact build command:

```sh
npm test && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/remittance-release-gate.ts && npm run build
```

Exact terminal error:

```text
/vercel/path0/scripts/release/authorize-build.cjs:8
if(failures.length)throw Error('Release build blocked: '+failures.join('; '));
                   ^
Error: Release build blocked: Release worktree is dirty; Source bundle differs from manifest; Receipt is incomplete or not for the sealed release
    at Object.<anonymous> (/vercel/path0/scripts/release/authorize-build.cjs:8:26)
Node.js v24.21.0
Error: Command "npm test && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/remittance-release-gate.ts && npm run build" exited with 1
```

## Exact dirty paths and stage evidence

| Path | Git porcelain status | First observed | Also present at |
| --- | --- | --- | --- |
| package-lock.json | ` M` (tracked working-tree modification) | preinstall, 2026-10-09T03:35:05.599Z | prebuild, 03:37:33.719Z |
| vercel.json | ` M` (tracked working-tree modification) | preinstall, 2026-10-09T03:35:05.599Z | prebuild, 03:37:33.719Z |

No untracked/deleted files were listed in these diagnostics. Initial state is explicitly `observed at npm preinstall (not before npm)`. Both modifications existed before the test sequence. The precise creator and content diff remain UNKNOWN; no claim is made that tests, npm, Vercel, or another process caused them. No repair or further investigation of their origin was performed after the stop condition.

The guard also reports an actual source-bundle mismatch and receipt authorization failure. These are recorded exactly; the log does not expose the differing package-lock contents or the computed remote bundle. Receipt path was verified before push; no assumption is made that the receipt itself was absent.

## Service-worker evidence

| Field | Value |
| --- | --- |
| Expected canonical SHA-256 | dba6df014e916ca5ec28619d4cfe89f400c3b6a0f3bc37966bf8bf1c4874c21e |
| Vercel raw SHA-256 | dba6df014e916ca5ec28619d4cfe89f400c3b6a0f3bc37966bf8bf1c4874c21e |
| Vercel canonical SHA-256 | dba6df014e916ca5ec28619d4cfe89f400c3b6a0f3bc37966bf8bf1c4874c21e |
| Byte length | 1495 |
| CRLF count | 0 |
| LF count | 65 |
| BOM | false |

These values match at preinstall and prebuild. The prior service-worker hash mismatch did NOT recur.

Remote diagnostic path printed by the build: /tmp/trimax-build-diagnostics/1e1c9bcd9b3bd900f8a239341083c2311eacad82983385d3e930565fe90f69e9.json. This is a remote build-container path, not a claim that its file was downloaded locally.

## Post-stop state and safety

Refreshed Vercel Overview confirms serving production is still Ready deployment A6ZKcvjyxFE8483eBofsK9srxhHq / b5d0d51ab35a915292e54355d5c582a22876be11. The latest failed entry is BDQMpegnMByHo8azCNi67JrPVw4j. No rollback was needed or performed.

HTTP HEAD https://app.rnlcreations.com/ returned 200 at 2026-10-09T03:36:52Z during the build; afterward the refreshed dashboard confirmed the same serving deployment. Owner/admin login, Payments and rc7 diagnostics acceptance were not reached.

PRODUCTION = MAIN: NO. Main is 36fa59df8956afe2ef6988042136b1f03236e3fc; production remains b5d0d51ab35a915292e54355d5c582a22876be11.

Fresh post-stop queries returned identical row counts and SHA-256 checksums for all 18 business tables. Payment/business state changed: NO within this recorded safety snapshot. No apply-payment calls, payment writes, new OCR jobs, database schema/RPC changes, worker replacements, model changes or frozen-truth changes occurred.

The Production receipt variable remains set to the authorized rc7 path. It was not reverted or changed further after failure.

Private evidence:

- C:/Users/robbi/AppData/Local/Trimax/rc7-rollout-before.json
- C:/Users/robbi/AppData/Local/Trimax/rc7-rollout-after.json
- C:/Users/robbi/AppData/Local/Trimax/rc7-rollout-preflight.json

## Gate results and acceptance scope

| Requirement | Result |
| --- | --- |
| Vercel build | FAIL |
| rc7 web deployment | FAIL |
| Fresh live DB attestation | PASS |
| Legacy deployed-worker attestation | NOT ATTEMPTED — web prerequisite failed |
| V2 deployed-worker attestation | NOT ATTEMPTED — web prerequisite failed |
| Unified release identity | NO |
| Worker health jobs | NOT RUN |
| Postdeployment gate | NOT RUN — blocked/rollout FAIL |
| Runtime drift detected | YES — build source mismatch; no coherent deployed rc7 runtime |
| Payment/business state changed | NO |
| Physical acceptance | PENDING |
| Ready for installed-iPhone physical acceptance | NO |

Frozen acceptance remains **8/8 PREDEPLOYMENT** in release/evidence/vercel-portability-result.json, with wrong authoritative totals/accepted row amounts/invoice tokens/record IDs all zero and lint/TypeScript/local build PASS. Those results were not rerun as a postdeployment gate and are not a postdeployment PASS. No worker payment-write capability was granted or modified.

STOPPED. No repair, reseal, bypass, redeploy, or physical test. WAIT FOR CHATGPT REVIEW.
