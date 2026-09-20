# Phase 5 — offline deterministic resolver integration

## Decision

Offline integration and safety evaluation completed. No production integration, payment application, push, deployment, or Phase 6 work.

**Zero wrong automatic assignments. Zero automatically payable documents.** The resolver identifies 23/24 records provisionally, but all eight documents require review because retained field evidence does not establish document-total authority or payor identity. This is an evidence-contract gap, not permission to insert benchmark answers. Recommend additional document evidence work before Phase 6 physical acceptance.

## Implementation boundary

`src/app/lib/ocrV2/resolver/index.ts` calls the existing `resolveRemittanceAttempt`, `findRemittanceMatches` indirectly, duplicate resolver, and invoice-number normalization. No second fuzzy matching engine, database client, or payment writer exists in the adapter. Existing production modules are unchanged.

Every physical row retains full Phase 4 fusion, top/alternate candidates, ambiguity, raw recognizer observations, crop/source hashes, geometry, money observations, and unit/account candidates. Missing unit/account observations stay empty. A complete candidate must reference an observation containing exactly that normalized token. No glyph substitution or invoice-number completion is allowed at this boundary.

Assignments enumerate all observed-token/persisted-record combinations. Eligibility comes from the existing resolver. Entire document branches retain the complete invoice pool, preserving duplicate invoice-number conflicts. Record-ID uniqueness, unit corroboration, exact cents, existing payor/duplicate/total gates all remain enforced. Enumeration above 10,000 branches fails closed. Results distinguish provisional identities from automatic payment evidence.

The existing resolver allows an exact, complete invoice set plus authoritative total to corroborate missing/conflicting row amounts. The adapter preserves this rule and separately reports strict observed amount compatibility and uses of that existing override. It never calls apply-payment code.

## Actual invoice snapshots

Read-only Supabase SELECTs retrieved 268 invoice records, payment/split activities, deposit state, and correction notes. Raw browser evidence and actual UUIDs remain in the private Phase 5 artifact directory, not this repository.

For seven previously paid documents, the benchmark locates their recorded payment batch by attachment ID/check reference. The cutoff is immediately before the first batch event. It excludes invoices created after that time. For each applicable later recorded payment, prior paid balance is `resultingAmountPaid - amountApplied` from the earliest event at/after cutoff. A currently paid record with this evidence is labeled historically sent/collectible. Other current non-collectible states remain conservatively excluded. Split parents/children retain actual record IDs and relationships.

These are **labeled historical benchmark reconstructions, not complete event-sourced database snapshots**: invoice amounts and non-paid correction states retain current values. Their limitations remain recorded. No live records change. Fixture B uses current open records without reviving any paid invoices.

INV-0404 is a recorded deposit case: invoice $22,048.62, requested deposit $11,024.31, request timestamp before check 2715, activity explicitly `depositPayment: true`. Historical requested state is reconstructed from those records. The existing `invoiceCollectionAmountDue` helper calculates the collectible deposit, rather than using the full invoice balance or remittance truth.

Correction notes independently confirm INV-0516 was superseded by INV-0521/0522; INV-0517 is their correction split source. The superseded original and draft split source remain excluded. Other split parents remain excluded too.

## Primary eight-document replay

Benchmark labels are opened only after unscored resolver decisions are serialized. Neither expected invoice tokens nor expected totals/check/date/units are supplied to resolution.

| Document | Rows | Raw exact | Fusion exact | Provisional correct record identities | Automatic rows | Review rows | Wrong automatic |
|---|---:|---:|---:|---:|---:|---:|---:|
| A | 5 | 5 | 5 | 5 | 0 | 5 | 0 |
| B | 5 | 3 | 3 | 4 | 0 | 5 | 0 |
| C | 2 | 2 | 2 | 2 | 0 | 2 | 0 |
| D | 5 | 5 | 5 | 5 | 0 | 5 | 0 |
| check2715 | 2 | 2 | 2 | 2 | 0 | 2 | 0 |
| check2721 | 2 | 2 | 2 | 2 | 0 | 2 | 0 |
| check2734 | 2 | 2 | 2 | 2 | 0 | 2 | 0 |
| check2743 | 1 | 1 | 1 | 1 | 0 | 1 | 0 |
| Total | 24 | 22 | 22 | 23 | 0 | 24 | 0 |

