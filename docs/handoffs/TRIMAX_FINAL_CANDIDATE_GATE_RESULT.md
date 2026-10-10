# Trimax Final Candidate Gate Result

Evidence date: 2026-10-08T05:52:23.058Z. This is local candidate validation, not production or physical acceptance.

## 1. Scope and sealed release

Worktree: `C:\Users\robbi\.codex\worktrees\trimax-release-candidate\trimax`. Branch: `codex/trimax-release-contract`.

- Release: `trimax-release-contract-20261007-rc3`
- Executable commit (web/legacy/v2): `c770a4e1c1033c151e55602ffb84b28c05bf9c63`
- Clean gate-start seal: `12df6b66d320cf8a74b581d911c916227ea2377b`
- Source bundle SHA-256: `94ec80a4f9828f260fa8541c18766f5c9717e2609d332b50c10a79e0f8710f41`
- Frozen corpus SHA-256, unchanged: `29f8a84ab995c246d2cedc9943ce391d56af55b09564dbe23329e357a7df6f7f`
- Manifest: `release/trimax-release-manifest.json`
- Baseline production commit (not replaced): `b5d0d51ab35a915292e54355d5c582a22876be11`
- Baseline Vercel deployment (not replaced): `A6ZKcvjyxFE8483eBofsK9srxhHq`

Only B accumulation, C complete-field localization, authority dependency direction, related tests/scoring and release metadata were changed. No model weights, resolver eligibility, payment application, duplicate/split/correction safeguards, production schema, flags or worker processes were changed. Private images and replay outputs remain outside Git. No expected IDs, values or business balances were added to inference.

## 2. Full gate disposition

**Full release gate: FAIL. Frozen acceptance: 8/8.**

Candidate check failures: NONE.
Deployment prerequisites: production-runtime-attestation, live-database-attestation.

The complete release status intentionally remains FAIL while deployment prerequisites exist. They are neither waived nor relabeled PASS. No production attestation RPC was installed; no candidate workers were switched or started against production. The console runner initially prints a generic PASS/FAIL before attaching prerequisite status; the durable JSON statuses below are authoritative.

Gate started 2026-10-08T05:47:38.396Z; finished 2026-10-08T05:52:23.058Z.
Private full output: `C:/Users/robbi/AppData/Local/Trimax/release-gates/2026-10-08T05-47-38-395Z`.
Committed receipt: `release/evidence/final-candidate-gate-result.json`.

## 3. B: exact first divergence

Canonical source SHA-256: `30f2ad3b1356cfffcbf396081ccfa52ea97823fd26779fc6e0a4dcb2b4a8ff17`.
Normalized source SHA-256: `9dbceb3358784580555ab042cf54838f0cae3da9f87d0217bdb5cd9f432da7d9`.
Unchanged rotation/dimensions: 270 degrees, 2762 x 1147.

Native alone found four bands; native plus grayscale established five physical rows with five complete invoice/amount regions. The old final interpretDocument call passed every observation to mapSemanticTable and replaced the whole mapping. mapSemanticTable rebuilt columns, re-fitted header slope and called localizePhysicalRows over all word boxes. Contrast added property/description headings and smaller/split text boxes. Estimated font changed 36 to 29, reducing the grouping allowance from 23.4 to 18.85 pixels. Previously single rows split into extra bands. The first two accepted-band spacings then shrank, and the contiguous-body rule rejected later genuine rows.

At the first rejected genuine lower band, center 374.7327842079151 minus preceding 330.08757819083087 = 44.64520601708423 pixels; the prior spacing-based bound was 2*(330.08757819083087-308.58131536956716) = 43.01252564134742. Rejection: **outside contiguous table body after vertical whitespace**. This is geometry recomputation after evidence accumulation, not a normalization or recognizer-weight change. The corrupted mapping had four physical bands, of which only two yielded complete specialized rows.

### B geometry before contrast (established)

