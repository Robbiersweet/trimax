# Trimax Gate State Machine Repair

## Result and boundaries

**PREDEPLOYMENT: READY_FOR_CONTROLLED_DEPLOYMENT. Frozen real acceptance: 8/8.**

Application/OCR behavior changed: NO. Production changed: NO. Production deployed: NO. Workers restarted: NO. Production SQL installed: NO. Physical acceptance: PENDING.

Work was confined to the isolated candidate C:/Users/robbi/.codex/worktrees/trimax-release-candidate/trimax, plus private test/evidence output. No recognition, models, capture, auth, resolver, payment or frozen truth changed. The existing read-only attestation RPC was probed; no production mutation was made. No deployment was attempted.

## Proven defect and repair

The prior gate unconditionally recorded production-runtime-attestation as DEPLOYMENT_PREREQUISITE. Consequently its all-PASS classifier could never authorize deployment, and authorize-build accepted only an overall PASS receipt.

The constant has been removed. scripts/release/runtime-check.cjs now collects actual read-only RPC responses for both restricted engines after local source/model/config validation. scripts/release/runtime-evidence.cjs evaluates database and deployed-worker evidence separately. Local startup validation never supplies deployed worker provenance.

## Runtime evidence contract

- PASS requires an authenticated RPC response from the manifest project/business with exact DB fingerprints, flags and ocr-only scope, plus a persisted worker release matching releaseId, engine, sourceCommit, sourceBundle, modelBundle, runtimeSources, databaseFingerprint and paymentWriteCapability=false. validatedAt must be a valid timestamp, not a future claim.
- HTTP404/PGRST202 establishes the reviewed RPC is not installed: DEPLOYMENT_PREREQUISITE.
- A successful authenticated RPC with no persisted worker release gives runtime DEPLOYMENT_PREREQUISITE and database PASS.
- An existing incompatible/partial worker release is FAIL. Database/config/project/scope mismatch, credential denial, malformed response and network timeout are FAIL, never prerequisite or PASS.
- Both engines must pass for aggregate runtime PASS. Either mismatch fails the aggregate.

The existing worker records do not separately repeat sanitized config hashes/project/scope. These are verified by the exact source-bound validateStartup contract before it emits the persisted release record; the gate also verifies pinned local config and fresh RPC project/business/scope. Application and worker record formats were not changed. Evidence comes from legacyRelease and v2Release in the reviewed RPC, not a user-authored PASS file.

**Observability limit:** those records are completed-job provenance, not worker heartbeats. They establish recorded source/model/config validation, not current process liveness. Independent worker health checks remain necessary during a later rollout. This task does not claim live workers were started, attested or healthy.

Actual probes from this run:

```json
{
  "observedAt": "2026-10-08T06:03:38.225Z",
  "database": {
    "status": "DEPLOYMENT_PREREQUISITE",
    "failures": [],
    "engines": [
      {
        "engine": "legacy",
        "status": "DEPLOYMENT_PREREQUISITE",
        "failures": [],
        "reason": "Reviewed attestation RPC is not installed"
      },
      {
        "engine": "v2-shadow",
        "status": "DEPLOYMENT_PREREQUISITE",
        "failures": [],
        "reason": "Reviewed attestation RPC is not installed"
      }
    ]
  },
  "runtime": {
    "status": "DEPLOYMENT_PREREQUISITE",
    "failures": [],
    "engines": [
      {
        "engine": "legacy",
        "status": "DEPLOYMENT_PREREQUISITE",
        "failures": [],
        "reason": "Deployed attestation unavailable before RPC installation"
      },
      {
        "engine": "v2-shadow",
        "status": "DEPLOYMENT_PREREQUISITE",
        "failures": [],
        "reason": "Deployed attestation unavailable before RPC installation"
      }
    ]
  }
}
```

## Explicit gate modes

| Mode | Candidate / retained checks | Attestation | Outcome |
| --- | --- | --- | --- |
| PREDEPLOYMENT | All PASS | PASS or only the two named DEPLOYMENT_PREREQUISITEs | READY_FOR_CONTROLLED_DEPLOYMENT |
| PREDEPLOYMENT | Any failure or omitted/duplicate required check | Any | FAIL |
| PREDEPLOYMENT | All PASS | Existing runtime or DB mismatch | FAIL |
| POSTDEPLOYMENT | All PASS | Both PASS | PASS |
| POSTDEPLOYMENT | Any failure or missing attestation | Any | FAIL |

