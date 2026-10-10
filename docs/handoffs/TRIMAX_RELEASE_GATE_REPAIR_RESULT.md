# Trimax Release Gate Repair Result

Evidence date: 2026-10-07 (America/Los_Angeles). VERIFIED, LOCAL VALIDATION and PRODUCTION UNVERIFIED are explicitly separated.

## 1. Exact original failures

Baseline: `release/evidence/release-gate-result.json` (2026-10-01). Production was and remains unchanged by this task. Work is confined to isolated RC `C:/Users/robbi/.codex/worktrees/trimax-release-candidate/trimax`; private runtime cache/replay evidence is outside Git.

| Category | Original failure |
| --- | --- |
| A | npm ci: EBADPLATFORM; Linux-only Sharp direct dependencies |
| A | Missing working/full-pass traineddata cache; replay generated untracked eng.traineddata |
| B | Existing production workers had no loaded-source attestation; live DB validation stopped on missing model before RPC |
| C | Invoice send must read business-scoped settings, scope line items, and update status inside the authorized business. |
| C | Workspace switching must still load business metadata from business_users and property_users relationships. |
| D | check2721, check2734 and D: Previously automatic document now requires review |

## 2. Root cause of each failure category

**A — VERIFIED:** two Linux-only Sharp packages were mandatory direct dependencies. Several createWorker calls omitted cachePath, and legacy used a POSIX literal that did not match the Windows cache. Cache misses/generated files were infrastructure artifacts, not missing model training.

**B — VERIFIED:** candidate validation was conflated with the old production processes. The candidate read-only RPC is not installed; both live requests now reach it and return HTTP 404/PGRST202. Candidate local source/model/config validation succeeds. Existing production processes cannot be retroactively attested. This is DEPLOYMENT_PREREQUISITE, not a fabricated PASS.

**C — VERIFIED:** tests read Windows CRLF source but used literal LF multiline substrings. Normalizing line endings in the source readers restores the assertions without changing application authorization. New tests execute the actual authorization helper/query expressions and actual SQL policy with adversarial businesses. No authorization source repair was needed for these two failures.

**D — VERIFIED:** common failure class is loss/rejection of already observed document-field evidence between stages, not missing invoice/row-money recognition. There is not one identical faulty line across all three. check2721 rejects a corroborated stem versus its own printed descriptor as conflicting strings. check2734 selects a valid total field then replaces its bounds with a narrower structural line, failing the unchanged 80% coverage requirement. D suppresses its existing contrast pass after table mapping, loses the property heading, rejects a footer across a subpixel boundary, and ignores the completed mature numeric-total consensus when evaluating authority. Models, invoice fusion, resolver eligibility and numeric authority thresholds were not weakened.

**Remaining full-gate failure:** foundation-regression rejects the new direct documentTotalAuthority import in documentFields/moneyService.ts. This is an existing architecture-boundary allowlist, not a pixel/EXIF assertion failure. It was not changed after the full gate failed. No follow-on repair cycle was started.

**Additional remaining retained regressions found in the COMPLETE gate:** B: normalization unchanged (270°, 2762×1147); adding the contrast observations changes semantic row mapping from five physical/five complete rows to four physical/two complete rows. C: normalization unchanged (0°, 2697×1123); selected total grouping retains the first narrow 252.95 word box instead of enclosing the later complete 2,252.95 box. Prioritizing that selected bound produces an incomplete crop. The authority contract rejects the cropped 252.95 against the correctly observed 2,252.95 header. These are evidence accumulation/localization regressions, not reasons to weaken frozen expectations. No repair was attempted after the full gate.

## 3. Files changed

Candidate executable revision: `f508a721c7b5c78e1521d5faea710c175be38ecf`. Local commits only:

```text
f508a721c7b5c78e1521d5faea710c175be38ecf Repair candidate reproducibility and evidence handoff without production rollout
6b4d5d3bdb2ae8da1de0a9170530615325a433ff Seal release candidate repair source and external cache contract
```

- `docs/TRIMAX_RELEASE_AND_ACCEPTANCE_POLICY.md`
- `package-lock.json`
- `package.json`
- `release/trimax-release-manifest.json`
- `scripts/business-read-isolation-regression.ts`
- `scripts/ocr-v2/document-total-regression.cjs`
- `scripts/release/authorization-execution-regression.cjs`
- `scripts/release/contract.cjs`
- `scripts/release/evidence-handoff-regression.cjs`
- `scripts/release/gate.cjs`
- `scripts/release/provision-cache.cjs`
- `scripts/release/runtime-check.cjs`
- `scripts/tenant-isolation-hardening-regression.ts`
- `src/app/api/payments/extract-check-stub/route.ts`
- `src/app/lib/documentFields/moneyService.ts`
- `src/app/lib/ocrRuntimeCache.ts`
- `src/app/lib/ocrV2/recognition/documentIdentity.ts`
- `src/app/lib/ocrV2/recognition/documentTotalAuthority.ts`
- `src/app/lib/ocrV2/recognition/identityHandoff.ts`
- `src/app/lib/ocrV2/recognition/index.ts`
- `src/app/lib/ocrV2/recognition/paymentEvidence.ts`
- `src/app/lib/ocrV2/recognition/semanticMoney.ts`
- `src/app/lib/ocrV2/semantics/index.ts`
- `src/app/lib/ocrV2/shadow/pipeline.ts`