| Row | Physical bounds x/y/w/h | Invoice region | Amount region |
| --- | --- | --- | --- |
| 1 | {"left":0,"top":224,"width":2762,"height":83} | {"left":784,"top":224,"width":177,"height":83} | {"left":2262,"top":224,"width":346,"height":82} |
| 2 | {"left":0,"top":308,"width":2762,"height":44} | {"left":784,"top":308,"width":195,"height":43} | {"left":2418,"top":307,"width":199,"height":44} |
| 3 | {"left":0,"top":353,"width":2762,"height":41} | {"left":784,"top":353,"width":178,"height":41} | {"left":2262,"top":352,"width":357,"height":41} |
| 4 | {"left":0,"top":395,"width":2762,"height":39} | {"left":784,"top":395,"width":195,"height":38} | {"left":2394,"top":394,"width":210,"height":38} |
| 5 | {"left":0,"top":435,"width":2762,"height":60} | {"left":784,"top":435,"width":176,"height":60} | {"left":2417,"top":434,"width":183,"height":60} |

### B old geometry after contrast (destructive)

| Band | Physical bounds x/y/w/h | Invoice region | Amount region |
| --- | --- | --- | --- |
| 1 | {"left":89,"top":226,"width":2672,"height":43} | {"left":790,"top":226,"width":189,"height":43} | {"left":2262,"top":227,"width":500,"height":43} |
| 2 | {"left":89,"top":270,"width":2672,"height":26} | {"left":790,"top":270,"width":170,"height":26} | {"left":2419,"top":271,"width":188,"height":26} |
| 3 | {"left":89,"top":297,"width":2672,"height":22} | {"left":950,"top":297,"width":23,"height":22} | {"left":2262,"top":298,"width":43,"height":22} |
| 4 | {"left":89,"top":320,"width":2672,"height":41} | {"left":790,"top":320,"width":189,"height":41} | {"left":2419,"top":321,"width":197,"height":41} |

### Generic accumulation repair

`src/app/lib/ocrV2/semantics/interpret.ts:47` maps primary same-source observations separately when auxiliary local-contrast evidence exists. If those primary observations already establish nonempty rows with invoice/amount regions and a labeled amount column, their row IDs, bands, ownership, physical diagnostics, baseline and existing column bounds remain authoritative. New column labels must align with the established baseline within the existing normalized 0.6-height allowance. Raw contrast observations remain in the ledger and attach to the frozen rows; they do not redefine ownership. When the primary mapping is incomplete, the existing full-evidence fallback remains available. No fixture name, expected count, invoice number or amount is consulted.

### B final full-gate geometry

| Row | Physical bounds x/y/w/h | Invoice region | Amount region |
| --- | --- | --- | --- |
| 1 | {"left":0,"top":224,"width":2762,"height":83} | {"left":784,"top":224,"width":177,"height":83} | {"left":2262,"top":224,"width":346,"height":82} |
| 2 | {"left":0,"top":308,"width":2762,"height":44} | {"left":784,"top":308,"width":195,"height":43} | {"left":2418,"top":307,"width":199,"height":44} |
| 3 | {"left":0,"top":353,"width":2762,"height":41} | {"left":784,"top":353,"width":178,"height":41} | {"left":2262,"top":352,"width":357,"height":41} |
| 4 | {"left":0,"top":395,"width":2762,"height":39} | {"left":784,"top":395,"width":195,"height":38} | {"left":2394,"top":394,"width":210,"height":38} |
| 5 | {"left":0,"top":435,"width":2762,"height":60} | {"left":784,"top":435,"width":176,"height":60} | {"left":2417,"top":434,"width":183,"height":60} |

Final physical rows: 5. Complete document rows: 5. Invoice recognizers invoked: 5. Money recognizers invoked: 5.

