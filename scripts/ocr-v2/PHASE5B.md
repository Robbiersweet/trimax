# Phase 5B — missing payment evidence

## Status

Implemented and evaluated offline. **Payment completeness was not achieved. Phase 6 is not ready.** No push, deployment, payment application, production OCR change, invoice-recognizer change, fusion change, or resolver-policy change.

Eight real documents / 24 physical rows were processed. Accepted row amounts are correct for 21/24 rows; two remain ambiguous/low-confidence and one has no complete money token. No accepted row amount is wrong. Three check numbers and two dates were recovered and visually verified. No authoritative total or reliable payor identity was recovered under the requested source restrictions. All eight documents remain review-required; wrong automatic rows/documents remain **0 / 0**.

This does not increase real row-amount coverage beyond the prior 21/24 candidate coverage. It adds explicit acceptance/unknown decisions, dedicated check/date evidence, a recovered numeric footer on check2715, provenance, and a measured bounded field pipeline. It does not claim the physical workflow is fixed.

## Implementation

`recognition/paymentEvidence.ts` introduces `DocumentPaymentEvidence`, separate document/row observations, strict money formatting, calendar-valid dates, and bounded field extraction. It has no invoice database, customer profile, historical payment, or benchmark-value inputs.

- Row amounts use unchanged Phase 2 amount rectangles. Native/color and local contrast run first. Grayscale and numeric-focused local contrast run only when the evidence remains unsupported. Completed observations are reused; maximum four variants per unresolved row. Every raw observation and crop/source hash remains available.
- Formatting may normalize `1.099.00` to 109900 cents; it never inserts/deletes/substitutes digits. Corrupt strings such as `1.099.800`, `1O99.00`, and `$.495.400` remain invalid.
- Acceptance requires a single supported money candidate: agreement across variants with OCR confidence at least 40, or a high-confidence complete observation at least 85. Multiple supported values remain unknown. These are conservative recognition heuristics, **not calibrated probabilities** and not payment authorization.
- Footer totals use only the existing Phase 2 total rectangle. A nearby full-width footer band preserves potential label context, stays below all physical rows, and never includes body money. Explicit total authority requires a supported numeric reading plus TOTAL-label geometry in two footer observations; SUBTOTAL is rejected. Numeric-only footers remain `unlabeled-footer`, not authoritative.
- The existing generalized `headerRegion` is a table-heading anchor. The new field extractor derives a nearby header band above it using detected font scale. This avoids treating the entire photograph/desk as a header. The Phase 2 algorithm, invoice geometry, and source images are unchanged. Some retained photographs still contain distracting background in this band; this remains a limitation.
- Header text runs at native resolution with native/grayscale variants. Check recognition preserves leading zeros and may perform one numeric-focused crop located by observed label/word geometry. Date recognition normalizes complete printed dates only. Disagreement remains unknown.
- Payor requires observed PAYOR/PAYER/PROPERTY/CUSTOMER evidence. PAYEE and BANK text are retained but are not silently relabeled as customer identity or repaired from the database.

The Phase 5 resolver runs unchanged with the original actual-record historical snapshots. New accepted amounts and document fields are passed into it; rejected observations remain in the separate full payment-evidence artifact. No business value repairs an OCR observation.

## All-document results

Invoice counts below are frozen provisional correct identities, not automatic payment authorization. All documents have UNKNOWN authoritative total, UNKNOWN payor, and review-required reconciliation.