- Raw SVTRv2 exact: 22/24, 91.67%.
- Fusion top-1 exact: 22/24, 91.67%; candidate recall: 23/24, 95.83%.
- Resolver final automatic exact: 0/24; provisional identity exact: 23/24, 95.83%. These are different metrics.
- Automatic documents: 0/8; review documents: 8/8; wrong automatic rows/documents: 0/0.
- Documents with partial/provisional identities: 8; documents with no provisional identity: 0.
- All three ambiguous B rows remain held at the payment-authority boundary. Two have provisional identities; the missing-token row does not.

### Why a readable number is not yet authoritative

The retained generalized pipeline passes only amount/footer-number crops to Phase 3. It explicitly records `totalAuthority: not-evaluated`. These numeric-only crops have no observed TOTAL label or surrounding text position. Applying the existing `selectObservedHeader` to the real retained text yields no authoritative total for every document, and no payor/check/date. In particular, the existing unlabeled-footer rule requires actual text position near the end of a pass; a standalone numeric crop starts at position zero. The adapter does not add fabricated text padding or TOTAL labels to satisfy that rule.

Observed total numeric candidates: A $5,495 / $5,195 (conflicting); B none; C $2,252.95; D $4,505.90; check2715 none; check2721/2734 $2,198; check2743 $1,099. None is promoted to payment authority. Footer and total crops may duplicate the same pixels, so they are not new independent visual evidence.

## Fixture B

| Physical row | Complete observed candidates | Business candidates and outcome | Reason |
|---|---|---|---|
| 1 | INV-0313; INV-0513 | INV-0513 provisionally identified | INV-0313 is paid/non-collectible; INV-0513 is open and observed; $1,099 corroborates |
| 2 | INV-0414 | Unresolved | No such record in snapshot; no recognizer supplies complete INV-0514 |
| 3 | INV-0515 | Provisional identity only | Observed amount $1,092 conflicts with $1,099 balance; no authoritative document proof |
| 4 | INV-0518 | Provisional identity only | No valid row money candidate; total authority missing |
| 5 | INV-0519 | Provisional identity only | No valid row money candidate; total authority missing |

All five rows require payment review. Row 2 raw observations include INV0414, INVON14, and INVO914; none establishes the expected 5. The existing resolver does not assign an unobserved invoice by elimination. Even an amount-only elimination argument is not unique: the current snapshot has nine open $1,099 invoices, including 0528, 0529, 0530, and 0534 alongside the five B invoices. No observed unit can narrow the missing row.

Provisional B amount sum: $4,396. Authoritative total: UNKNOWN. Formal reconciliation difference: UNKNOWN, not $0. Against benchmark truth only, the four-record sum is $1,099 short. Check 2797 and 2026-08-19 remain truth-only; neither was recovered in these field observations.

## Real split cases

C provisionally identifies 0506/0507 as two different persisted children of 0505, despite shared D01 unit. Collection sum $2,252.95 equals the observed numeric total candidate arithmetically. Payment reconciliation still requires authority/payor evidence.

D provisionally identifies 0520, 0521, 0522, 0524, 0525. The P01 pair has parent 0517 and the V10 pair parent 0523; each child retains a separate UUID. Collection sum $4,505.90 equals the numeric total candidate arithmetically. No parent or corrected original enters the resolved set. Formal payment reconciliation remains review-required, not declared exact.

## Exhaustive assignments

Counts refer to complete persisted-record assignments. B has two optical token combinations before database lookup, but zero complete record assignments because its second-row candidate has no record.

| Document | Before constraints | Eligible | Amount/unit compatible | Unique record IDs | Exact authoritative reconciliation |
|---|---:|---:|---:|---:|---:|
| A | 1 | 1 | 1 | 1 | 0 |
| B | 0 | 0 | 0 | 0 | 0 |
| C | 1 | 1 | 1 | 1 | 0 |
| D | 1 | 1 | 1 | 1 | 0 |
| check2715 | 1 | 1 | 1 | 1 | 0 |
| check2721 | 1 | 1 | 1 | 1 | 0 |
| check2734 | 1 | 1 | 1 | 1 | 0 |
| check2743 | 1 | 1 | 1 | 1 | 0 |