This report and `release/evidence/release-gate-repair-result.json` are added afterward as documentation/evidence only. A final report-only commit does not alter the executable identity. No source files in the original checkout or production worker checkout were copied over or edited. Frozen truth, corpus expectations, recognition model files, resolver source, payment source, duplicate/split/correction rules and production configuration were not changed.

## 4. Package/install repair

Moved `@img/sharp-linux-x64@0.35.3` and `@img/sharp-libvips-linux-x64@1.3.2` from dependencies to optionalDependencies, retaining their Linux/CPU constraints and exact versions. Windows skips incompatible optional packages; Linux entries remain in the lockfile. No recognition dependency version changed; the pinned Node OCR source bundle still matches. The lockfile refresh also records bundled optional Tailwind WASM dependencies.

Ran standard `npm ci` before the full gate, and the gate independently runs `npm ci` itself. No --force or --ignore-scripts flags were used. Both completed. The current npm installation emits allow-scripts warnings for three dependencies (sharp 0.34.5 nested package, tesseract.js 7.0.0, unrs-resolver 1.11.1) and reports 15 audit vulnerabilities (1 low, 1 moderate, 12 high, 1 critical). Those are recorded; no npm audit fix, global policy change, package upgrade or unrelated repair was performed. A Linux deployment/install was not executed in this task; preservation is established from platform metadata and unchanged hashes, not a live Vercel deployment.

## 5. Model/cache repair

All server/worker Tesseract paths now use `src/app/lib/ocrRuntimeCache.ts`: `os.tmpdir()/trimax-ocr/tesseract-js-7/eng`. The root is outside the source checkout. Recognition OEM/PSM, image pixels, numeric grammar and model bytes are unchanged by cache relocation.

Manifest path contract: `RUNTIME_CACHE/eng.traineddata`; SHA-256 `5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747`. Cache was seeded from existing hash-verified bytes, not redownloaded/trained. `scripts/release/provision-cache.cjs <verified-traineddata-file>` provides reproducible explicit provisioning and refuses mismatched source/existing cache. Models were not committed.

The original byte-frozen recognition test now excludes only cache-location imports/statements when comparing recognition code. It still compares all remaining recognition logic against the original committed contract. Model/source validation passed, and final cleanliness is reported below.

## 6. Attestation status

**LOCAL VALIDATION:** source/model/configuration validation passed for both candidate runtimes in newly launched read-only validation processes. Source revision, clean checkout, executable bundle, model hashes, Node OCR dependency bytes, WSL recognizer repos/package versions, project URL, business ID, sanitized config hash and environment constraints were checked. Startup remains fail-closed before job claims. Invalid config/model regressions pass.

**LOCAL SQL/PGlite:** the existing candidate attestation RPC is installed only into disposable local SQL for testing. Tests exercise invalid credential/admin rejection, catalog fingerprint creation and no queue writes. This is not a live production credential-scope proof.

**PRODUCTION READ-ONLY:** both RPC probes return DEPLOYMENT_PREREQUISITE (HTTP 404/PGRST202). No RPC/schema installation was attempted. Live current schema/trigger/RPC/policy/grant hashes and credential-scope response therefore remain unverified; historical October 1 fingerprints remain pinned, not silently refreshed. No candidate operational worker claimed production work.

Exact final probe log:

```text
legacy candidate source/model/config validation PASS
v2-shadow candidate source/model/config validation PASS
{"results":[{"engine":"legacy","status":"DEPLOYMENT_PREREQUISITE","error":"RUNTIME DRIFT DETECTED: read-only database/credential attestation unavailable (HTTP 404)"},{"engine":"v2-shadow","status":"DEPLOYMENT_PREREQUISITE","error":"RUNTIME DRIFT DETECTED: read-only database/credential attestation unavailable (HTTP 404)"}]}
```

No running production worker was restarted/replaced. A read-only process inventory on October 7 found no matching legacy/shadow worker command lines; they were not started under this task. Their old loaded revisions cannot be proved from disk. The old dirty worker checkout is preserved. Neither worker credential nor payment-write permission was changed. A complete release remains blocked by prerequisites.

## 7. Authorization regression findings

Classification: **B, stale formatting assumptions**, for both original failures.