```json
[
  {
    "row": 1,
    "rowId": "physical-row-0",
    "invoiceCandidate": null,
    "confidentlySelected": false,
    "invoiceCandidates": [],
    "acceptedCents": [
      109900
    ]
  },
  {
    "row": 2,
    "rowId": "physical-row-1",
    "invoiceCandidate": null,
    "confidentlySelected": false,
    "invoiceCandidates": [],
    "acceptedCents": [
      109900
    ]
  },
  {
    "row": 3,
    "rowId": "physical-row-2",
    "invoiceCandidate": null,
    "confidentlySelected": false,
    "invoiceCandidates": [],
    "acceptedCents": [
      109900
    ]
  },
  {
    "row": 4,
    "rowId": "physical-row-3",
    "invoiceCandidate": null,
    "confidentlySelected": false,
    "invoiceCandidates": [],
    "acceptedCents": []
  },
  {
    "row": 5,
    "rowId": "physical-row-4",
    "invoiceCandidate": "INV-0519",
    "confidentlySelected": false,
    "invoiceCandidates": [
      "INV-0519"
    ],
    "acceptedCents": [
      109900
    ]
  }
]
```

Header and resolver:
```json
{
  "header": {
    "payor": null,
    "checkNumber": null,
    "checkDate": null,
    "total": null,
    "provenance": "Same-capture vendor-neutral visual evidence; no verified answers"
  },
  "totalAuthority": null,
  "totalReason": "Footer candidate is not an isolated final amount-column field",
  "resolver": "review-required",
  "reconciliation": {
    "subtotal": null,
    "total": null,
    "difference": null,
    "evidenceClass": "observed-plus-derived-arithmetic",
    "paymentAuthority": false
  },
  "blockers": [
    "Insufficient labeled organization evidence",
    "Footer candidate is not an isolated final amount-column field",
    "Unresolved monetary evidence for physical-row-3: No cross-model agreement on complete monetary digits",
    "Resolver: inconsistent"
  ],
  "durationMs": 17032.6068
}
```

Frozen expectation remains SAFELY_REQUIRE_REVIEW. Final B acceptance: **PASS**. No attempt was made to force automatic resolution or repair remaining fields.

## 4. C: complete same-field total bounds

Canonical SHA-256: `36cba68eba828fcc0fbcfdf2c6e97c2f10aa5ed3c56a206b0b9358d2edb904fd`.
Normalized source SHA-256: `15b036e5515fc2ab3910ad1249d71e8a00e4be10926a62fb7bdaa80d8ba4deb5`.
Unchanged rotation/dimensions: 0 degrees, 2697 x 1123.

Original grayscale observation: 252.95; x=2424,y=396,w=124,h=24, confidence94. Later local-contrast observation: 2,252.95; x=2382,y=379,w=167,h=44, confidence96. Both are verified observations of the same normalized source, aligned with the same amount axis, below the final row and outside row regions. The old group.observations.push operation retained the original group.bounds. The old padded crop was {"left":2419,"top":391,"width":134,"height":34} and omitted the leading digit.

Same-field proof: the complete box contains 100% of the smaller box; right edges differ by one pixel (2549 versus2548). The shorter observed decimal string is an exact suffix of the longer observed decimal string. The complete candidate exists in OCR evidence before truth comparison. Its left extent is visibly farther left, rather than a digit invented by arithmetic.

`src/app/lib/ocrV2/recognition/totalLocalization.ts:38` selects the most complete actually observed box, sorting by observed digit-string length then area. Different numeric values are compatible only for a longer observed prefix with a different observation ID, at least80% geometric containment, farther-left start and right edges within0.5 of the larger glyph height. Source filtering and existing table eligibility remain mandatory. Equal-length conflicting complete readings stay conflicting; they cannot authorize a fallback crop. No blanket crop padding was added. The existing font-derived padding remains unchanged.

Final candidate diagnostics:
```json
[
  {
    "text": "252.95",
    "cents": 25295,
    "bounds": {
      "left": 2424,
      "top": 396,
      "width": 124,
      "height": 24
    },
    "center": {
      "x": 2486,
      "y": 408
    },
    "observationId": "C:semantic-page:grayscale",
    "variant": "grayscale",
    "confidence": 94,
    "axisDistance": -3,
    "finalRowDistance": 53,
    "rowOverlap": false,
    "aligned": true,
    "below": true,
    "label": [],
    "subtotal": false,
    "eligible": true,
    "rejection": null
  },
  {
    "text": "2,252.95",
    "cents": 225295,
    "bounds": {
      "left": 2382,
      "top": 379,
      "width": 167,
      "height": 44
    },
    "center": {
      "x": 2465.5,
      "y": 401
    },
    "observationId": "C:semantic-page:local-contrast",
    "variant": "local-contrast",
    "confidence": 96,
    "axisDistance": -2,
    "finalRowDistance": 36,
    "rowOverlap": false,
    "aligned": true,
    "below": true,
    "label": [],
    "subtotal": false,
    "eligible": true,
    "rejection": null
  }
]
```

