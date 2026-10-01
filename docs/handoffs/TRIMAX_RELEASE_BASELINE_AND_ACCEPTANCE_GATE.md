# Trimax Release Baseline and Acceptance Gate

Evidence date: 2026-10-01. VERIFIED facts are distinguished from UNKNOWN/UNVERIFIED limitations. This report establishes a failing baseline, not a release approval.

## 1. Current runtime drift

**VERIFIED: runtime drift detected. No production worker was normalized, restarted, reset, stashed, or overwritten.**

The release candidate is isolated at `C:/Users/robbi/.codex/worktrees/trimax-release-candidate/trimax`, branch `codex/trimax-release-contract`, created from deployed production. The running worker launch checkout is `C:/Users/robbi/.codex/worktrees/ocr-v2-shadow/trimax`. Both worker loaded-runtime classifications are **C: UNKNOWN**, because neither existing process attests its loaded modules. The preserved on-disk checkout is **B: committed source plus uncommitted changes**. Current disk hashes are not proof of what an already-running Node process loaded. CIM does not independently expose the process working directory; the launch checkout is established by existing launch evidence.

Preserved original status:

```text
 M package.json
 M src/app/lib/ocrV2/recognition/semanticMoney.ts
?? eng.traineddata
?? scripts/ocr-v2/money-ownership-regression.cjs
?? src/app/lib/ocrV2/recognition/moneyOwnership.ts
```

| File | Purpose / disposition | Production dependency |
| --- | --- | --- |
| package.json | Adds experimental money-ownership regression command; excluded | No active inference dependency established |
| src/app/lib/ocrV2/recognition/semanticMoney.ts | Replaces strict containment with experimental ownership; excluded | Could affect modules loaded from disk; exact loaded revision UNKNOWN |
| src/app/lib/ocrV2/recognition/moneyOwnership.ts | Untracked experimental assignment helper; excluded | Imported by dirty semanticMoney; not accepted into candidate |
| scripts/ocr-v2/money-ownership-regression.cjs | Untracked experimental test; excluded | Not a worker job entry point |
| eng.traineddata | Untracked OCR language cache; preserved and hashed | Disk artifact; loaded-memory identity UNKNOWN |

The ownership helper has no committed history in the available refs. The audit records an unsafe amount result from that experimental work. No entire worker checkout was copied into the candidate. Full original diff is `release/evidence/worker.diff`; 446 on-disk source hashes are in `release/evidence/worker-state.json`. Original untracked files are preserved privately under `C:/Users/robbi/AppData/Local/Trimax/release-baseline-20261001/untracked`. Process environment cannot be read from this evidence; sanitized configuration and explicit environment requirements are recorded, not guessed.

## 2. Web revision

Production/main: `b5d0d51ab35a915292e54355d5c582a22876be11`. Vercel deployment: `A6ZKcvjyxFE8483eBofsK9srxhHq`; deployed `2026-09-30T20:16:41Z`; URL https://app.rnlcreations.com. Remote main was rechecked after the final gate and is unchanged. Supabase project: `gqknefosisnsjuzmhvts`. Candidate executable revision: `51898157a5f447819fb175defd7b61191cc05577`. **Candidate is not production.**

## 3. Legacy worker revision

On-disk HEAD: `b927b0967ec81b8ec2cf95ed4163febb8eb8c7fa`; loaded revision UNKNOWN. PID **32732**, start **2026-09-26T00:27:26.335586-07:00**. Same PID/start reverified after final replay.

```text
"C:\Program Files\nodejs\node.exe" scripts/ocr-legacy-worker.cjs C:\Users\robbi\AppData\Local\Trimax\ocr-legacy-worker\worker.json
```

Candidate legacy executable revision: `51898157a5f447819fb175defd7b61191cc05577`. Existing restricted credential was read only for configuration/validation; no credential was issued, broadened, or changed. No claim or payment endpoint was called by the new startup-validation check. Live loaded-source validation remains unproven.

## 4. V2 worker revision

On-disk HEAD: `b927b0967ec81b8ec2cf95ed4163febb8eb8c7fa`; loaded revision UNKNOWN. PID **3824**, start **2026-09-26T00:55:02.328554-07:00**. Same PID/start reverified after final replay.

```text
"C:\Program Files\nodejs\node.exe" --experimental-strip-types scripts/ocr-v2/shadow-worker.cjs C:\Users\robbi\AppData\Local\Trimax\ocr-shadow-worker\worker.json
```

Candidate v2 executable revision: `51898157a5f447819fb175defd7b61191cc05577`. V2 remains diagnostic-only. Existing workers are present, but process presence is not a new successful-job/health attestation. No autostart/lifecycle redesign was performed.

## 5. Model hashes