Documents with exactly one fully valid assignment: 0; multiple: 0; zero: 8. Zero is classified as incomplete/inconsistent evidence and cannot authorize payment. Positive unique/multiple assignment cases are exercised separately in synthetic contract tests, never mixed into these real-document metrics.

## Reproduction and artifacts

Private root: `%LOCALAPPDATA%/Trimax/ocr-v2-training/phase5/`.

- `invoices-current.json`, `invoice-metadata-current.json`, `activities-current.json`: read-only snapshot inputs, including actual record IDs and correction/deposit evidence.
- `*-browser-evidence.txt`: source SELECT results.
- `resolver-evidence.json`: full unscored evidence, snapshots, candidates, rejection traces, assignment audit.
- `summary.json`: scored primary results.
- `recognizer-regression/`: fresh six-recognizer regression, 576 observations.
- `complete-final/`: full fresh original-image normalization, layout, fields, three recognizers, fusion, resolver, and stage timings. No cached OCR observations reused.

Commands:

```powershell
node --experimental-strip-types scripts/ocr-v2/resolver-regression.cjs
node --experimental-strip-types scripts/ocr-v2/resolver-benchmark.cjs $trainingRoot $phase5Output
node --experimental-strip-types scripts/ocr-v2/resolver-complete-replay.cjs $trainingRoot $freshOutput $wslTrainingRoot
```

The complete replay requires the existing isolated Ubuntu training environment and frozen local Phase 3E models. It does not train or download new models. GPU desktop measurements are not iPhone/server acceptance measurements; cold means fresh inference/model processes, not purging OS/model-file caches.

## Measured performance

Fresh sequential original-image replay after deposit reconstruction, including normalization, structural layout, field OCR, native invoice crops, WSL/process startup, three model loads/inference, fusion, resolver, and output serialization:

| Document | Complete seconds | Resolver ms | Enumeration ms (included in resolver) |
|---|---:|---:|---:|
| A | 8.298 | 8.75 | 2.46 |
| B | 10.326 | 6.75 | 0.67 |
| C | 7.907 | 5.35 | 2.20 |
| D | 8.717 | 8.29 | 2.57 |
| check2715 | 20.603 | 10.75 | 1.53 |
| check2721 | 10.259 | 6.02 | 1.59 |
| check2734 | 13.595 | 6.16 | 1.74 |
| check2743 | 12.791 | 5.35 | 1.93 |

Sum of the eight independently measured complete intervals: 92.497 seconds. No result cache was reused; installed model files and OS caches remained. No concurrent regression suite ran during this final measurement. Complete timing is measured around each actual full path, not estimated by adding historical stage measurements. Outputs preserve all frozen invoice candidate sets and review outcomes. Existing Tesseract box-clipping warnings occurred during normalization; they did not abort processing and are preserved in the log.

## Verification

- Phase 1 normalization/EXIF, Phase 2 layout, Phase 3 amount/total: passed.
- Phase 3E: fresh six-recognizer rerun, 576 observations, zero raw-output differences.
- Phase 4: 14 suites / 216 adversarial combinations passed.
- Phase 5: 21 suites, including exhaustive two-row assignment matrix, unique/multiple/zero outcomes, paid/corrected/void/draft exclusion, split children/source guards, duplicate display numbers and record IDs, deposits, exact cents, provenance, total authority, missing payor, ambiguity, and bounded enumeration.
- Golden A–E, retry/stale-response, duplicate, payment/reconciliation, correction and split regressions: passed, including full `npm test` / stabilization.
- TypeScript and production build: passed. Lint caught a local helper variable name; renamed it and reran lint before committing.
- No production module was edited for Phase 5. Existing unrelated working-tree changes were preserved and excluded from the local commit. Whole-workspace test/build results include those pre-existing changes.

## Recommendation

Additional evidence work before Phase 6: preserve and recognize actual header/payor/check/date and labeled total context, carry independently supported authority into the existing resolver, and recover the missing B invoice/amount evidence or request explicit operator review. Do not loosen the resolver, infer INV-0514 from the database, or promote number-only footer crops by fiat.

READY TO PROCEED TO OCR v2 PHASE 6: **no**. Zero wrong assignments passes the safety gate, but does not establish physical end-to-end payment readiness. Stop after Phase 5.