| Document | Invoice identities | Accepted row amounts in physical order | Check | Date | Supported numeric footer |
|---|---|---|---|---|---|
| A | 5/5 | 5 × $1,099 | 2769 | UNKNOWN | UNKNOWN: $5,495 / $5,195 conflict |
| B | 4/5 | $1,099; $1,099; UNKNOWN; UNKNOWN; UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| C | 2/2 | $1,300; $952.95 | 2758 | 2026-07-23 | $2,252.95, unlabeled |
| D | 5/5 | $1,099; $1,300; $458.40; $1,300; $348.50 | 2804 | UNKNOWN | $4,505.90, unlabeled |
| check2715 | 2/2 | $11,024.31; $1,099 | UNKNOWN | UNKNOWN | $12,123.31, unlabeled |
| check2721 | 2/2 | $1,099; $1,099 | UNKNOWN | 2026-07-07 | $2,198, unlabeled |
| check2734 | 2/2 | $1,099; $1,099 | UNKNOWN | UNKNOWN | $2,198, unlabeled |
| check2743 | 1/1 | $1,099 | UNKNOWN | UNKNOWN | $1,099, unlabeled |

### Metrics

- Exact accepted row amounts: **21/24 (87.5%)**; ambiguous/unsupported: 2; missing: 1; wrong accepted amounts: 0.
- Authoritative totals recovered: **0/8**; exact authoritative totals: 0; authority unknown: 8. Accuracy among recovered authoritative totals is not applicable (zero recovered).
- Supported numeric footer values: **6/8**, all six exact against post-recognition truth. A is conflicting; B is unreadable. This is not payment authority.
- Check numbers: **3/8 available**, all three recovered values exact; five unknown.
- Dates: **2/8 available**, both recovered values exact; six unknown.
- Payor identity: 0/8. Raw BANK/PAYEE text is retained; no customer-profile substitution occurs.
- Fully automatic documents: **0**; review-required: **8**; wrong automatic rows/documents: **0 / 0**.

Printed check/date availability and accepted predictions were visually checked after recognition. Some unrecovered expected dates were left untranscribed because they are not needed to score accepted predictions. No manual transcription enters extraction.

## Total observations and authority

Four numeric observations are native, grayscale, local contrast, numeric-focused. All are retained verbatim in the private artifacts; representative raw observations are below.

| Document | Raw footer observations | Normalized candidates | Footer label / authority |
|---|---|---|---|
| A | `5,495.00`, `5,495.00`, `5,195.00`, `5,195.00` | 549500 / 519500 cents | Conflicting; UNKNOWN |
| B | `S.4%5.00`, `S.4%5.00`, `$.495.400`, `$.495.400` | None | UNKNOWN |
| C | `2774527595`, `27745295`, `2,252.95`, `2,252.95` | 225295 cents | No label; UNKNOWN authority |
| D | `4,505.90`, `4,505.90`, `4,505.¢%0`, `4,505.90` | 450590 cents | No label; UNKNOWN authority |
| check2715 | `Zana`, `Fanaa`, `12,123.31`, `12,123.31` | 1212331 cents | No label; UNKNOWN authority |
| check2721 | Four × `2,198.00` | 219800 cents | No label; UNKNOWN authority |
| check2734 | Four × `2,198.00` | 219800 cents | No label; UNKNOWN authority |
| check2743 | Four × `1,099.00` | 109900 cents | No label; UNKNOWN authority |

**The physical TOTAL labels are in the upper remittance header, not the footer.** The request restricts total input to the footer/total region. This implementation honors that boundary: it does not import a header amount or transfer a header label onto a footer number. Correct-looking unlabeled numbers therefore do not close the authority gap. Label absence is an observed document property, not an OCR threshold defect. Footer-label passes are skipped when numeric evidence itself is unknown.

## Fixture B

- 0513 amount: **$1,099**, supported.
- 0514 amount: **$1,099**, supported by visual money evidence independently of invoice identity.
- 0515 amount: **UNKNOWN**. The weak `1,092.00` observation is not accepted; other variants are corrupt.
- 0518 amount: **UNKNOWN**. No sufficiently supported complete amount observation.
- 0519 amount: **UNKNOWN**. No complete accepted money token.
- Total/check/date: **UNKNOWN / UNKNOWN / UNKNOWN**. The known $5,495 / 2797 / 2026-08-19 are scoring truth only.
- Resolver result: review-required. INV-0514 still has no complete visual invoice candidate; its money reading does not manufacture that invoice number. Frozen candidates and the no-invented-digit boundary are unchanged.