| Model | Version | Path | SHA-256 |
| --- | --- | --- | --- |
| tesseract-native-eng | 5.5.0 | /usr/share/tesseract-ocr/5/tessdata/eng.traineddata | 7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2 |
| trimax_invoice_pilot_v1 | pilot-v1 | /home/robbi/trimax-ocr/pilot-v1/trimax_invoice_pilot_v1.traineddata | 86a52e3e1a119394980bae6f9f5ff216a8805d9fc1d326b740be8c4cf29b86ec |
| SVTRv2 | OpenOCR SVTRv2 CH | /home/robbi/trimax-ocr/phase3e/openocr_svtrv2_ch.pth | 3be361b72dc52e8d4f5569ae822d263b4e70671486bbaa45605711d17b8aec27 |
| PARSeq | bb5792a6 | /home/robbi/.cache/torch/hub/checkpoints/parseq-bb5792a6.pt | bb5792a68e367476abca029cbf8699abc805f3d3dc7e57aae45c8ec4f7b7cd00 |
| PP-OCRv5 | en mobile v5 | /home/robbi/trimax-ocr/pilot-v1/modern-models/en_PP-OCRv5_rec_mobile.onnx | c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8 |
| tesseract-js-eng-orientation | tesseract.js 7.0.0 / exact traineddata hash | C:\Users\robbi\AppData\Local\Temp\trimax-v2-tesseract\eng.traineddata | 5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747 |
| tesseract-js-eng-working-cache | tesseract.js 7.0.0 / exact traineddata hash | WORKTREE/eng.traineddata | 5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747 |
| tesseract-js-legacy-full-pass-cache | Expected frozen English bundle; fallback cache file not currently present/attested | C:/tmp/tesseract-cache/eng.traineddata | 5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747 |

**Availability distinctions:** native WSL weights and orientation cache were hashed. The clean RC working cache was absent initially; real replay generated `eng.traineddata` and made the worktree dirty. The expected legacy full-pass cache at `C:/tmp/tesseract-cache/eng.traineddata` is missing: its expected hash is a release requirement, not an observed hash for a nonexistent file. Startup rejects it.

OpenOCR source revision `0d522801ec6dc1df852c6b6d4ed6a08f5127ed97` and PARSeq `1902db043c029a7e03a3818c616c06600af574be` were clean and hashed (389 and 86 source/config files). Node OCR package source hashes include tesseract.js 7.0.0, tesseract.js-core 7.0.0, sharp 0.35.3 and @img/sharp-win32-x64 0.35.3. Evidence: `release/evidence/node-ocr-source-state.json`, `wsl-source-state.json`, and manifest `runtimeSources`.

Observed runtime: Node v24.15.0; Ubuntu Python 3.12.14; Tesseract 5.5.0; torch 2.14.0+cu130; rapidocr 3.9.2; onnxruntime 1.30.0; transformers 4.57.6. Python package versions are captured; every transitive native binary and the old processes' loaded memory are not attested. No training/tuning occurred.

## 6. DB fingerprint

```json
{
  "capturedAt": "2026-10-01T16:02:36.667559+00:00",
  "algorithm": "catalog-v1; sorted C collation name=value; UTF8 SHA256; public tables/constraints/indexes/functions, public+storage RLS, public table grants; excludes only trimax_release_runtime itself",
  "fingerprints": {
    "rpc": {
      "sha256": "d26d37d72ff5c6d835dfb0767893399ae1e205f5344193ddf3017dae69a0e1ed",
      "entries": 37
    },
    "grants": {
      "sha256": "a056ce17f8f9b68fc393a5be34fb0a38539a5c4a7f15b5c9f1db9877ef446ea7",
      "entries": 917
    },
    "schema": {
      "sha256": "efc506fa018ed86875375bbe51e479e746b9ca661943b2657eaf13e8f3a358f8",
      "entries": 699
    },
    "policies": {
      "sha256": "39550adf015ae539be77e3a765858bd84fb71bbe36fe401a1dd68c3ff0028864",
      "entries": 74
    },
    "triggers": {
      "sha256": "1189025c52ee6e7c3b8e69686784557aba68b0f29e6c2d2db8007cfb7475c549",
      "entries": 8
    }
  },
  "flags": [
    {
      "enabled": true,
      "businessId": "f31adfa1-26ad-4e74-ad94-a4668d7ad57d",
      "nativeStill": true
    }
  ],
  "legacyEnabled": true,
  "acceptanceTableRecords": 0
}
```

Catalog fingerprints were obtained with a live read-only SELECT. No production migration was applied. Candidate `supabase/sql/2026-10-01-release-attestation.sql` defines read-only `trimax_release_runtime`, with restricted engine-key or owner/admin authorization. Its own definition is excluded from the RPC digest to avoid self-reference and is pinned in the executable source bundle. Installation/definition in production is **UNVERIFIED / not installed by this task**. Local PGlite validates the candidate RPC, not live production permissions. Existing `ocr_shadow_acceptance` has zero records; historical labels were not inserted as fresh physical acceptance.

## 7. Release manifest

Machine-readable file: `release/trimax-release-manifest.json`. Release ID: `trimax-release-contract-20261001-rc1`. Common executable revision: `51898157a5f447819fb175defd7b61191cc05577`. Source bundle: `88a92017b615985075657996756d9c411b628ed68b67e04cd5dc3acdfe639ae0`. All three candidate components identify the same executable source. Metadata-only sealing commits may follow it; any executable diff from that revision fails validation. The manifest deliberately excludes its own metadata from executable hashing to avoid an impossible commit-self-hash cycle.