- Invoice route: `src/app/api/invoices/[id]/send-email/route.ts`. It reads the invoice's owning business, checks requested workspace against that business, then `requireWorkspaceAccess` verifies token through Supabase auth and business_users filtered by business_id plus user/email membership before settings, target line-items or send/status work. Authorized cron-secret path is unchanged. Settings filter business_id + email_settings; line-items filter business_id + target invoice IDs; status updates filter business_id + target IDs.
- Workspace: `loadWorkspaceAccess` in workspaceAccess.ts obtains authenticated user, queries both business_users and property_users by user/email membership and joins businesses(id,name,slug). propertyAccess.ts uses the property membership source and corresponding business join.
- Server database boundary: `2026-08-10-businesses-read-policy-hardening.sql` uses `trimax_can_read_business`, combining both membership relations; authenticated businesses SELECT policy uses that helper. Anonymous enumeration is denied. Existing SQL only was executed locally.

New `authorization-execution-regression.cjs` extracts and executes actual route authorization and query expressions, tests member A denied business B, anonymous denial, mixed A/B target IDs for line-items/status, business-scoped settings, and actual SQL RLS for business member/property-only member/unrelated member/anonymous user. All pass. Original assertions normalize CRLF to LF; they were not deleted or changed to accept an insecure alternative. Application auth behavior is unchanged. Tests establish these cases, not exhaustive proof of every authorization endpoint.

## 8. check2721 comparison

First divergence: identity handoff. The mature layer authoritatively recognized the stem while page semantics preserved its printed descriptor. Strict raw-string inequality cleared payor. The repair accepts only exact formatting-normalized stem or the same candidate’s already observed descriptor string; different names still conflict.

Historical successful scorecard (frozen before repair):

```json
{
  "rows": 2,
  "detectedRows": 2,
  "invoiceExact": 2,
  "amountExact": 2,
  "fields": {
    "amounts": [
      {
        "expected": 109900,
        "actual": 109900,
        "exact": true,
        "ambiguity": "supported"
      },
      {
        "expected": 109900,
        "actual": 109900,
        "exact": true,
        "ambiguity": "supported"
      }
    ],
    "authoritativeTotalCents": {
      "expected": 219800,
      "actual": 219800,
      "exact": true,
      "missing": false,
      "unlabeled": false
    },
    "checkNumber": {
      "expected": "2721",
      "actual": null,
      "exact": false,
      "missing": true,
      "unlabeled": false
    },
    "checkDate": {
      "expected": "2026-07-07",
      "actual": "2026-07-07",
      "exact": true,
      "missing": false,
      "unlabeled": false
    },
    "payor": {
      "expected": null,
      "actual": "North Creek Apartmen",
      "exact": null,
      "missing": false,
      "unlabeled": true
    }
  },
  "resolverStatus": "resolved",
  "automaticRows": 2,
  "fullSuccess": true
}
```

Before repair:

```json
{
  "orientation": 270,
  "dimensions": {
    "width": 3758,
    "height": 1569
  },
  "rows": [
    {
      "rowId": "physical-row-0",
      "invoice": "INV-0500",
      "invoiceSelected": true,
      "acceptedCents": [
        109900
      ]
    },
    {
      "rowId": "physical-row-1",
      "invoice": "INV-0501",
      "invoiceSelected": true,
      "acceptedCents": [
        109900
      ]
    }
  ],
  "header": {
    "payor": null,
    "checkNumber": "2721",
    "checkDate": null,
    "total": {
      "amount": 2198,
      "source": "explicit-document-total",
      "payable": true
    },
    "provenance": "Same-capture vendor-neutral visual evidence; no verified answers"
  },
  "identityConsensus": "authoritative",
  "identityValue": "north creek",
  "totalAuthorityReason": "Explicit header total agrees with independently supported isolated footer value",
  "resolver": "review-required",
  "automaticInvoiceIds": [],
  "reconciliation": {
    "subtotal": 219800,
    "total": 219800,
    "difference": 0,
    "evidenceClass": "observed-plus-derived-arithmetic",
    "paymentAuthority": false
  },
  "reviewBlockers": [
    "Payor/customer could not be confidently read from the stub.",
    "Resolver: inconsistent"
  ]
}
```

Full final-gate result:

```json
{
  "orientation": 270,
  "dimensions": {
    "width": 3758,
    "height": 1569
  },
  "rows": [
    {
      "rowId": "physical-row-0",
      "invoice": "INV-0500",
      "invoiceSelected": true,
      "acceptedCents": [
        109900
      ]
    },
    {
      "rowId": "physical-row-1",
      "invoice": "INV-0501",
      "invoiceSelected": true,
      "acceptedCents": [
        109900
      ]
    }
  ],
  "header": {
    "payor": "north creek",
    "checkNumber": "2721",
    "checkDate": null,
    "total": {
      "amount": 2198,
      "source": "explicit-document-total",
      "payable": true
    },
    "provenance": "Same-capture vendor-neutral visual evidence; no verified answers"
  },
  "identityConsensus": "authoritative",
  "identityValue": "north creek",
  "totalAuthorityReason": "Unique final amount-column field corroborated by page and bounded field observations",
  "resolver": "automatic",
  "automaticInvoiceIds": [
    "5bae2847-efc7-4444-8bad-40b09924421a",
    "eea7399b-40a7-4ca4-8393-329b0402f052"
  ],
  "reconciliation": {
    "subtotal": 219800,
    "total": 219800,
    "difference": 0,
    "evidenceClass": "observed-plus-derived-arithmetic",
    "paymentAuthority": false
  },
  "reviewBlockers": []
}
```