## C and D split safety

C's two amounts and D's five amounts are exact, and their numeric footer values are exact. C retains two separate split-child UUIDs; D retains all five original child/ordinary UUIDs. Same-unit rows are never collapsed. The existing resolver remains review-required for missing authority/payor evidence; no exact payable reconciliation is claimed.

## Performance

Times below are milliseconds. Extraction includes worker initialization, crop conversions, bounded OCR, parsing, and termination. The complete offline run starts from each original image and measures actual normalization, layout, fresh payment extraction, three frozen invoice models, fusion, and unchanged resolver. No saved OCR observations are reused in that complete run.

| Document | Row amounts | Footer | Header | Evidence extraction | Complete offline pipeline |
|---|---:|---:|---:|---:|---:|
| A | 247 | 95 | 286 | 731 | 8,641 |
| B | 554 | 119 | 438 | 1,211 | 10,961 |
| C | 102 | 215 | 302 | 714 | 8,342 |
| D | 288 | 240 | 374 | 995 | 8,950 |
| check2715 | 335 | 624 | 731 | 1,786 | 21,564 |
| check2721 | 172 | 327 | 453 | 1,046 | 10,796 |
| check2734 | 296 | 560 | 707 | 1,659 | 14,672 |
| check2743 | 145 | 464 | 570 | 1,275 | 13,459 |

Complete eight-document sum: **97.384 seconds**. These are desktop/WSL/GPU timings including process/model initialization, not mobile or production-server acceptance figures. OS/model-file caches were not purged. Extraction measurements are a separate full extraction run; the complete-pipeline column is measured directly, not synthesized from those values. Ten to 24 small-region OCR calls per document; only ambiguous amount rows receive additional variants. No repeated whole-document recovery is added.

## Validation and frozen boundaries

- New optical tests: explicit footer TOTAL accepted; SUBTOTAL rejected; unlabeled footer remains unknown even with a header TOTAL; PAYEE cannot become PAYOR; leading-zero checks; valid/invalid dates; row/document geometry isolation; corrupted money; conflicting/weak observations; bounded calls.
- Phase 1 normalization, Phase 2 layout, Phase 3 fields, Phase 4 fusion, Phase 5 resolver suites passed.
- Full fresh pipeline reproduced **72/72 raw invoice recognizer observations**, with zero differences from Phase 5. All fused candidate sets remain unchanged.
- Existing invoice fusion, Phase 5 resolver, remittance attempt, and matching files are verified byte-for-byte against local commit `c11d0a0` (line endings normalized).
- Full `npm test`, lint, TypeScript, and build passed. Unrelated pre-existing workspace edits are excluded from the local commit; whole-workspace test/build results include those existing edits.

Private artifacts: `%LOCALAPPDATA%/Trimax/ocr-v2-training/phase5b/final/` (unscored evidence then scored results); `complete/` (fresh full-path evidence/timing); `frozen-verification.json`; `header-scoring.json`; logs and visual scoring strips. Earlier investigation outputs remain separately named and are not the final result.

Reproduce extraction: `node --experimental-strip-types scripts/ocr-v2/payment-evidence-benchmark.cjs <training-root> <fresh-output>`.

Reproduce complete path: `node --experimental-strip-types scripts/ocr-v2/resolver-complete-replay.cjs <training-root> <fresh-output> <WSL-training-root> --payment-evidence`.

## Next decision

Additional evidence work is required, not Phase 6. A future authorized task should address labeled header total evidence with explicit geometry/authority rules, improve optical header/payor extraction, and recover the three faint B amounts. INV-0514 still needs genuine visual evidence or explicit human review. Do not weaken matching or infer any missing field from business records.

Invoice recognition changed: **no**. Fusion changed: **no**. Resolver business rules changed: **no**. Production changed: **no**. Push/deployment: **none**.

READY TO PROCEED TO OCR v2 PHASE 6: **no**. Phase 6 was not started.