Candidate release timestamp and Vercel deployment ID are **null** because this candidate has not been released; existing production identity is recorded separately. This is a pinned candidate contract with explicit failing prerequisites, not a claim of a certified reproducible production release.

Sanitized worker configuration:

```json
{
  "businessId": "f31adfa1-26ad-4e74-ad94-a4668d7ad57d",
  "supabaseUrl": "https://gqknefosisnsjuzmhvts.supabase.co",
  "wslDistribution": "Ubuntu",
  "python": "/home/robbi/trimax-ocr/benchmark-venv/bin/python",
  "legacyPollMs": 5000,
  "shadowPollMs": 10000,
  "legacyLeaseSeconds": 180,
  "shadowLeaseSeconds": 900,
  "legacyHeartbeatMs": 30000,
  "recognitionTimeoutMs": 6000,
  "modelProcessTimeoutMs": 600000,
  "credentialScope": "ocr-only; canonical reads, snapshot reads, own leased diagnostic/job writes; no business writes",
  "autostart": "Not configured; deferred infrastructure requirement",
  "nodeVersion": "v24.15.0",
  "pythonVersion": "3.12.14",
  "packages": {
    "torch": "2.14.0+cu130",
    "rapidocr": "3.9.2",
    "onnxruntime": "1.30.0",
    "transformers": "4.57.6"
  },
  "requiredUnsetEnvironment": [
    "TESSDATA_PREFIX",
    "TORCH_HOME",
    "HF_HOME",
    "CUDA_VISIBLE_DEVICES",
    "OMP_NUM_THREADS"
  ],
  "configHashes": {
    "legacy": "f671d28b5323e71e2eef9608c3cce23c08e6d0241f21367f1734170383d272da",
    "v2-shadow": "1e4c35571829ca979a029d2972d446ec7bc28e30a18bbd26fee8694b4e56ca94"
  }
}
```

Service worker:

```json
{
  "path": "public/sw.js",
  "sha256": "cbef97a011007c67e5c20d54bea593e507926a57fa5161f2c9ddf608e837cd85"
}
```

Secrets are excluded. Public API key format is validated (publishable key or anon JWT); private worker credential is checked by a read-only authorized attestation, never included in the manifest. Candidate startup/per-claim guards refuse source, model, environment, project, configuration, flag, DB or scope mismatches before new work. These guards are **not active in the unchanged production workers**.

## 8. Frozen real acceptance corpus

**8 independent real documents, 24 physical rows.** Private image bytes stay outside Git. These are historical retained images, not eight fresh Phase 6 scans. Capture 2 is a recapture of the B family and is not counted as a ninth independent document.

| Document | Rows | Canonical SHA-256 | Reference |
| --- | --- | --- | --- |
| check2715 | 2 | 03c4af1d93b7a5813c401743b5ad6db2bff5390a2d3ad146e7acd9ff00ac343b | C:\Users\robbi\AppData\Local\Trimax\ocr-v2-training\pilot-v1\harvest\1d5e458e-419e-47e6-9e7d-e6b6aa0d6850-image.jpg.jpg |
| check2721 | 2 | 2afb939154f4453d8724ef396cdb415a19af4b8734af8e52d7b299a262b80924 | C:\Users\robbi\AppData\Local\Trimax\ocr-v2-training\pilot-v1\harvest\cf8bc6d1-3e9e-46b9-bda3-540ab32724d9-IMG_9960.jpeg.jpg |
| check2734 | 2 | f216eede07d8d48b7208b7afe2ffaa1a63c4d6e7997e905087bc5bf6f6e9ed77 | C:\Users\robbi\AppData\Local\Trimax\ocr-v2-training\pilot-v1\harvest\54d332a6-ad55-4c96-be73-81cdfd428e47-image.jpg.jpg |
| check2743 | 1 | bc05e7692a0a78f7d62ec966b957f3a8eb71a6c4aa08582b4e66e483dd4c5a23 | C:\Users\robbi\AppData\Local\Trimax\ocr-v2-training\pilot-v1\harvest\5c887a57-1ea4-4188-9c21-cf361da68f6e-image.jpg.jpg |
| A | 5 | 09152d5911d776edc033682e8838d32b13557a45404225030e411d655bc84a34 | C:\Users\robbi\AppData\Local\Trimax\ocr-v2-training\pilot-v1\harvest\c1b32fa7-5dd7-42e8-b4ed-9ee593eaa82a-trimax-remittance-ocr-1787571026750.jpg.jpg |
| D | 5 | 9ea8d286afc6b29322cb514ccf35914760ce9db25af8c1a39721fa82948854b8 | C:\Users\robbi\AppData\Local\Trimax\ocr-v2-training\pilot-v1\harvest\4cbe7aed-cc56-4c7e-9271-f9adefa7ff49-trimax-remittance-ocr-1789102407812.jpg.jpg |
| B | 5 | 30f2ad3b1356cfffcbf396081ccfa52ea97823fd26779fc6e0a4dcb2b4a8ff17 | C:\Users\robbi\AppData\Local\Trimax\ocr-v2-private\fixture-b-original.jpg |
| C | 2 | 36cba68eba828fcc0fbcfdf2c6e97c2f10aa5ed3c56a206b0b9358d2edb904fd | C:\Users\robbi\AppData\Local\Trimax\ocr-v2-training\pilot-v1\harvest\bbad8ed4-98e7-4fb9-81a4-baff0512eedd-trimax-remittance-ocr-1789120307585.jpg.jpg |