Final frozen acceptance: **PASS**. Frozen labels never entered OCR. Resolver receives only observed visual candidates and the existing snapshot afterward. Check/date gaps remain subject to the unchanged resolver; no benchmark digits/dates were inserted.

## 9. check2734 comparison

First divergence: total crop handoff. Selected OCR field bounds were x=3537,y=1269,w=250,h=60; the structural crop y=1283,h=51 covered only 46/60 of that observed box, below the existing 80% requirement. The selected localized field now takes precedence. Geometry/label/value and ambiguity thresholds are unchanged.

Historical successful scorecard (frozen before repair):

```json
{
  "rows": 2,
  "detectedRows": 2,
  "invoiceExact": 2,
  "amountExact": 2,
  "fields": {
    "amounts": [
      {
        "expected": 109900,
        "actual": 109900,
        "exact": true,
        "ambiguity": "supported"
      },
      {
        "expected": 109900,
        "actual": 109900,
        "exact": true,
        "ambiguity": "supported"
      }
    ],
    "authoritativeTotalCents": {
      "expected": 219800,
      "actual": 219800,
      "exact": true,
      "missing": false,
      "unlabeled": false
    },
    "checkNumber": {
      "expected": "2734",
      "actual": null,
      "exact": false,
      "missing": true,
      "unlabeled": false
    },
    "checkDate": {
      "expected": "2026-07-10",
      "actual": null,
      "exact": false,
      "missing": true,
      "unlabeled": false
    },
    "payor": {
      "expected": null,
      "actual": "North Creek Apartmen",
      "exact": null,
      "missing": false,
      "unlabeled": true
    }
  },
  "resolverStatus": "resolved",
  "automaticRows": 2,
  "fullSuccess": true
}
```

Before repair:

```json
{
  "orientation": 270,
  "dimensions": {
    "width": 4032,
    "height": 3024
  },
  "rows": [
    {
      "rowId": "physical-row-0",
      "invoice": "INV-0502",
      "invoiceSelected": true,
      "acceptedCents": [
        109900
      ]
    },
    {
      "rowId": "physical-row-1",
      "invoice": "INV-0503",
      "invoiceSelected": true,
      "acceptedCents": [
        109900
      ]
    }
  ],
  "header": {
    "payor": "north creek",
    "checkNumber": null,
    "checkDate": null,
    "total": null,
    "provenance": "Same-capture vendor-neutral visual evidence; no verified answers"
  },
  "identityConsensus": "authoritative",
  "identityValue": "north creek",
  "totalAuthorityReason": "No sufficiently reliable exact TOTAL label outside the body",
  "resolver": "review-required",
  "automaticInvoiceIds": [],
  "reconciliation": {
    "subtotal": 219800,
    "total": null,
    "difference": null,
    "evidenceClass": "observed-plus-derived-arithmetic",
    "paymentAuthority": false
  },
  "reviewBlockers": [
    "No sufficiently reliable exact TOTAL label outside the body",
    "Document total evidence requires review.",
    "Check total could not be confidently read from the stub.",
    "Missing authoritative total or nonzero exact-cent difference.",
    "Resolver: inconsistent"
  ]
}
```

Full final-gate result:

```json
{
  "orientation": 270,
  "dimensions": {
    "width": 4032,
    "height": 3024
  },
  "rows": [
    {
      "rowId": "physical-row-0",
      "invoice": "INV-0502",
      "invoiceSelected": true,
      "acceptedCents": [
        109900
      ]
    },
    {
      "rowId": "physical-row-1",
      "invoice": "INV-0503",
      "invoiceSelected": true,
      "acceptedCents": [
        109900
      ]
    }
  ],
  "header": {
    "payor": "north creek",
    "checkNumber": null,
    "checkDate": null,
    "total": {
      "amount": 2198,
      "source": "explicit-document-total",
      "payable": true
    },
    "provenance": "Same-capture vendor-neutral visual evidence; no verified answers"
  },
  "identityConsensus": "authoritative",
  "identityValue": "north creek",
  "totalAuthorityReason": "Unique final amount-column field corroborated by page and bounded field observations",
  "resolver": "automatic",
  "automaticInvoiceIds": [
    "6b33bb8c-7af0-49f2-9f42-f8084564da2d",
    "82862232-6609-41a4-977d-8a477e0f64f0"
  ],
  "reconciliation": {
    "subtotal": 219800,
    "total": 219800,
    "difference": 0,
    "evidenceClass": "observed-plus-derived-arithmetic",
    "paymentAuthority": false
  },
  "reviewBlockers": []
}
```