Selected observed field: {"left":2382,"top":379,"width":167,"height":44}.
Final crop: {"left":2377,"top":374,"width":177,"height":54}.

Mature total raw observations / consensus:
```json
[
  {
    "bounds": {
      "left": 2377,
      "top": 374,
      "width": 177,
      "height": 54
    },
    "cropHash": "fb85207dfd77fa81ff50d816ecdf91c429f441083bc0a74a7601316cfdbb9a89",
    "cents": 225295,
    "provenance": [
      "money:svtr:total:document-total",
      "money:parseq:total:document-total",
      "money:ppocr:total:document-total"
    ],
    "raw": [
      {
        "model": "ppocrv5",
        "raw": "2,252.95"
      },
      {
        "model": "svtrv2",
        "raw": "2,252.95"
      },
      {
        "model": "parseq",
        "raw": "2,252.95"
      }
    ]
  }
]
```

```json
{
  "rows": [
    {
      "row": 1,
      "rowId": "physical-row-0",
      "invoiceCandidate": "INV-0506",
      "confidentlySelected": true,
      "invoiceCandidates": [
        "INV-0506"
      ],
      "acceptedCents": [
        130000
      ]
    },
    {
      "row": 2,
      "rowId": "physical-row-1",
      "invoiceCandidate": "INV-0507",
      "confidentlySelected": false,
      "invoiceCandidates": [
        "INV-0507"
      ],
      "acceptedCents": [
        95295
      ]
    }
  ],
  "header": {
    "payor": "north creek",
    "checkNumber": null,
    "checkDate": null,
    "total": {
      "amount": 2252.95,
      "source": "explicit-document-total",
      "payable": true
    },
    "provenance": "Same-capture vendor-neutral visual evidence; no verified answers"
  },
  "authoritativeTotal": 225295,
  "authorityReason": "Unique final amount-column field corroborated by page and bounded field observations",
  "subtotal": 225295,
  "reconciliation": {
    "subtotal": 225295,
    "total": 225295,
    "difference": 0,
    "evidenceClass": "observed-plus-derived-arithmetic",
    "paymentAuthority": false
  },
  "resolver": "automatic",
  "automaticInvoiceIds": [
    "3561fccb-f64e-4bfa-988e-0e459736cd2e",
    "c3b89f69-ee90-4b28-a4b5-3d7ca8212795"
  ],
  "blockers": [],
  "durationMs": 11621.8754
}
```

Frozen expectation remains AUTOMATICALLY_RESOLVE. Final C acceptance: **PASS**. Arithmetic only corroborates/vetoes observed evidence; it did not generate the complete candidate.

## 5. Foundation boundary

Classification: **A, dependency direction was wrong**. The shared money service had newly imported and called documentTotalAuthority to complete a decision from mature evidence. Its function was moved unchanged into `src/app/lib/ocrV2/recognition/completeMoneyAuthority.ts`; the shadow pipeline imports it from the authority layer. The shared service retains crop/provenance and numeric-consensus responsibilities. The preexisting prepare adapter still carries the earlier semantic-money envelope; this narrow task does not claim to remove all historical transitive coupling. It no longer decides the new mature-evidence authority or directly imports that decision layer.

Layering: shared optical crops/observations -> numeric consensus -> document authority -> unchanged resolver. An accepted numeric reading is not automatically an authoritative total or payment approval. The foundation allowlist was NOT edited. Policy records the boundary, and a behavioral/source regression forbids moving the completion function back into the shared service.

Foundation full-gate result: **PASS**.