Canonical references are private retained files with source attachment IDs where available. Missing server attempt IDs are left null, not invented. Frozen source provenance:

```json
{
  "sourceTruth": {
    "path": "C:\\Users\\robbi\\AppData\\Local/Trimax/ocr-v2-training/dataset-v1/manifest-v2.json",
    "sha256": "5d9ce4c87e47559efd4157ef482ebcd9ef220dfd3c075632d9b2ac63f9d3b478",
    "provenance": "Prior manually verified optical annotations and read-only business snapshots; A-D invoice sets and totals reaffirmed by user"
  },
  "historicalBaseline": {
    "path": "C:\\Users\\robbi\\AppData\\Local/Trimax/ocr-v2-training/dataset-v1/capture2-final-gate/report.json",
    "sha256": "0a041dbfc7402bf10fbb32ecdb76b681e023adcdbc65f6d7152263c1f4147253"
  },
  "snapshot": {
    "path": "C:\\Users\\robbi\\AppData\\Local/Trimax/ocr-v2-training/phase5/resolver-evidence.json",
    "sha256": "7a34c45c0389d2ad4db51a1b6a02b0be6ca614100631920e289edfd300501e73"
  }
}
```

All labels are scoring-only and withheld from recognizer inputs. Runtime replay receives only the retained image plus the unchanged downstream resolver snapshot. Business records do not supply OCR digits.

## 9. Acceptance expectations

### check2715 — SAFELY_REQUIRE_REVIEW

| Row | Printed invoice | Verified record ID | Unit | Amount cents |
| --- | --- | --- | --- | --- |
| 1 | 404 | UNKNOWN | UNKNOWN | 1102431 |
| 2 | 402 | UNKNOWN | UNKNOWN | 109900 |

```json
{
  "documentIdentity": "check2715",
  "totalCents": 1212331,
  "check": "2715",
  "date": null,
  "payor": null,
  "expectationSource": "Frozen historical pre-task scorecard; expectations are not recalibrated from this run"
}
```

### check2721 — AUTOMATICALLY_RESOLVE

| Row | Printed invoice | Verified record ID | Unit | Amount cents |
| --- | --- | --- | --- | --- |
| 1 | INV0500 | 5bae2847-efc7-4444-8bad-40b09924421a | UNKNOWN | 109900 |
| 2 | INV0501 | eea7399b-40a7-4ca4-8393-329b0402f052 | UNKNOWN | 109900 |

```json
{
  "documentIdentity": "check2721",
  "totalCents": 219800,
  "check": "2721",
  "date": "2026-07-07",
  "payor": null,
  "expectationSource": "Frozen historical pre-task scorecard; expectations are not recalibrated from this run"
}
```

### check2734 — AUTOMATICALLY_RESOLVE

| Row | Printed invoice | Verified record ID | Unit | Amount cents |
| --- | --- | --- | --- | --- |
| 1 | INV0502 | 6b33bb8c-7af0-49f2-9f42-f8084564da2d | UNKNOWN | 109900 |
| 2 | INV0503 | 82862232-6609-41a4-977d-8a477e0f64f0 | UNKNOWN | 109900 |

```json
{
  "documentIdentity": "check2734",
  "totalCents": 219800,
  "check": "2734",
  "date": "2026-07-10",
  "payor": null,
  "expectationSource": "Frozen historical pre-task scorecard; expectations are not recalibrated from this run"
}
```

### check2743 — SAFELY_REQUIRE_REVIEW

| Row | Printed invoice | Verified record ID | Unit | Amount cents |
| --- | --- | --- | --- | --- |
| 1 | INV0504 | f0c5d28c-bc94-4ab5-9c11-8687e9e981db | UNKNOWN | 109900 |

```json
{
  "documentIdentity": "check2743",
  "totalCents": 109900,
  "check": "2743",
  "date": "2026-07-13",
  "payor": null,
  "expectationSource": "Frozen historical pre-task scorecard; expectations are not recalibrated from this run"
}
```

### A — SAFELY_REQUIRE_REVIEW

| Row | Printed invoice | Verified record ID | Unit | Amount cents |
| --- | --- | --- | --- | --- |
| 1 | INV0508 | 60ae0559-f1af-47d7-a844-2d3d2dae55db | UNKNOWN | 109900 |
| 2 | INV0509 | fdf7198a-e12b-4726-b5ef-61adf3dd5da4 | UNKNOWN | 109900 |
| 3 | INV0511 | 2e2a8555-0eae-4f4c-88b0-0c22c1bb0279 | UNKNOWN | 109900 |
| 4 | INV0510 | adecfb92-bf0e-4ed0-9a48-8c6c3709d5b1 | UNKNOWN | 109900 |
| 5 | INV0512 | 187e2014-9a44-486c-98df-4307a9fc7ea1 | UNKNOWN | 109900 |

