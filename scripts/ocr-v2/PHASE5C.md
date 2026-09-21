# Phase 5C — offline document total authority

Status: implemented and evaluated; **not ready for Phase 6**. No production
integration, payment writes, push or deployment. Invoice recognition, fusion,
Phase 5 resolver, Phase 5B extraction, and production safeguards remain unchanged.

## Real-document audit

All eight images show a remittance header containing an explicit TOTAL field
and an unlabeled numeric value below the final physical row, aligned with the
Amount column. One photograph additionally contains the physical check above
the remittance; that check-face amount is audited but not promoted into inference.
The footer has no local TOTAL label. These are one recurring remittance structure
in two photographic compositions, not eight independent layout templates.

Private `phase5c/structure-audit.json` records normalized dimensions, header/body/
footer boxes, OCR label and monetary word boxes, raw alternatives, source/crop
hashes, association decisions and resolver blockers. Manual visual audit entries
are explicitly excluded from inference. Overview images and the three unresolved
amount-crop comparisons remain private. Approximate manual boxes are identified
as such; noisy OCR boxes are not represented as exact visual annotations.

## Contract

`documentTotalAuthority.ts` is an offline refinement, not a replacement production
parser. A footer candidate must be below every row, outside every physical row
band, close to the table, and right-aligned with the observed amount column.

Authority requires either:

- A reliable exact header TOTAL label with an adjacent complete monetary token
  agreeing with an independently supported footer candidate; or
- Repeated exact header TOTAL observations (at least one confidence >=40 and two
  distinct observations >=20, or one >=85) plus an unambiguous supported final
  amount-column candidate; or
- The preserved Phase 5B same-region explicit footer TOTAL contract.

These confidence thresholds are conservative heuristic gates, not probabilities.
Repeated preprocessing/crop observations are not independent calibrated models.
The existing numeric confidence/ambiguity policy remains unchanged. SUBTOTAL,
fuzzy label substitutions, body amounts, conflicting labeled values and known
subtotal contradictions cannot authorize a total. A row subtotal can corroborate
or veto; it cannot manufacture or select a monetary value.

Header amount spacing and punctuation may be normalized. Digits are never
inserted, replaced or selected using invoice balances, expected answers, row sums,
or document IDs. Explicit footer-label authority remains supported.

If existing header evidence is inadequate, at most one geometrically detected
header line receives two OCR variants. An exact but weak label may receive one
additional two-variant crop. Maximum: four extra small-region passes per document;
no full-document recovery. Existing check/date/payor results are preserved.

## Retained amount evidence and propagation

Earlier B Phase 3 and current generalized Phase 2 use identical normalized image
bytes, but different crop extents. The earlier amount crops have wider whitespace
and taller ownership bands; generalized crops are tighter. Whitelists also differ.
The earlier fourth-row contrast observation is exact with confidence 87 and has
money glyphs contained in the current row/amount region. It is safely reusable.

The generalized Phase 3 replay omitted that older observation; Phase 4 carries
invoice evidence only; Phase 5 used the generalized observations; Phase 5B reran
OCR without supplying its retained-amount argument. Thus one previously strong
amount observation disappeared before Phase 5B's decision.

The other two rows are not equivalent successful-evidence losses. Earlier third-row
exact text has confidence 16 and an oversized word box; competing observations
remain. Earlier fifth-row observations are incorrect or zero-confidence. An
`anyExact` benchmark flag was never a safe acceptance decision.

Retained observations require identical normalized image hash, byte-verifiable
crop hash, correct field/row identity, amount-column coverage and no cross-row
money glyphs. Rejected observations remain in a separate audit with raw alternatives
and rejection reasons. They never enter accepted amount evidence. No OCR is rerun
for the amount recovery. The original four Phase 5B variants remain available.

## Results

| Measure | Before | After |
|---|---:|---:|
| Exact accepted row amounts | 21/24 | 22/24 |
| Ambiguous / missing amounts | 2 / 1 | 2 / 0 |
| Wrong accepted amounts | 0 | 0 |
| Exact authoritative totals | 0/8 | 6/8 |
| Exact recovered checks | 3/3 | 3/3 |
| Exact recovered dates | 2/2 | 2/2 |
| Fully automatic documents | 0/8 | 0/8 |
| Wrong automatic rows / documents | 0 / 0 | 0 / 0 |

Supported totals: A, C, D, check2721, check2734, check2743. Their observed row
subtotals reconcile exactly. B remains missing reliable exact label/numeric total
support; check2715 has correct footer money but insufficient repeated reliable
label evidence. Both remain UNKNOWN rather than weakening the contract.

All 24 rows remain document-review gated. Even the six total-authorized documents
are blocked by the unchanged resolver's missing payor/customer evidence. Exact
arithmetic is not payment authorization. No customer is invented from BANK/PAYEE
text or a historical transaction. B also retains invoice and amount ambiguity.

## Reproduction

The private research root is `%LOCALAPPDATA%/Trimax/ocr-v2-training`.
`phase5c/retained.json` references the original normalized pixels, retained Phase 3
observations, and original crop directory. It contains no benchmark answers.

```powershell
node --experimental-strip-types scripts/ocr-v2/document-total-benchmark.cjs PRIVATE_ROOT FRESH_OUT PRIVATE_RETAINED_CONFIG
node --experimental-strip-types scripts/ocr-v2/document-total-regression.cjs
node --experimental-strip-types scripts/ocr-v2/dataset/cli.cjs benchmark PRIVATE_CONFIG FROZEN_MANIFEST FRESH_COMPLETE_RUN BASELINE_REPORT --phase5c
```

For the complete runner, private config `phase5cRetainedFile` points to the retained
source map. The default benchmark path remains Phase 5B; Phase 5C is explicit.
The existing frozen dataset, all five invoice adapters and fusion are reused.
Labels enter only after extraction/resolution. Resolver snapshots remain separate.

`final/summary.json` reports incremental cost; `complete/report.json` records the
fresh original-image normalization → layout → field extraction → five recognizers
→ fusion → unchanged resolver → scoring batch. Initial measured incremental cost
was about 0.58 seconds/document (0.004–1.72 seconds), 4.65 seconds for all eight.
The complete eight-document batch took 78.03 seconds. This is offline batch timing,
including shared model startup, **not an iPhone or per-document cold-start claim**.
Valid retained optical observations are intentionally reused. Final committed-run
timings are retained privately alongside the corresponding source commit.

## Validation and remaining work

21 authority/provenance suites cover explicit and cross-region totals, preserved
footer authority, body/subtotal/fuzzy-label exclusion, conflicting values, subtotal
non-creation, source/crop hashes, row isolation, bounded reuse and frozen contracts.
The complete dataset regression gate, OCR v2 regressions, production safety suite,
lint, TypeScript and build pass. The complete run preserves invoice recognition.

Remaining optical failures and the payor/customer gate must be addressed in a
separately authorized task. Phase 6 is not begun by this change.
