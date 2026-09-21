# Phase 5D — offline document identity and evidence preservation

## Status

Implemented and evaluated offline. **The six-document success target is not met; Phase 6 is not ready.** Four documents (11 rows) now resolve automatically; four (13 rows) require review. Wrong automatic rows/documents: **0/0**. Production, payment application, invoice recognition, Phase 4 fusion, and resolver business rules are unchanged. No push or deployment.

## Existing identity contract

`remittanceMatching.ts` enforces a nonempty payor/customer string, one customer across the matched invoice set, and compatibility with every resolved customer's name. `customerMatchesPayor` trims/lowercases the payor and accepts substring containment in either direction against the lowercased customer name. It is not exact-name equality and not fuzzy edit-distance matching. The mandatory missing-payor/multiple-customer/mismatch issues are enforced by `findRemittanceMatches`; `remittanceAttempt.ts` carries those issues into reconciliation eligibility.

`extractLikelyPayor` recognizes PAYOR/PAYER/CUSTOMER/PROPERTY/CLIENT labels and property-like text; `OfflineDocument.header.payor` supplies that same existing contract. A printed property name can satisfy it. A numeric account/property ID has no mapping that can substitute for the name. PAYEE/remit-to recipient and BANK text must not be treated as the payer. Check/date/payor participate in duplicate comparison but check identity cannot replace customer identity. Workspace context scopes the upstream data pool; it does not establish optical identity. `OfflineRow.accountCandidates` does not establish identity in this resolver.

No rule was relaxed. In the five supported documents the literal printed/OCR value is `North Creek Apartmen`. It satisfies the existing containment check against `North Creek Apartments`; the omitted suffix was **not** supplied to OCR or added to its result. Customer records enter only after extraction, for resolution and scoring.

## Identity extraction and authority

Phase 2 structural lines identify the table heading before the invoice column. Exact Property/Account OCR anchors delimit the identity columns. Row baselines and connected components determine each crop. Only two existing variants (native and local contrast) run per crop. Raw text, words, coordinates, source/crop hashes, recognizer/configuration, confidence, stage and timestamp are retained separately from whitespace-normalized candidates.

Authority requires reliable exact labels plus exact high-confidence agreement across independent row crops (or two very strong variants on a single row), with conflicting strong evidence vetoing authority. Fuzzy spelling, account values alone, an uncertain label, and database completion cannot authorize identity. A weak preceding heading may locate diagnostic crops but cannot authorize them. Scores are engine confidence, not calibrated probabilities.

| Document | Representative raw property OCR | Raw account OCR | Identity authority | Resolver result / remaining blocker |
|---|---|---|---|---|
| A | `Horch Crack Apsrrren`; `Forte Creel Rpactmen` | `Paint Servi` | UNKNOWN | Review: insufficient property agreement; five amounts and total reconcile exactly |
| B | `Norls Crock Apartimen`; `North Creek Apartwen`; `Narth Creck Aparimon` | `Maint Servi`; `Paint Servi` | UNKNOWN | Review: weak Property label/name, two unknown amounts, missing total authority, 0514 token unresolved |
| C | `North Creek Apartmen` (87/93/83) | `Paint Servi` | Supported, verified resolver match | Automatic: 2 rows, $2,252.95, $0.00 difference |
| D | `North Creek Apartmen` (85–93) | `Paint Servi` | Supported, verified resolver match | Automatic: 5 rows, $4,505.90, $0.00 difference |
| check2715 | `North Creek Apartmen`; weaker `North Creck Apartmen` | `Other Repla`; `Paint Servi` | Supported, verified resolver match | Review: no authoritative total |
| check2721 | `North Creek Apartmen` (92–93) | `Paint Servi` | Supported, verified resolver match | Automatic: 2 rows, $2,198.00, $0.00 difference |
| check2734 | `North Creek Apartmen` (92–93) | `Paint Servi` | Supported, verified resolver match | Automatic: 2 rows, $2,198.00, $0.00 difference |
| check2743 | `BSFER Creek Apartmen`; `grein Zreek Apartimen` | `Paint gervi`; `Paint fervi` | UNKNOWN | Review: insufficient property agreement; amount and total reconcile exactly |

All eight have raw identity observations; five have authoritative identity; three remain uncertain. All raw/normalized alternatives, label geometry, per-row invoice evidence, amounts, authority and resolver audit are in the private per-document JSON, not just the representative strings above. No full exact customer name was reconstructed.

A separate bounded diagnostic using the existing general PP-OCR/PARSeq adapters on A/check2743 property crops also failed to recover reliable names. Those exploratory results are retained privately, not added as an unbounded new OCR recovery loop or used to override authority.

## Attempt ledger

`EvidenceLedger` is attempt/document/source scoped and append-only. Snapshot copies cannot mutate stored records. Raw observations and append-only provenance invalidations remain visible. A projection supplies one vote per field/row/source/crop/engine/variant/configuration; stage, timestamp, filename, and confidence changes do not create independent votes. Equivalent rerun confidence uses the minimum, never a sum or maximum. Conflicting normalized results from one run key supply no vote. Conflicting supported values from independent runs remain review-required. A later weaker crop does not delete earlier valid evidence.