Explicit commands:

`npm run trimax:release-gate -- --mode=predeployment`

`npm run trimax:release-gate -- --mode=postdeployment`

Missing or unknown modes are rejected. gate-checks.cjs contains the unchanged complete test inventory plus the new gate-state regression. gate-state.cjs requires every named check, both per-document engine replays and every frozen document exactly once. Prerequisites are allowed only for production-runtime-attestation/live-database-attestation in PREDEPLOYMENT. Readiness is not final release PASS. Both modes keep PHYSICAL_ACCEPTANCE_PENDING.

## Build authorization

The existing clean source/manifest checks remain. authorize-build.cjs additionally re-evaluates the full receipt using the same state machine. It requires matching release ID, source bundle, frozen corpus hash, completion timestamp, complete check inventory, complete retained results, and consistent reported state. Ordinary FAIL, missing checks, dirty source and another release/bundle are rejected.

A sealed PREDEPLOYMENT READY_FOR_CONTROLLED_DEPLOYMENT receipt permits a controlled-deployment build. A POSTDEPLOYMENT PASS receipt also permits it. Neither grants physical acceptance, deployment permission by itself, or final release PASS from predeployment evidence.

After the full run, the actual authorize-build script was invoked from the clean sealed candidate with the new receipt and with the prior failing receipt, in separate child environments. No build/deployment was launched by these guard checks:

```json
[
  {
    "case": "sealed-readiness",
    "exitCode": 0,
    "stdout": "Exact sealed release authorized for build; predeployment readiness is not final release PASS; physical acceptance remains separate",
    "stderr": ""
  },
  {
    "case": "ordinary-prior-fail",
    "exitCode": 1,
    "stdout": "",
    "stderr": "C:\\Users\\robbi\\.codex\\worktrees\\trimax-release-candidate\\trimax\\scripts\\release\\authorize-build.cjs:7\r\nif(failures.length)throw Error('Release build blocked: '+failures.join('; '));\r\n                   ^\r\n\r\nError: Release build blocked: Receipt is incomplete or not for the sealed release; Gate receipt does not authorize this exact release\r\n    at Object.<anonymous> (C:\\Users\\robbi\\.codex\\worktrees\\trimax-release-candidate\\trimax\\scripts\\release\\authorize-build.cjs:7:26)\r\n    at Module._compile (node:internal/modules/cjs/loader:1830:14)\r\n    at Object..js (node:internal/modules/cjs/loader:1961:10)\r\n    at Module.load (node:internal/modules/cjs/loader:1553:32)\r\n    at Module._load (node:internal/modules/cjs/loader:1355:12)\r\n    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)\r\n    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)\r\n    at node:internal/main/run_main_module:33:47\r\n\r\nNode.js v24.15.0"
  }
]
```

## Regression coverage

New script: scripts/release/gate-state-regression.cjs.

| Requested case | Verified result |
| --- | --- |
| A candidate code failure | FAIL |
| B retained acceptance failure | FAIL |
| C all candidate checks pass; runtime/RPC absent | READY_FOR_CONTROLLED_DEPLOYMENT |
| D deployed runtime mismatch | FAIL |
| E DB fingerprint mismatch | FAIL |
| F matching postdeployment evidence | PASS (synthetic state-machine test only) |
| G ordinary FAIL build receipt | Rejected |
| H sealed predeployment readiness | Allowed; wrong release/source/dirty or missing checks rejected |
| I physical acceptance separate | PENDING; build receipt cannot assert physical PASS |

Additional tests cover engine/release/model/runtime bundle mismatches, no-payment declaration mismatch, invalid timestamp, wrong project/business/scope, HTTP401/403/503/520, network timeout, invalid mode and both-engine aggregation. These synthetic authorization/state fixtures are not production attestation evidence.

## Complete predeployment gate

Started: 2026-10-08T06:03:11.940Z. Finished: 2026-10-08T06:07:53.088Z.