```json
{
  "documentIdentity": "A",
  "totalCents": 549500,
  "check": "2769",
  "date": null,
  "payor": null,
  "expectationSource": "Frozen historical pre-task scorecard; expectations are not recalibrated from this run"
}
```

### D — AUTOMATICALLY_RESOLVE

| Row | Printed invoice | Verified record ID | Unit | Amount cents |
| --- | --- | --- | --- | --- |
| 1 | INV0520 | 7e4bd095-2dc6-4723-b6ff-38e5ef2eed02 | UNKNOWN | 109900 |
| 2 | INV0521 | 19171cb2-cd38-43a0-aa62-f7cad82cff2e | UNKNOWN | 130000 |
| 3 | INV0522 | c5a1ce10-aa95-4337-9ba8-967bf7a9c308 | UNKNOWN | 45840 |
| 4 | INV0524 | 677f5a6a-b64c-43b4-95ee-d9d30ec8f21d | UNKNOWN | 130000 |
| 5 | INV0525 | a8abab4f-365b-48dc-967b-6ff9ef8f00b1 | UNKNOWN | 34850 |

```json
{
  "documentIdentity": "D",
  "totalCents": 450590,
  "check": "2804",
  "date": "2026-08-25",
  "payor": null,
  "expectationSource": "Frozen historical pre-task scorecard; expectations are not recalibrated from this run"
}
```

### B — SAFELY_REQUIRE_REVIEW

| Row | Printed invoice | Verified record ID | Unit | Amount cents |
| --- | --- | --- | --- | --- |
| 1 | INV0513 | 8ad87219-60c5-449d-ad02-14f2fd9a2ee1 | UNKNOWN | 109900 |
| 2 | INV0514 | febfbb51-6b66-4cd7-a168-8c3371024337 | UNKNOWN | 109900 |
| 3 | INV0515 | b369a015-cfef-46a2-9f27-15cc15aee5ee | UNKNOWN | 109900 |
| 4 | INV0518 | d5def261-2c18-4f75-a076-55ecc46559eb | UNKNOWN | 109900 |
| 5 | INV0519 | e5e8a133-145d-4061-ac60-3ee8a95eef97 | UNKNOWN | 109900 |

```json
{
  "documentIdentity": "B",
  "totalCents": 549500,
  "check": "2797",
  "date": "2026-08-19",
  "payor": null,
  "expectationSource": "Frozen historical pre-task scorecard; expectations are not recalibrated from this run"
}
```

### C — AUTOMATICALLY_RESOLVE

| Row | Printed invoice | Verified record ID | Unit | Amount cents |
| --- | --- | --- | --- | --- |
| 1 | INV0506 | 3561fccb-f64e-4bfa-988e-0e459736cd2e | UNKNOWN | 130000 |
| 2 | INV0507 | c3b89f69-ee90-4b28-a4b5-3d7ca8212795 | UNKNOWN | 95295 |

```json
{
  "documentIdentity": "C",
  "totalCents": 225295,
  "check": "2758",
  "date": "2026-07-23",
  "payor": null,
  "expectationSource": "Frozen historical pre-task scorecard; expectations are not recalibrated from this run"
}
```

**UNKNOWN truth remains unknown:** payor/property labels are unverified/null in this frozen label source; several dates/units and check2715 record IDs are null. They are not backfilled from OCR. These gaps limit what exact identity/record scoring proves. Four historical automatic expectations (C, D, check2721, check2734) and four safe-review expectations are frozen before this run. A review document automatically promoted without sufficient frozen acceptance evidence fails. Wrong accepted invoice/amount/total, wrong known record IDs, duplicate IDs, unsafe reconciliation and lost physical rows fail.

## 10. Release gate implementation

Run from the clean release candidate:

```powershell
npm run trimax:release-gate
```

`scripts/release/gate.cjs` orchestrates integrity checks, regression commands, both unchanged OCR pipelines on the eight retained images, scoring, lint, TypeScript and production build. It does not call apply-payment, enqueue production jobs, or upload private test images. Full per-check matrix is in section 11. Completed replay is not synonymous with acceptance.

`contract.cjs` validates source/model/config/scope/DB identity and immutable scores; `replay-document.cjs` and `recognizer-adapter.cjs` provide private inference-only adapters; `runtime-check.cjs` performs non-claiming validation; `physical-acceptance.cjs` requires explicit installed-iPhone production evidence. Candidate worker entry points and small terminal metadata use the same contract. `ReleaseDiagnostics.tsx` is owner/admin-only and reports expected identities against last-job records, with **RUNTIME DRIFT DETECTED** for absent/mismatched data. Last-job identity is explicitly not live worker health.

`npm run build` now requires an exact passing release receipt via `TRIMAX_RELEASE_GATE_RESULT`; the gate invokes the production build binary directly to avoid recursion. This enforces the supported command, not protection against a human bypassing it with a direct binary or changing deployment settings. Vercel settings/branch protections were not altered.