Final frozen acceptance: **PASS**. Frozen labels never entered OCR. Resolver receives only observed visual candidates and the existing snapshot afterward. Check/date gaps remain subject to the unchanged resolver; no benchmark digits/dates were inserted.

## 10. D comparison

First divergence: document-field coverage. Native/grayscale mapped rows but missed Property; the existing bounded contrast pass had been skipped based solely on table support. It now remains available for missing identity/total coverage. Footer line left=2153×1.2158333333=2617.689 was rejected against integer amount-left=2618. Center plus majority-column overlap removes strict rounding sensitivity while preserving below-row, right-alignment and bounded-gap checks. Finally, mature recognizers independently agreed on the isolated footer total, but authority was finalized before consuming that numeric consensus. The same existing header/geometry authority is reevaluated after completed mature evidence; no confidence is fabricated and observed conflicts block.

Historical successful scorecard (frozen before repair):

```json
{
  "rows": 5,
  "detectedRows": 5,
  "invoiceExact": 5,
  "amountExact": 5,
  "fields": {
    "amounts": [
      {
        "expected": 109900,
        "actual": 109900,
        "exact": true,
        "ambiguity": "supported"
      },
      {
        "expected": 130000,
        "actual": 130000,
        "exact": true,
        "ambiguity": "supported"
      },
      {
        "expected": 45840,
        "actual": 45840,
        "exact": true,
        "ambiguity": "supported"
      },
      {
        "expected": 130000,
        "actual": 130000,
        "exact": true,
        "ambiguity": "supported"
      },
      {
        "expected": 34850,
        "actual": 34850,
        "exact": true,
        "ambiguity": "supported"
      }
    ],
    "authoritativeTotalCents": {
      "expected": 450590,
      "actual": 450590,
      "exact": true,
      "missing": false,
      "unlabeled": false
    },
    "checkNumber": {
      "expected": "2804",
      "actual": "2804",
      "exact": true,
      "missing": false,
      "unlabeled": false
    },
    "checkDate": {
      "expected": "2026-08-25",
      "actual": null,
      "exact": false,
      "missing": true,
      "unlabeled": false
    },
    "payor": {
      "expected": null,
      "actual": "North Creek Apartmen",
      "exact": null,
      "missing": false,
      "unlabeled": true
    }
  },
  "resolverStatus": "resolved",
  "automaticRows": 5,
  "fullSuccess": true
}
```

Before repair:

```json
{
  "orientation": 0,
  "dimensions": {
    "width": 2918,
    "height": 1213
  },
  "rows": [
    {
      "rowId": "physical-row-0",
      "invoice": "INV-0520",
      "invoiceSelected": true,
      "acceptedCents": [
        109900
      ]
    },
    {
      "rowId": "physical-row-1",
      "invoice": "INV-0521",
      "invoiceSelected": false,
      "acceptedCents": [
        130000
      ]
    },
    {
      "rowId": "physical-row-2",
      "invoice": "INV-0522",
      "invoiceSelected": true,
      "acceptedCents": [
        45840
      ]
    },
    {
      "rowId": "physical-row-3",
      "invoice": "INV-0524",
      "invoiceSelected": true,
      "acceptedCents": [
        130000
      ]
    },
    {
      "rowId": "physical-row-4",
      "invoice": "INV-0525",
      "invoiceSelected": true,
      "acceptedCents": [
        34850
      ]
    }
  ],
  "header": {
    "payor": null,
    "checkNumber": "2804",
    "checkDate": null,
    "total": null,
    "provenance": "Same-capture vendor-neutral visual evidence; no verified answers"
  },
  "identityConsensus": "unknown",
  "identityValue": null,
  "totalAuthorityReason": "Footer candidate is not an isolated final amount-column field",
  "resolver": "review-required",
  "automaticInvoiceIds": [],
  "reconciliation": {
    "subtotal": 450590,
    "total": null,
    "difference": null,
    "evidenceClass": "observed-plus-derived-arithmetic",
    "paymentAuthority": false
  },
  "reviewBlockers": [
    "Insufficient labeled organization evidence",
    "Footer candidate is not an isolated final amount-column field",
    "Document total evidence requires review.",
    "Payor/customer could not be confidently read from the stub.",
    "Check total could not be confidently read from the stub.",
    "Missing authoritative total or nonzero exact-cent difference.",
    "Resolver: inconsistent"
  ]
}
```

Full final-gate result:

```json
{
  "orientation": 0,
  "dimensions": {
    "width": 2918,
    "height": 1213
  },
  "rows": [
    {
      "rowId": "physical-row-0",
      "invoice": "INV-0520",
      "invoiceSelected": true,
      "acceptedCents": [
        109900
      ]
    },
    {
      "rowId": "physical-row-1",
      "invoice": "INV-0521",
      "invoiceSelected": false,
      "acceptedCents": [
        130000
      ]
    },
    {
      "rowId": "physical-row-2",
      "invoice": "INV-0522",
      "invoiceSelected": true,
      "acceptedCents": [
        45840
      ]
    },
    {
      "rowId": "physical-row-3",
      "invoice": "INV-0524",
      "invoiceSelected": true,
      "acceptedCents": [
        130000
      ]
    },
    {
      "rowId": "physical-row-4",
      "invoice": "INV-0525",
      "invoiceSelected": true,
      "acceptedCents": [
        34850
      ]
    }
  ],
  "header": {
    "payor": "north creek",
    "checkNumber": "2804",
    "checkDate": null,
    "total": {
      "amount": 4505.9,
      "source": "explicit-document-total",
      "payable": true
    },
    "provenance": "Same-capture vendor-neutral visual evidence; no verified answers"
  },
  "identityConsensus": "authoritative",
  "identityValue": "north creek",
  "totalAuthorityReason": "Explicit header total agrees with independently supported isolated footer value",
  "resolver": "automatic",
  "automaticInvoiceIds": [
    "7e4bd095-2dc6-4723-b6ff-38e5ef2eed02",
    "19171cb2-cd38-43a0-aa62-f7cad82cff2e",
    "c5a1ce10-aa95-4337-9ba8-967bf7a9c308",
    "677f5a6a-b64c-43b4-95ee-d9d30ec8f21d",
    "a8abab4f-365b-48dc-967b-6ff9ef8f00b1"
  ],
  "reconciliation": {
    "subtotal": 450590,
    "total": 450590,
    "difference": 0,
    "evidenceClass": "observed-plus-derived-arithmetic",
    "paymentAuthority": false
  },
  "reviewBlockers": []
}
```

Final frozen acceptance: **PASS**. Frozen labels never entered OCR. Resolver receives only observed visual candidates and the existing snapshot afterward. Check/date gaps remain subject to the unchanged resolver; no benchmark digits/dates were inserted.

## 11. Full final gate matrix

Command: `npm run trimax:release-gate`. Start 2026-10-07T21:07:54.211Z; finish 2026-10-07T21:12:34.783Z. Metadata HEAD tested: `6b4d5d3bdb2ae8da1de0a9170530615325a433ff`. Source bundle: `02e490e6dede7e9a615ba02ed95225fbae337ea99d8efd6c96d293e7c8912776`. Outcome **FAIL**. Code gate CODE_GATE_FAILED; retained gate RETAINED_REAL_GATE_FAILED.

| Check | Status | Milliseconds | Failure / prerequisite |
| --- | --- | --- | --- |
| clean-manifest-source-start | PASS | not separately timed | — |
| frozen-corpus-integrity | PASS | not separately timed | — |
| clean-dependency-install | PASS | 20408 | — |
| production-runtime-attestation | DEPLOYMENT_PREREQUISITE | not separately timed | Existing production workers intentionally unchanged; candidate validation cannot attest old loaded code |
| model-bundle | PASS | not separately timed | — |
| runtime-source-bundles | PASS | not separately timed | — |
| live-database-attestation | DEPLOYMENT_PREREQUISITE | 3507 | Read-only RPC not installed in production; local SQL validation is separate |
| sql-test-runtime | PASS | not separately timed | — |
| contract-regression | PASS | 63 | — |
| auth-flow-regression | PASS | 259 | — |
| startup-regression | PASS | 1628 | — |
| sql-attestation-regression | PASS | 1133 | — |
| authorization-execution-regression | PASS | 1244 | — |
| evidence-handoff-regression | PASS | 78 | — |
| shadow-capture-regression | PASS | 268 | — |
| camera-lifecycle-regression | PASS | 94 | — |
| capture-durability-regression | PASS | 264 | — |
| ocr-object-upload-regression | PASS | 420 | — |
| ocr-evidence-persistence-regression | PASS | 1315 | — |
| ocr-legacy-job-regression | PASS | 204 | — |
| shadow-regression | PASS | 450 | — |
| canonical-regression | PASS | 211 | — |
| canonical-sql-regression | PASS | 2845 | — |
| shadow-sql-regression | PASS | 1142 | — |
| foundation-regression | FAIL | 555 | Exit 1 |
| layout-regression | PASS | 1110 | — |
| field-regression | PASS | 1270 | — |
| invoice-study-regression | PASS | 640 | — |
| fusion-regression | PASS | 96 | — |
| resolver-regression | PASS | 153 | — |
| payment-evidence-regression | PASS | 1280 | — |
| document-total-regression | PASS | 364 | — |
| identity-regression | PASS | 165 | — |
| semantics-regression | PASS | 219 | — |
| orientation-heading-regression | PASS | 2699 | — |
| legacy-direction-regression | PASS | 2553 | — |
| legacy-first-pass-regression | PASS | 352 | — |
| physical-row-regression | PASS | 156 | — |
| money-regression | PASS | 187 | — |
| mature-money-regression | PASS | 88 | — |
| shared-money-regression | PASS | 164 | — |
| organization-identity-regression | PASS | 91 | — |
| total-localization-regression | PASS | 140 | — |
| residual-regression | PASS | 298 | — |
| regression | PASS | 72 | — |
| remittance-matching-regression | PASS | 173 | — |
| remittance-contract-regression | PASS | 150 | — |
| remittance-retry-regression | PASS | 123 | — |
| duplicate-remittance-regression | PASS | 112 | — |
| payment-application-regression | PASS | 79 | — |
| payment-state-lifecycle-regression | PASS | 90 | — |
| invoice-correction-regression | PASS | 81 | — |
| split-source-relationship-regression | PASS | 82 | — |
| split-invoice-send-regression | PASS | 76 | — |
| tenant-isolation-hardening-regression | PASS | 81 | — |
| business-read-isolation-regression | PASS | 78 | — |
| owner-server-auth-regression | PASS | 83 | — |
| account-management-regression | PASS | 85 | — |
| stabilization-regression | PASS | 26113 | — |
| frozen-business-snapshot | PASS | not separately timed | — |
| retained-check2715-legacy | PASS | 1713 | — |
| retained-check2715-v2-shadow | PASS | 27100 | — |
| retained-check2721-legacy | PASS | 11160 | — |
| retained-check2721-v2-shadow | PASS | 21449 | — |
| retained-check2734-legacy | PASS | 1661 | — |
| retained-check2734-v2-shadow | PASS | 20008 | — |
| retained-check2743-legacy | PASS | 1470 | — |
| retained-check2743-v2-shadow | PASS | 17380 | — |
| retained-A-legacy | PASS | 4378 | — |
| retained-A-v2-shadow | PASS | 13837 | — |
| retained-D-legacy | PASS | 922 | — |
| retained-D-v2-shadow | PASS | 14704 | — |
| retained-B-legacy | PASS | 1896 | — |
| retained-B-v2-shadow | PASS | 16076 | — |
| retained-C-legacy | PASS | 4014 | — |
| retained-C-v2-shadow | PASS | 11905 | — |
| lint | PASS | 15737 | — |
| typescript | PASS | 1656 | — |
| production-build | PASS | 13191 | — |
| clean-manifest-source-end | PASS | not separately timed | — |