Private evidence: C:/Users/robbi/AppData/Local/Trimax/release-gates/2026-10-08T06-03-11-939Z

Receipt copied without status edits to release/evidence/gate-state-machine-result.json.

Standard npm ci passed before the gate, and the gate ran standard npm ci independently again. Existing npm warnings remain: 15 vulnerabilities (1low/1moderate/12high/1critical), and allow-scripts warnings for sharp0.34.5, tesseract.js7.0.0 and unrs-resolver1.11.1. No dependency or policy changes were made.

| Check | Status | Duration ms |
| --- | --- | --- |
| clean-manifest-source-start | PASS |  |
| frozen-corpus-integrity | PASS |  |
| clean-dependency-install | PASS | 19429 |
| model-bundle | PASS |  |
| runtime-source-bundles | PASS |  |
| production-runtime-attestation | DEPLOYMENT_PREREQUISITE |  |
| live-database-attestation | DEPLOYMENT_PREREQUISITE |  |
| sql-test-runtime | PASS |  |
| gate-state-regression | PASS | 61 |
| contract-regression | PASS | 61 |
| auth-flow-regression | PASS | 268 |
| startup-regression | PASS | 1623 |
| sql-attestation-regression | PASS | 1146 |
| authorization-execution-regression | PASS | 1263 |
| evidence-handoff-regression | PASS | 78 |
| final-candidate-regression | PASS | 269 |
| shadow-capture-regression | PASS | 264 |
| camera-lifecycle-regression | PASS | 95 |
| capture-durability-regression | PASS | 259 |
| ocr-object-upload-regression | PASS | 314 |
| ocr-evidence-persistence-regression | PASS | 1332 |
| ocr-legacy-job-regression | PASS | 204 |
| shadow-regression | PASS | 482 |
| canonical-regression | PASS | 214 |
| canonical-sql-regression | PASS | 2824 |
| shadow-sql-regression | PASS | 1148 |
| foundation-regression | PASS | 547 |
| layout-regression | PASS | 1102 |
| field-regression | PASS | 1263 |
| invoice-study-regression | PASS | 638 |
| fusion-regression | PASS | 99 |
| resolver-regression | PASS | 155 |
| payment-evidence-regression | PASS | 1265 |
| document-total-regression | PASS | 370 |
| identity-regression | PASS | 178 |
| semantics-regression | PASS | 210 |
| orientation-heading-regression | PASS | 2677 |
| legacy-direction-regression | PASS | 2529 |
| legacy-first-pass-regression | PASS | 356 |
| physical-row-regression | PASS | 160 |
| money-regression | PASS | 189 |
| mature-money-regression | PASS | 84 |
| shared-money-regression | PASS | 167 |
| organization-identity-regression | PASS | 92 |
| total-localization-regression | PASS | 154 |
| residual-regression | PASS | 287 |
| regression | PASS | 70 |
| remittance-matching-regression | PASS | 174 |
| remittance-contract-regression | PASS | 147 |
| remittance-retry-regression | PASS | 103 |
| duplicate-remittance-regression | PASS | 120 |
| payment-application-regression | PASS | 79 |
| payment-state-lifecycle-regression | PASS | 88 |
| invoice-correction-regression | PASS | 82 |
| split-source-relationship-regression | PASS | 81 |
| split-invoice-send-regression | PASS | 78 |
| tenant-isolation-hardening-regression | PASS | 82 |
| business-read-isolation-regression | PASS | 90 |
| owner-server-auth-regression | PASS | 81 |
| account-management-regression | PASS | 85 |
| stabilization-regression | PASS | 26055 |
| frozen-business-snapshot | PASS |  |
| retained-check2715-legacy | PASS | 1701 |
| retained-check2715-v2-shadow | PASS | 26661 |
| retained-check2721-legacy | PASS | 11067 |
| retained-check2721-v2-shadow | PASS | 21876 |
| retained-check2734-legacy | PASS | 1683 |
| retained-check2734-v2-shadow | PASS | 19830 |
| retained-check2743-legacy | PASS | 1479 |
| retained-check2743-v2-shadow | PASS | 17521 |
| retained-A-legacy | PASS | 4328 |
| retained-A-v2-shadow | PASS | 14180 |
| retained-D-legacy | PASS | 923 |
| retained-D-v2-shadow | PASS | 15209 |
| retained-B-legacy | PASS | 1901 |
| retained-B-v2-shadow | PASS | 17448 |
| retained-C-legacy | PASS | 3988 |
| retained-C-v2-shadow | PASS | 11974 |
| lint | PASS | 15863 |
| typescript | PASS | 1642 |
| production-build | PASS | 13436 |
| clean-manifest-source-end | PASS |  |