## 6. Intermediate numeric evidence and safety counters

| Counter | Final count |
| --- | --- |
| wrongAuthoritativeTotals | 0 |
| wrongAcceptedRowAmounts | 0 |
| wrongInvoiceTokens | 0 |
| wrongRecordIds | 0 |
| intermediateRejectedNumericErrors | 0 |

Counts distinguish completed numeric consensus from authoritative/final evidence. Raw OCR alternatives are retained but are not counted as accepted consensus. Wrong selected invoice tokens are scored only when the existing fusion marks them confidently selected; raw alternatives remain visible in private evidence. Automatic record IDs are compared with frozen verified IDs; unknown expected IDs cannot pass automatic scoring. These counts cover the frozen candidate corpus, not unseen production accuracy.

Prior wrong mature footer consensuses were B9900 versus549500 and C25295 versus225295. Both were authority-rejected. The final gate records every completed mature numeric consensus, Tesseract row-money consensus and semantic-page total, with field/row, provenance, expected value, downstream acceptance and rejection reason. Frozen truth enters only this post-inference scoring module, never the recognizers. A wrong value reaching authority fails the gate. Raw C252.95 still remains in localization evidence; it is not erased to improve statistics.

Final intermediate wrong consensus entries:
```json
[]
```

All intermediate completed numeric entries are preserved in the committed JSON receipt under retained[].metrics.intermediateNumericEvidence. Legacy replays also retain their raw terminal responses and are checked for wrong payable total and unexpected payment application; those raw candidates are not relabeled accepted fields.

## 7. Complete frozen matrix

| Document | Frozen expectation | Rows | Resolver | Authoritative cents | Acceptance | Failures |
| --- | --- | --- | --- | --- | --- | --- |
| check2715 | SAFELY_REQUIRE_REVIEW | 2 | review-required | UNKNOWN | PASS | none |
| check2721 | AUTOMATICALLY_RESOLVE | 2 | automatic | 219800 | PASS | none |
| check2734 | AUTOMATICALLY_RESOLVE | 2 | automatic | 219800 | PASS | none |
| check2743 | SAFELY_REQUIRE_REVIEW | 1 | review-required | 109900 | PASS | none |
| A | SAFELY_REQUIRE_REVIEW | 5 | review-required | UNKNOWN | PASS | none |
| D | AUTOMATICALLY_RESOLVE | 5 | automatic | 450590 | PASS | none |
| B | SAFELY_REQUIRE_REVIEW | 5 | review-required | UNKNOWN | PASS | none |
| C | AUTOMATICALLY_RESOLVE | 2 | automatic | 225295 | PASS | none |

Exactly the same eight images and frozen snapshot were used. Model weights/hashes and frozen expectations remain unchanged. Review-required documents were not promoted by changing baseline labels.

## 8. Tests and complete run

Standard `npm ci` was run successfully before the gate (438 packages /439 audited), and the gate independently ran standard npm ci again: PASS. No --force or --ignore-scripts. Existing warnings: 15 npm audit vulnerabilities (1low,1moderate,12high,1critical) and allow-scripts entries sharp0.34.5, tesseract.js7.0.0, unrs-resolver1.11.1. No unrelated dependency repair was attempted.

Before the final run, focused B/C/D retained replays, foundation, TypeScript, document-total, shared-money, semantics and new adversarial regressions passed. The final proof is the ENTIRE gate, not those focused tests. New tests cover auxiliary geometry preservation, same-row attachment, duplicate observations, supplemental labels, scale/order invariance, wrong source, same-field conflicting values, distinct-field rejection, authority dependency direction and visibility of rejected/wrong numeric consensus.