Policy: `docs/TRIMAX_RELEASE_AND_ACCEPTANCE_POLICY.md`. A repair is not complete from unit/lint/build/replay/Codex success alone; its relevant acceptance gate must pass. New defects need regression fixtures; production OCR/capture/auth changes require the whole frozen suite. No production behavior is claimed fixed in this task.

## 11. Release-gate results

**FAIL. CODE_GATE_FAILED. RETAINED_REAL_GATE_FAILED.**

Started 2026-10-01T16:34:17.347Z; finished 2026-10-01T16:39:04.288Z. Tested metadata HEAD `4f409f7f064cde8da9c8db1586a54efd248ec8d1`, executable source bundle `88a92017b615985075657996756d9c411b628ed68b67e04cd5dc3acdfe639ae0`. Private full logs/results: `C:/Users/robbi/AppData/Local/Trimax/release-gates/2026-10-01T16-34-17-345Z`. Machine-readable receipt: `release/evidence/release-gate-result.json`.

| Check | Result | Duration ms | Failure |
| --- | --- | --- | --- |
| clean-manifest-source-start | PASS | not separately timed | — |
| frozen-corpus-integrity | PASS | not separately timed | — |
| clean-dependency-install | FAIL | not separately timed | FAIL EBADPLATFORM: Linux-only sharp direct dependencies on Windows |
| production-runtime-attestation | FAIL | not separately timed | Existing production workers have no loaded-source attestation; preserved drift is not normalized by this task |
| model-bundle | FAIL | not separately timed | Model unavailable: tesseract-js-eng-working-cache |
| runtime-source-bundles | PASS | not separately timed | — |
| live-database-attestation | FAIL | 313 | Exit 1 |
| sql-test-runtime | PASS | not separately timed | — |
| contract-regression | PASS | 61 | — |
| auth-flow-regression | PASS | 270 | — |
| startup-regression | PASS | 1628 | — |
| sql-attestation-regression | PASS | 1215 | — |
| shadow-capture-regression | PASS | 274 | — |
| camera-lifecycle-regression | PASS | 92 | — |
| capture-durability-regression | PASS | 273 | — |
| ocr-object-upload-regression | PASS | 321 | — |
| ocr-evidence-persistence-regression | PASS | 1376 | — |
| ocr-legacy-job-regression | PASS | 218 | — |
| shadow-regression | PASS | 565 | — |
| canonical-regression | PASS | 211 | — |
| canonical-sql-regression | PASS | 2951 | — |
| shadow-sql-regression | PASS | 1218 | — |
| foundation-regression | PASS | 564 | — |
| layout-regression | PASS | 1138 | — |
| field-regression | PASS | 1286 | — |
| invoice-study-regression | PASS | 644 | — |
| fusion-regression | PASS | 107 | — |
| resolver-regression | PASS | 164 | — |
| payment-evidence-regression | PASS | 1263 | — |
| document-total-regression | PASS | 317 | — |
| identity-regression | PASS | 159 | — |
| semantics-regression | PASS | 204 | — |
| orientation-heading-regression | PASS | 2921 | — |
| legacy-direction-regression | PASS | 2583 | — |
| legacy-first-pass-regression | PASS | 355 | — |
| physical-row-regression | PASS | 156 | — |
| money-regression | PASS | 195 | — |
| mature-money-regression | PASS | 78 | — |
| shared-money-regression | PASS | 178 | — |
| organization-identity-regression | PASS | 89 | — |
| total-localization-regression | PASS | 139 | — |
| residual-regression | PASS | 292 | — |
| regression | PASS | 69 | — |
| remittance-matching-regression | PASS | 183 | — |
| remittance-contract-regression | PASS | 152 | — |
| remittance-retry-regression | PASS | 105 | — |
| duplicate-remittance-regression | PASS | 118 | — |
| payment-application-regression | PASS | 94 | — |
| payment-state-lifecycle-regression | PASS | 85 | — |
| invoice-correction-regression | PASS | 80 | — |
| split-source-relationship-regression | PASS | 86 | — |
| split-invoice-send-regression | PASS | 84 | — |
| tenant-isolation-hardening-regression | FAIL | 83 | Exit 1 |
| business-read-isolation-regression | FAIL | 77 | Exit 1 |
| owner-server-auth-regression | PASS | 79 | — |
| account-management-regression | PASS | 90 | — |
| stabilization-regression | PASS | 28615 | — |
| frozen-business-snapshot | PASS | not separately timed | — |
| retained-check2715-legacy | PASS | 1855 | — |
| retained-check2715-v2-shadow | PASS | 29648 | — |
| retained-check2721-legacy | PASS | 11666 | — |
| retained-check2721-v2-shadow | PASS | 23910 | — |
| retained-check2734-legacy | PASS | 1813 | — |
| retained-check2734-v2-shadow | PASS | 24590 | — |
| retained-check2743-legacy | PASS | 1607 | — |
| retained-check2743-v2-shadow | PASS | 20239 | — |
| retained-A-legacy | PASS | 4720 | — |
| retained-A-v2-shadow | PASS | 15463 | — |
| retained-D-legacy | PASS | 1052 | — |
| retained-D-v2-shadow | PASS | 16620 | — |
| retained-B-legacy | PASS | 2038 | — |
| retained-B-v2-shadow | PASS | 19110 | — |
| retained-C-legacy | PASS | 4306 | — |
| retained-C-v2-shadow | PASS | 14357 | — |
| lint | PASS | 19063 | — |
| typescript | PASS | 1747 | — |
| production-build | PASS | 14160 | — |
| clean-manifest-source-end | FAIL | not separately timed | Release worktree is dirty |