| Document | Acceptance | Failures |
| --- | --- | --- |
| check2715 | PASS | none |
| check2721 | PASS | none |
| check2734 | PASS | none |
| check2743 | PASS | none |
| A | PASS | none |
| D | PASS | none |
| B | PASS | none |
| C | PASS | none |

| Wrong-evidence counter | Count |
| --- | --- |
| wrongAuthoritativeTotals | 0 |
| wrongAcceptedRowAmounts | 0 |
| wrongInvoiceTokens | 0 |
| wrongRecordIds | 0 |

B: PASS. C: PASS. Foundation: PASS. Lint: PASS. TypeScript: PASS. Build: PASS. Clean start/end: PASS / PASS.

Code state: CODE_GATE_PASSED. Retained state: RETAINED_REAL_GATE_PASSED. Overall: READY_FOR_CONTROLLED_DEPLOYMENT. Physical: PHYSICAL_ACCEPTANCE_PENDING.

## Sealed identity and unchanged runtime behavior

- Release: trimax-release-contract-20261007-rc4
- Machinery revision: bf02a2a6748347e6c4c4c2fef6f5daa784cd69ea
- Manifest seal / gate start: d709223693c29f93f84470201f60a765d732cf08
- Source bundle: f35636f5e78bd5ba1f9efb8adc1df910400ba0bf7e8f319c728e0a8b3a1c5ed4
- Model bundle (unchanged): a85082f561fbf6b0ae367af5de30560cbc32b01af7508a8e8f10cbf502f10c30
- Frozen corpus (unchanged): 29f8a84ab995c246d2cedc9943ce391d56af55b09564dbe23329e357a7df6f7f
- Prior reviewed application revision: c770a4e1c1033c151e55602ffb84b28c05bf9c63

Git diff against that prior revision is empty for src, public, supabase, scripts/ocr-legacy-worker.cjs and scripts/ocr-v2. No worker-startup or application source was edited. Common component commit identities were resealed because release tooling is part of the executable source contract, not because application behavior changed. DB fingerprints, flags, worker configuration, model weights and corpus truth were not resealed to different values.

Local commits:

- bf02a2a6748347e6c4c4c2fef6f5daa784cd69ea — evidence-driven state machine, tests, policy, plus preservation of the prior uncommitted rollout-stop report.
- d709223693c29f93f84470201f60a765d732cf08 — manifest seal.
- A subsequent documentation/receipt-only commit saves this report without changing executable identity.

## Files changed

- scripts/release/gate.cjs
- scripts/release/gate-checks.cjs
- scripts/release/gate-state.cjs
- scripts/release/gate-state-regression.cjs
- scripts/release/runtime-evidence.cjs
- scripts/release/runtime-check.cjs
- scripts/release/authorize-build.cjs
- release/trimax-release-manifest.json
- docs/TRIMAX_RELEASE_AND_ACCEPTANCE_POLICY.md
- docs/handoffs/TRIMAX_PRODUCTION_ROLLOUT_RESULT.md (existing uncommitted report preserved)
- docs/handoffs/TRIMAX_GATE_STATE_MACHINE_REPAIR.md
- release/evidence/gate-state-machine-result.json

No push or production deployment. No production SQL installation or worker restart. Read-only RPC probes did not mutate queues, payments or business data. Retained replays and SQL regressions ran locally. No live apply-payment calls.

## Final disposition

Predeployment readiness is established only to the extent shown by this complete receipt. Final deployed runtime/database PASS remains unverified; the missing RPC and absent deployed evidence remain explicitly recorded prerequisites. Physical acceptance remains PENDING.

Next action: WAIT FOR CHATGPT REVIEW. STOP.