Machine-readable receipt: `release/evidence/release-gate-repair-result.json`. Full private logs/results: `C:/Users/robbi/AppData/Local/Trimax/release-gates/2026-10-07T21-07-54-211Z`. The command's immediate console labels use its generic pass/fail printer before prerequisite classification; the saved status is authoritative: missing live RPC and old production runtime are **DEPLOYMENT_PREREQUISITE**, not PASS. Neither grants rollout approval.

The foundation failure is preserved exactly:

```text
(node:5668) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///C:/Users/robbi/.codex/worktrees/trimax-release-candidate/trimax/src/app/lib/ocrStillDirection.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to C:\Users\robbi\.codex\worktrees\trimax-release-candidate\trimax\package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
AssertionError [ERR_ASSERTION]: Production import of v2 inference: src\app\lib\documentFields\moneyService.ts
    at scan (C:\Users\robbi\.codex\worktrees\trimax-release-candidate\trimax\scripts\ocr-v2\foundation-regression.cjs:60:17)
    at scan (C:\Users\robbi\.codex\worktrees\trimax-release-candidate\trimax\scripts\ocr-v2\foundation-regression.cjs:57:13)
    at scan (C:\Users\robbi\.codex\worktrees\trimax-release-candidate\trimax\scripts\ocr-v2\foundation-regression.cjs:57:13)
    at C:\Users\robbi\.codex\worktrees\trimax-release-candidate\trimax\scripts\ocr-v2\foundation-regression.cjs:64:5 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}
```

No failures from this full final run were repaired, waived or rerun away.

## 12. Frozen-document matrix

| Document | Frozen expectation | Acceptance | Rows | Invoice candidates | Accepted cents | Total cents | Resolver | Difference cents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| check2715 | SAFELY_REQUIRE_REVIEW | PASS | 2 | , 140205 | 1102431, 109900 | UNKNOWN | review-required | UNKNOWN |
| check2721 | AUTOMATICALLY_RESOLVE | PASS | 2 | INV-0500, INV-0501 | 109900, 109900 | 219800 | automatic | 0 |
| check2734 | AUTOMATICALLY_RESOLVE | PASS | 2 | INV-0502, INV-0503 | 109900, 109900 | 219800 | automatic | 0 |
| check2743 | SAFELY_REQUIRE_REVIEW | PASS | 1 | INV-0504 | 109900 | 109900 | review-required | 0 |
| A | SAFELY_REQUIRE_REVIEW | PASS | 5 | INV-0508, INV-0509, INV-0511, INV-0510, INV-0512 | 109900, 109900, 109900, 109900, 109900 | UNKNOWN | review-required | UNKNOWN |
| D | AUTOMATICALLY_RESOLVE | PASS | 5 | INV-0520, INV-0521, INV-0522, INV-0524, INV-0525 | 109900, 130000, 45840, 130000, 34850 | 450590 | automatic | 0 |
| B | SAFELY_REQUIRE_REVIEW | FAIL | 2 | ,  | UNKNOWN, UNKNOWN | UNKNOWN | review-required | UNKNOWN |
| C | AUTOMATICALLY_RESOLVE | FAIL | 2 | INV-0506, INV-0507 | 130000, 95295 | UNKNOWN | review-required | UNKNOWN |