### Frozen document acceptance

| Document | Expected | Result | Failure |
| --- | --- | --- | --- |
| check2715 | SAFELY_REQUIRE_REVIEW | PASS | — |
| check2721 | AUTOMATICALLY_RESOLVE | FAIL | Previously automatic document now requires review |
| check2734 | AUTOMATICALLY_RESOLVE | FAIL | Previously automatic document now requires review |
| check2743 | SAFELY_REQUIRE_REVIEW | PASS | — |
| A | SAFELY_REQUIRE_REVIEW | PASS | — |
| D | AUTOMATICALLY_RESOLVE | FAIL | Previously automatic document now requires review |
| B | SAFELY_REQUIRE_REVIEW | PASS | — |
| C | AUTOMATICALLY_RESOLVE | PASS | — |

All 16 pipeline executions returned a result. That does not mean all were correct/automatic: five document acceptance checks pass; **D, check2721 and check2734 now require review and fail their historical automatic expectations**. No wrong accepted value was reported by the configured scoring checks; this is limited to frozen known truth and does not certify unknown identity fields or fresh physical behavior. Expectations were not weakened.

### Exact unresolved failures

- Clean standard dependency installation failed EBADPLATFORM on Windows because of Linux-only direct sharp dependencies. Diagnostic continuation used `npm ci --force --ignore-scripts --no-audit --no-fund`; package/lock definitions were not changed. Standard reproducibility stays FAIL.
- Existing production workers have no loaded-source attestation and have preserved disk drift.
- Model gate: clean-worktree English cache absent. Live startup check exits before its DB call with `RUNTIME DRIFT DETECTED: Model unavailable: tesseract-js-legacy-full-pass-cache`. Therefore that failed command is not a successful live DB/scope validation. The candidate RPC is also not installed.
- tenant-isolation-hardening-regression: `Invoice send must read business-scoped settings, scope line items, and update status inside the authorized business.`
- business-read-isolation-regression: `Workspace switching must still load business metadata from business_users and property_users relationships.` These are failed source assertions, **not a reproduced data leak or proven root cause**. They were not repaired.
- End-of-gate cleanliness failed because unchanged OCR generated untracked `eng.traineddata`. The artifact is preserved outside the candidate after recording the failure; cleanup does not turn that failed run green or repair future cache behavior.

Lint, TypeScript and production build passed. Local SQL interruption/lease/credential tests passed. Earlier runner-only setup errors were corrected before this final run; no recognition, auth, payment, cache, dependency-platform or historical acceptance failure was repaired. The full retained observations remain private in each engine's result.json, with images/crops excluded from Git.

## 12. Physical acceptance status

**PHYSICAL_ACCEPTANCE_PENDING.** No new scan was requested or performed. No historical replay sets PHYSICAL_ACCEPTANCE_PASSED. The release state contract distinguishes CODE_GATE_PASSED, RETAINED_REAL_GATE_PASSED, PHYSICAL_ACCEPTANCE_PENDING and PHYSICAL_ACCEPTANCE_PASSED; the first two are not achieved in this baseline. Only an actual installed-iPhone production test with explicit release identity and evidence can set the last state. No production rollout is authorized by these results.

## 13. Competing-path inventory