| Gate check | Status | Duration ms | Failure/reason |
| --- | --- | --- | --- |
| clean-manifest-source-start | PASS |  | none |
| frozen-corpus-integrity | PASS |  | none |
| clean-dependency-install | PASS | 21695 | none |
| production-runtime-attestation | DEPLOYMENT_PREREQUISITE |  | Existing production workers intentionally unchanged; candidate validation cannot attest old loaded code |
| model-bundle | PASS |  | none |
| runtime-source-bundles | PASS |  | none |
| live-database-attestation | DEPLOYMENT_PREREQUISITE | 3545 | Read-only RPC not installed in production; local SQL validation is separate |
| sql-test-runtime | PASS |  | none |
| contract-regression | PASS | 62 | none |
| auth-flow-regression | PASS | 259 | none |
| startup-regression | PASS | 1639 | none |
| sql-attestation-regression | PASS | 1136 | none |
| authorization-execution-regression | PASS | 1247 | none |
| evidence-handoff-regression | PASS | 96 | none |
| final-candidate-regression | PASS | 282 | none |
| shadow-capture-regression | PASS | 273 | none |
| camera-lifecycle-regression | PASS | 85 | none |
| capture-durability-regression | PASS | 262 | none |
| ocr-object-upload-regression | PASS | 320 | none |
| ocr-evidence-persistence-regression | PASS | 1300 | none |
| ocr-legacy-job-regression | PASS | 204 | none |
| shadow-regression | PASS | 448 | none |
| canonical-regression | PASS | 216 | none |
| canonical-sql-regression | PASS | 2809 | none |
| shadow-sql-regression | PASS | 1142 | none |
| foundation-regression | PASS | 546 | none |
| layout-regression | PASS | 1099 | none |
| field-regression | PASS | 1263 | none |
| invoice-study-regression | PASS | 624 | none |
| fusion-regression | PASS | 96 | none |
| resolver-regression | PASS | 150 | none |
| payment-evidence-regression | PASS | 1268 | none |
| document-total-regression | PASS | 366 | none |
| identity-regression | PASS | 176 | none |
| semantics-regression | PASS | 207 | none |
| orientation-heading-regression | PASS | 2676 | none |
| legacy-direction-regression | PASS | 2545 | none |
| legacy-first-pass-regression | PASS | 347 | none |
| physical-row-regression | PASS | 151 | none |
| money-regression | PASS | 201 | none |
| mature-money-regression | PASS | 77 | none |
| shared-money-regression | PASS | 166 | none |
| organization-identity-regression | PASS | 80 | none |
| total-localization-regression | PASS | 138 | none |
| residual-regression | PASS | 287 | none |
| regression | PASS | 70 | none |
| remittance-matching-regression | PASS | 183 | none |
| remittance-contract-regression | PASS | 138 | none |
| remittance-retry-regression | PASS | 110 | none |
| duplicate-remittance-regression | PASS | 131 | none |
| payment-application-regression | PASS | 81 | none |
| payment-state-lifecycle-regression | PASS | 106 | none |
| invoice-correction-regression | PASS | 82 | none |
| split-source-relationship-regression | PASS | 77 | none |
| split-invoice-send-regression | PASS | 80 | none |
| tenant-isolation-hardening-regression | PASS | 84 | none |
| business-read-isolation-regression | PASS | 75 | none |
| owner-server-auth-regression | PASS | 80 | none |
| account-management-regression | PASS | 83 | none |
| stabilization-regression | PASS | 26053 | none |
| frozen-business-snapshot | PASS |  | none |
| retained-check2715-legacy | PASS | 1712 | none |
| retained-check2715-v2-shadow | PASS | 27702 | none |
| retained-check2721-legacy | PASS | 11127 | none |
| retained-check2721-v2-shadow | PASS | 21138 | none |
| retained-check2734-legacy | PASS | 1665 | none |
| retained-check2734-v2-shadow | PASS | 20295 | none |
| retained-check2743-legacy | PASS | 1456 | none |
| retained-check2743-v2-shadow | PASS | 17665 | none |
| retained-A-legacy | PASS | 4328 | none |
| retained-A-v2-shadow | PASS | 14281 | none |
| retained-D-legacy | PASS | 927 | none |
| retained-D-v2-shadow | PASS | 15114 | none |
| retained-B-legacy | PASS | 1884 | none |
| retained-B-v2-shadow | PASS | 17108 | none |
| retained-C-legacy | PASS | 3946 | none |
| retained-C-v2-shadow | PASS | 11687 | none |
| lint | PASS | 15839 | none |
| typescript | PASS | 1676 | none |
| production-build | PASS | 13576 | none |
| clean-manifest-source-end | PASS |  | none |