The payment adapter verifies normalized-image and raw-crop hashes. Retained row amounts must pass the existing Phase 5C physical row/amount ownership checks. Current exact Phase 5B amount regions preserve their existing decisions. Canonical preprocessing/configuration names prevent aliases and repeated crops from manufacturing agreement in the unchanged money/total policies. Invoice observations are copied into the ledger without changing their frozen fusion decisions.

The archive sweep retains earlier Phase 3 and Phase 5 text as well as the canonical 5B/5C observations. Some earlier exports lack a retained crop digest or frozen OCR configuration. They remain visible as diagnostic-only, with an explicit reason; provenance is not fabricated by hashing a newly reconstructed historical crop. Legacy timestamps are artifact modification times, not claimed physical capture times. Canonical validated observations supply authority; archive copies cannot add votes.

## Fixture B replay

| Physical row | Retained evidence | Result |
|---|---|---|
| 0513 | Current valid $1,099.00 evidence | $1,099.00 |
| 0514 | Current valid $1,099.00 evidence | $1,099.00; invoice token still unresolved |
| 0515 | Earlier `1,099.00` confidence 16 has oversized/cross-row glyph bounds; valid `1,097.00` confidence 0; later `1,092.00` confidence 12 | UNKNOWN; no lost valid strong evidence |
| 0518 | Earlier `1,099.00` confidence 87, exact source/crop and valid row ownership | $1,099.00 preserved through the ledger |
| 0519 | Earlier `1,098.00` confidence 49 has invalid row ownership; valid `1,098,00` confidence 0; later malformed/weak variants | UNKNOWN; no lost valid strong evidence |

Header/table/footer audit found no trustworthy retained exact TOTAL label. `TO LAL`, `TOIAL`, and `TOTALS...` are not silently rewritten to TOTAL. The earlier numeric `5,495.00` candidate remains retained at confidence 22 but is not authoritative. Row subtotal or invoice database amounts cannot repair it. All 447 serialized Phase 5B/5C B observations examined in the archive audit contained zero exact standalone TOTAL header text; the separate original Phase 3 header/footer audit agrees.

## Metrics and reproduction

Private outputs: `%LOCALAPPDATA%\Trimax\ocr-v2-training\phase5d\release` and `release-complete`. These contain raw observations/ledgers, unscored decisions, scored summaries and the complete benchmark report. `all-retained-audit.json` records the archive sweep; original Phase 3 provenance is in the per-document ledger. Research holdouts B/C remain unchanged and historically exposed; no training occurred.

The full run starts at original image normalization, then layout, payment OCR, total authority, ledger replay, identity OCR, all five unchanged invoice adapters, fusion, resolver and post-resolution scoring. Completed historical observations are reused intentionally. This is an offline workstation benchmark, not an iPhone or production latency claim.

```powershell
node --experimental-strip-types scripts/ocr-v2/identity-benchmark.cjs PRIVATE_CONFIG FRESH_OUTPUT
node --experimental-strip-types scripts/ocr-v2/dataset/cli.cjs benchmark PRIVATE_CONFIG MANIFEST FRESH_OUTPUT BASELINE_REPORT --phase5d
node --experimental-strip-types scripts/ocr-v2/identity-regression.cjs PRIVATE_SUMMARY
```

Final measured timing (eight-document batch, including artifact I/O):

| Measurement | Batch total | Mean/document |
|---|---:|---:|
| Identity extraction including geometry, worker startup and two-variant OCR | 8.339 s | 1.042 s |
| Ledger provenance validation, deduplication and payment projection | 2.141 s | 0.268 s |
| Incremental Phase 5D including archive I/O, identity, ledger and resolver | 13.182 s | 1.648 s |
| Complete original-image offline benchmark including five invoice models | 92.173 s | 11.522 s (batch/8) |

Identity per-document range: 0.553–1.507 s. Ledger range: 0.082–0.540 s. These are sequential workstation measurements; no claim of independent per-document cold model startup is made. The complete run reuses authenticated historical observations as requested, but reruns image normalization, layout, current optical fields and all invoice models.

Validation passed: 14 identity/evidence suites; existing document-total, foundation, layout, field recognition, fusion, resolver and payment-evidence regressions; 14 dataset contract suites; complete dataset non-regression gate; `npm test`; lint; TypeScript; production build. All **120** invoice-model raw observations are byte-for-byte unchanged from the previous complete benchmark. Existing check/date results remain unchanged. Build/test execution does not deploy anything.

Row amounts remain 22/24 exact, two unknown/ambiguous, zero wrong accepted. Document totals remain 6/8 authoritative and exact. Six documents retain exact observed reconciliation: A, C, D, check2721, check2734 and check2743. Four pass the full unchanged resolver; A/check2743 still fail identity. The private `identity-audit.md` contains every raw and normalized identity observation, field confidence, frozen invoice candidate and per-row resolution, with links by filename to the full ledgers.

## Phase boundary

Phase 5D code and safe partial results are locally committed. A and check2743 still need trustworthy visual document identity. B additionally needs invoice/amount/total evidence; check2715 needs total authority. **Not ready for Phase 6. No Phase 6 work, production change, push or deployment.**