| Path | Classification | Authority |
| --- | --- | --- |
| src/app/components/BatchInvoicePayments.tsx: native still and Choose Existing | ACTIVE | single-still intake |
| src/app/components/BatchInvoicePayments.tsx: paymentEntryMode camera/getUserMedia portal | DEAD/UNREACHABLE | no normal UI setter; retained historical code |
| src/app/api/payments/extract-check-stub/route.ts | COMPATIBILITY | HTTP handler also invoked by active local legacy worker |
| scripts/ocr-legacy-worker.cjs | ACTIVE | legacy review preparation, never payment application |
| scripts/ocr-v2/shadow-worker.cjs | DIAGNOSTIC | v2 shadow results only |
| src/app/lib/ocrV2/documentFields/moneyService.ts | ACTIVE | shared optical evidence, separate consumer authority |
| src/app/lib/ocrV2/shadow/client.ts: inline image enqueue compatibility | COMPATIBILITY | historical image transport, not normal canonical upload |
| src/app/lib/ocrCanonicalClient.ts | ACTIVE | canonical Storage upload/register/retry |
| scripts/ocr-legacy-evidence.cjs | ACTIVE | bounded terminal summaries and append-only checkpoints |
| src/app/lib/ocrV2/layout/generalized.ts | COMPATIBILITY | research pipeline and shared structural helpers; not a substitute for production semantic mapping |
| scripts/ocr-v2/training/* | DIAGNOSTIC | offline research, never acceptance truth |
| src/proxy.ts | DEAD/UNREACHABLE | empty matcher |

No path was removed. DEPRECATED is reserved for an explicit reviewed retirement; none was invented. Historical synchronous transport and inline compatibility remain inventory items. This candidate does not alter capture routing or orientation/recognition systems.

## 14. Remaining infrastructure requirements

Unmet release requirements, not repairs started:

- Common attested web/worker revision and clean loaded worker source are unproven in production.
- Required model caches and a standard reproducible Windows dependency install do not currently pass.
- Read-only attestation RPC/diagnostics and startup guards exist only in the candidate; activation would require separately reviewed production work.
- Two authorization regression assertions and three automatic-document regressions remain failing.
- Unchanged OCR creates a working-tree model cache; clean gate end fails.
- Full ground truth is missing for some identity/date/unit/record-ID fields. No unsupported labels were invented.
- Current worker environment/loaded native dependencies are not fully observable.
- Worker availability depends on this Windows computer, WSL and user process lifecycle. Reboot/logoff recovery/autostart remains a future infrastructure requirement, explicitly not implemented.
- Physical installed-iPhone acceptance remains pending; mock auth/capture tests and local retained replay cannot establish it.

The manifest is a fail-closed candidate contract, not proof that production already obeys it. No failure above was silently normalized.

## 15. Files changed

All implementation work is in the isolated RC. Original experimental root/worker source was not modified. Root handoff mirrors contain documentation and release metadata only and are not a runnable candidate checkout.

Changed/added paths relative to deployed base (plus this report and final result receipt):

```text
docs/TRIMAX_FULL_SYSTEM_STABILIZATION_AUDIT.md
docs/TRIMAX_RELEASE_AND_ACCEPTANCE_POLICY.md
package.json
release/competing-paths.json
release/evidence/database-baseline.json
release/evidence/install-baseline.json
release/evidence/node-ocr-source-state.json
release/evidence/worker-processes.json
release/evidence/worker-state.json
release/evidence/worker.diff
release/evidence/wsl-source-state.json
release/frozen-real-acceptance.json
release/trimax-release-manifest.json
scripts/ocr-legacy-evidence.cjs
scripts/ocr-legacy-worker.cjs
scripts/ocr-v2/shadow-worker.cjs
scripts/release/auth-flow-regression.cjs
scripts/release/authorize-build.cjs
scripts/release/contract-regression.cjs
scripts/release/contract.cjs
scripts/release/gate.cjs
scripts/release/physical-acceptance.cjs
scripts/release/recognizer-adapter.cjs
scripts/release/replay-document.cjs
scripts/release/runtime-check.cjs
scripts/release/sql-attestation-regression.cjs
scripts/release/startup-regression.cjs
src/app/admin/ocr-attempts/page.tsx
src/app/components/ReleaseDiagnostics.tsx
supabase/sql/2026-10-01-release-attestation.sql
```

Wrapper changes are limited to release startup/per-claim validation, release provenance in bounded diagnostics, owner/admin release display, and supported build gating. No OCR recognition/model, capture, resolver, payment or auth behavior repair was made. Private retained image bytes, secret credentials, model weights and inference crops were not committed.

## 16. Commits made

Local RC commits only; none pushed:

```text
cb00253905ad00f3696fb68b3e534e7c65d7403f Establish release identity and frozen acceptance contract without production rollout
863a6fde3a70045c84cd942aa633400e70469b45 Seal common executable revision and source bundle for release baseline
28611a487dd1f64516a5900b2d9d8ee9fe3332d2 Complete release runner wiring and exact build-receipt enforcement
ffde97456a60b9dcb64e96f9e459642d6c20a42f Seal final release-contract executable source identity
51898157a5f447819fb175defd7b61191cc05577 Pin and validate external OCR source dependencies alongside model weights
4f409f7f064cde8da9c8db1586a54efd248ec8d1 Seal complete executable and OCR dependency release identity
```

A final documentation/evidence-only commit records this handoff and receipt; its identity is the final RC HEAD in Git. It does not change the manifest's executable revision or invalidate the tested source bundle. No self-referential commit hash is embedded in this report. Metadata-only files are excluded from executable source hashing. The original checkout remains separate and unstaged.

## 17. Production changes made

**Production behavior changed: NO. Production deployed: NO. Production schema/flags changed: NO. Payment/business writes made by this task: NO. Workers restarted/replaced: NO.**

Production main remained `b5d0d51ab35a915292e54355d5c582a22876be11`. Both worker PIDs and original start timestamps were unchanged after the gate. Original worker dirty status remains preserved. Live catalog access was read-only; candidate SQL tests use local PGlite. Replays used private files and snapshots, with no live apply-payment call. No worker credential or scope was changed. No new physical scan was requested.

**Next action: WAIT FOR CHATGPT REVIEW.** Release gate failures are preserved, not repaired.