Lint: PASS. TypeScript: PASS. Production build (local only): PASS.
Clean source at start: PASS; at end: PASS.

## 9. Grouped remaining causes — stopped

- **DEPLOYMENT_PREREQUISITE — production-runtime-attestation**: Existing production workers intentionally unchanged; candidate validation cannot attest old loaded code
- **DEPLOYMENT_PREREQUISITE — live-database-attestation**: Read-only RPC not installed in production; local SQL validation is separate


Missing production read-only RPC and unchanged/unattested old workers remain DEPLOYMENT_PREREQUISITE. No SQL/RPC installation, worker switch or restart was performed. Physical acceptance is PENDING. The final run was not followed by another repair cycle. No executable code was changed after this run.

## 10. Evidence locations and reproducibility

- Prior complete gate: `C:\Users\robbi\AppData\Local\Trimax\release-gates\2026-10-07T21-07-54-211Z`
- Private before/targeted trace: `C:\Users\robbi\AppData\Local\Trimax\final-candidate-20261007` (B-before.json and C-before.json include raw source-bound observations and per-pass geometry).
- Final full result: `C:/Users/robbi/AppData/Local/Trimax/release-gates/2026-10-08T05-47-38-395Z/gate-result.json`
- Per-engine evidence: `C:/Users/robbi/AppData/Local/Trimax/release-gates/2026-10-08T05-47-38-395Z/<document>-legacy/result.json` and `C:/Users/robbi/AppData/Local/Trimax/release-gates/2026-10-08T05-47-38-395Z/<document>-v2-shadow/result.json`.
- Per-model raw outputs/crop hashes: corresponding v2-shadow/recognition.json, inputs.json and result ledger.
- Final receipt: `release/evidence/final-candidate-gate-result.json`.

Private image bytes and crops were not committed. Existing traineddata/model cache locations were reused and hash-verified. No new model or model tuning. This report records local replay results only; it does not assert fresh physical acceptance or current production worker health.

## 11. Files changed and local commits

Executable commit: `c770a4e1c1033c151e55602ffb84b28c05bf9c63`.
Manifest seal: `12df6b66d320cf8a74b581d911c916227ea2377b`.
Both are local, unpushed. This report and final receipt receive a subsequent documentation/evidence-only commit, preserving the exact executable bundle.

Files changed before the final run:

- `docs/TRIMAX_RELEASE_AND_ACCEPTANCE_POLICY.md`
- `release/trimax-release-manifest.json`
- `scripts/release/evidence-metrics.cjs`
- `scripts/release/final-candidate-regression.cjs`
- `scripts/release/gate.cjs`
- `src/app/lib/documentFields/moneyService.ts`
- `src/app/lib/ocrV2/recognition/completeMoneyAuthority.ts`
- `src/app/lib/ocrV2/recognition/documentTotalAuthority.ts`
- `src/app/lib/ocrV2/recognition/semanticMoney.ts`
- `src/app/lib/ocrV2/recognition/totalLocalization.ts`
- `src/app/lib/ocrV2/semantics/interpret.ts`
- `src/app/lib/ocrV2/shadow/pipeline.ts`

Additional report-only files: `docs/handoffs/TRIMAX_FINAL_CANDIDATE_GATE_RESULT.md`, `release/evidence/final-candidate-gate-result.json`.

## 12. Production and final disposition

Production behavior changed: **NO**. Production deployed: **NO**. Production workers restarted/replaced: **NO**. Production SQL/RPC installed: **NO**. Payment/business mutations: **NO**. Frozen acceptance truth changed: **NO**. Model weights changed: **NO**.

Read-only missing-RPC attestation probes were the only production interaction by the gate. Replay recognition, evidence, SQL fixtures and tests were local. No apply-payment endpoint was called.

**Physical acceptance: PENDING. Next action: WAIT FOR CHATGPT REVIEW. STOP.**