All eight were run through both legacy and v2 entry points. Each legacy replay returned a terminal response; raw candidate OCR is not treated as accepted payment data. Historical safe-review expectations remain frozen, including A/B/check2715/check2743. Corpus SHA-256 remains `29f8a84ab995c246d2cedc9943ce391d56af55b09564dbe23329e357a7df6f7f`. These are historical retained real documents, not fresh physical acceptance; no new scan occurred.

## 13. Wrong-acceptance counts

Configured frozen-corpus wrong-acceptance violations: **0**.

```json
{
  "violations": [],
  "paymentEndpointCalls": 0,
  "productionPaymentWrites": 0
}
```

The scorer checks selected invoice tokens, accepted row amounts, authoritative totals, known automatic record IDs, duplicates and exact reconciliation. Missing ground truth (some payor/date/unit/record IDs) remains UNKNOWN and is not invented. Raw rejected/candidate text is not counted as accepted money. Legacy extraction does not itself apply payments; no live review/payment was exercised. Existing payment/duplicate/split/correction tests remain part of the matrix. No claim of fresh-image accuracy or physical acceptance is made.

### Intermediate numeric evidence must also be disclosed

The configured gate scorer checks final authoritative totals, not every mature-money total-field consensus. A post-run read-only audit found **2 incorrect accepted numeric footer consensuses**. Conservatively, the final handoff reports Wrong accepted values = 2, not zero. Both are rejected before document-total authority and no payment is applied. Wrong authoritative totals = 0; wrong accepted row amounts/invoice tokens/automatic record IDs reported by the frozen scorer = 0. This distinction exposes a scoring-coverage gap; it was not patched after the final gate.

```json
[
  {
    "document": "B",
    "field": "total",
    "rowId": "document-total",
    "acceptedNumericCents": 9900,
    "expectedCents": 549500,
    "authoritativeTotal": null
  },
  {
    "document": "C",
    "field": "total",
    "rowId": "document-total",
    "acceptedNumericCents": 25295,
    "expectedCents": 225295,
    "authoritativeTotal": null
  }
]
```

## 14. Git cleanliness

Gate start: PASS. Gate end: PASS. The new cache did not create eng.traineddata in the RC. No generated file was removed after the run to turn a dirty gate green. This report and receipt are sealed in a documentation-only local commit after the run; executable source remains `f508a721c7b5c78e1521d5faea710c175be38ecf`. No push. Frozen acceptance source/expectations unchanged.

## 15. Remaining deployment prerequisites

1. Production read-only attestation RPC is not installed; live DB/credential scope attestation cannot pass yet. It was tested only in local SQL.
2. Existing production worker loaded versions are not attested and were not switched/restarted. A candidate cannot attest a different old process by reading its checkout.
3. The full code gate also has an architecture-boundary failure: shared money service directly imports document-total authority outside the existing allowlist. This remains FAIL, not a deployment prerequisite or automatic waiver.
4. Physical acceptance remains PENDING. No installed-iPhone test was performed.

Additional recorded limitations: npm reports audit vulnerabilities and allow-scripts warnings; no dependency security remediation or npm policy change was attempted. Worker autostart/reboot recovery and fresh production health are not repaired or verified by offline acceptance.

Failures are grouped, preserved and stopped for review. No new repair cycle or deployment was started.

Remaining failures grouped by root cause:

- **Evidence accumulation/localization:** B row coverage and C incomplete total crop regressions; two wrong intermediate footer consensuses, both authority-rejected.
- **Architecture boundary:** new direct total-authority import rejected by foundation isolation test.
- **Deployment prerequisites:** unavailable production attestation RPC and no attested production worker switch.

The first two are candidate failures. They are not relabeled as deployment prerequisites.

## 16. Production changes made

**Production behavior changed: NO. Production deployed: NO. Production schema/flags modified: NO. Production workers restarted/replaced: NO. Payment/business writes: NO.**

Remote main remained `b5d0d51ab35a915292e54355d5c582a22876be11` at the read-only check. Model weights, production worker configuration/credentials and the existing dirty worker checkout remain untouched. Only read-only attestation probes contacted production; they failed with missing RPC. All replay/SQL writes were private local evidence or disposable PGlite. No live apply-payment calls.

**Physical acceptance: PENDING. Next action: WAIT FOR CHATGPT REVIEW.**
