# Phase 5E — vendor-neutral semantics and review cases

## Status and boundary

Offline success gate passed. No production changes, payments, push, deployment or Phase 6 work. The four existing review cases remain review-required; no optical information was manufactured to increase automation.

The prior supported display text is **`North Creek Apartmen`**, not a database-completed `North Creek Apartments`. That observed text still satisfies the unchanged resolver's substring-compatibility rule. No aliases or customer names enter the semantic recognizer.

## Generality audit

| Finding | Classification | Disposition |
|---|---|---|
| Expected customers, invoice/check numbers, totals and pixel annotations in benchmark/regression data | A: benchmark truth | Retained; scoring only, never semantic inference input |
| Image normalization, contour geometry, orientation, format-only money parsing, evidence confidence/provenance rules | B: generic structural/mechanical rules | Retained; resource limits and geometry/confidence tolerances, not customer selection |
| Legacy rightmost amount, Invoice→Date→Description order, nearby upper header/final footer, Property/Account crop pair | D: isolated research adapters; unsafe if treated as a universal production template | Five historical adapter modules remain reproducible, but are not called for unseen-page mapping |
| Customer-name/value literals, fixture-ID recognition branches, customer-named template selection in OCR v2 modules | C: unsafe candidate hard-codes | None found |

The candidate entry is `src/app/lib/ocrV2/semantics/index.ts`. It normalizes an unseen document, obtains broad OCR text/geometry, recognizes generic labels, maps fields, classifies structure and returns review when evidence is insufficient. It never falls back to a customer-specific or legacy fixed-order template. The historical real-corpus benchmark deliberately imports frozen validated crops/observations to preserve invoice-model comparability; it is not the unseen-layout selector.

Reproducible AST inventory: **22 TypeScript modules, 887 numeric constants**, zero customer/fixture-value string literals and zero fixture-ID branches. The private `generality-audit.json` lists every numeric literal with source line, classification, context and rationale. `semantics/README.md` documents each candidate heuristic and inherited optical-constant family. A static audit is supplemented by rename, coordinate transformation and rendered-layout tests; it is not a proof of every possible vendor document.

**Customer/property name literals in candidate OCR: 0. Fixture-specific branches: 0. Customer-specific template branches: 0. Unsafe fixed field coordinates in the candidate: 0. Vendor-agnostic architecture: yes**, within this offline semantic boundary. Real physical multi-vendor acceptance remains unproven because the current eight documents share a business ecosystem.

## Semantic contract

Types: property name, customer name, payor name, payee name, account number, check number, check date, generic date, invoice number, unit, row amount, subtotal, document total, description, balance and remittance. The model retains headers, table/columns/rows, metadata, raw labels and normalized hypotheses, field candidates, spatial relationships, confidence, source references, authority and review reasons.

Labels allow punctuation/whitespace normalization and an unambiguous one-edit OCR hypothesis. Raw text is preserved. Minor label noise alone does not create authority: corrected labels need confidence, independent evidence and geometry. SUBTOTAL/BALANCE/PAYEE are protected; TOTALS is not silently made TOTAL. Organization normalization folds case, whitespace and benign punctuation for comparison, without completing spelling, removing legal suffixes, or consulting customer aliases. The strongest observed display value goes to the existing resolver.

Structural IDs implemented:

- `tabular_header_total_footer_value_v1`
- `tabular_header_total_pair_v1`
- `tabular_footer_total_v1`
- `check_stub_tabular_v1`
- `tabular_metadata_v1`
- `unknown_review`

The retained real evidence produces the first, second and fifth classifications. These describe the observed total/metadata arrangement; they do not claim three independent vendors. The photographed check2715 includes a check, but the reused OCR observations primarily cover its stub, so classification does not invent unsupported check-block semantics. Check/stub classification is available when separated check/payee metadata is actually observed.

Unknown-layout fallback is implemented and tested from image normalization through OCR. Missing labels/rows return review, no invented columns, identity or total. Classification never authorizes payment. Invoice semantic fields are raw observations, not replacements for the unchanged specialized recognizers and Phase 4 fusion.

## Remaining review documents

| Document | Visual evidence | Authority and final result |
|---|---|---|
| A | Exact Property label, but retained values include `Horch Crack Apsrrren`, `Forte Creel Rpactmen`, and other disagreeing weak reads | Identity UNKNOWN. Existing $5,495.00 authority and five exact amounts remain; review for identity |
| B | No reliable organization spelling; generic model recognizes `TOIAL` as a noisy TOTAL candidate at confidence 0 | Identity and total UNKNOWN. 0515/0519 amounts UNKNOWN; 0514 invoice token remains unresolved. Review |
| check2743 | Property geometry exists; values `BSFER Creek Apartmen` (39) and `grein Zreek Apartimen` (23) do not agree | Identity UNKNOWN. Existing $1,099.00 authority and amount remain; review |
| check2715 | Identity supported. Footer `12,123.31` has confidence 91 in two variants. Exact TOTAL label 41 is uncorroborated; other exact/noisy reads are 6/19/0. Inline header amount is confidence 6 | Total UNKNOWN. Observed row subtotal is $12,123.31, but cannot authorize the total. Authoritative reconciliation unavailable; review |

B's retained `5,495.00` candidate is confidence 22. Weak/malformed current money and zero-confidence noisy label do not authorize it. Its subtotal is unavailable because two observed amounts remain unknown. The model does not substitute the known benchmark amount, row sum, workspace customer, or database invoice amount.

## Resolver after Phase 5E

| Document | Identity | Authoritative total | Observed exact difference | Automatic rows |
|---|---|---:|---:|---:|
| A | Unknown | $5,495.00 | $0.00 | 0/5 |
| B | Unknown | Unknown | Unavailable | 0/5 |
| C | Supported | $2,252.95 | $0.00 | 2/2 |
| D | Supported | $4,505.90 | $0.00 | 5/5 |
| check2715 | Supported | Unknown | Unavailable | 0/2 |
| check2721 | Supported | $2,198.00 | $0.00 | 2/2 |
| check2734 | Supported | $2,198.00 | $0.00 | 2/2 |
| check2743 | Unknown | $1,099.00 | $0.00 | 0/1 |

Automatic/review rows: **11/13**. Automatic/review documents: **4/4**. Identity authority: **5/8**. Total authority: **6/8**, all exact. Amounts: **22/24**, zero wrong accepted. Exact observed reconciliation: six documents. **Wrong automatic rows/documents: 0/0.** No rules, eligibility, duplicate protection, record-ID uniqueness or reconciliation behavior were changed.

## Cross-layout validation

All five structural and actual rendered-image OCR tests pass:

1. Property metadata; Invoice/Date/Description/Amount; upper Total label with final footer value.
2. Customer block; Invoice/Unit/Amount; Grand Total below rows.
3. Check metadata above; invoice list; Payment Amount to the right.
4. No unit; Amount/Description/Invoice in a different order.
5. Grand Total label/value above rows.

Fictional names/values only. Additional tests cover scaling/translation, name changes, noisy labels, stacked metadata, single-word organizations, payee separation, duplicate observations, source mismatch, conflicting totals, unproven preserved totals, unknown-image review, and zero-new-pass evidence reuse. These tests do not count as physical acceptance.

Validation passed: **26 semantic suites** (including all five rendered optical layouts); existing identity/ledger, document-total, foundation, layout, field, fusion, resolver and payment-evidence regressions; 14 dataset contract suites; full real-corpus non-regression gate; `npm test`; lint; TypeScript; production build. No existing safety test was removed or weakened.

## Evidence and performance

All eight ledger snapshots are byte-for-byte unchanged through semantic replay. Interpretation references existing observations; no weak new read replaces a strong prior one. No additional OCR passes are needed for the retained real replay. New/unseen pages use two bounded native/grayscale broad-text observations. All **120** invoice-model raw observations match the Phase 5D complete baseline exactly.

Eight-document retained replay timings:

| Stage | Total |
|---|---:|
| Semantic label interpretation | 26.696 ms |
| Field mapping / structural classification | 4.910 ms |
| Identity interpretation | 0.642 ms |
| Total authority | 2.595 ms |
| Evidence reuse / deduplication | 0.446 ms |
| Semantic computation including overhead | 35.306 ms |
| Incremental Phase 5E including artifact I/O and unchanged resolver | **191.410 ms** |
| Complete original-image offline pipeline, eight documents | **89.989 seconds** |

The complete run includes normalization, historical-compatible layout, current payment/identity extraction, retained evidence validation, all five unchanged invoice models, fusion, semantic interpretation and resolution. It reuses authenticated historical observations intentionally. This is workstation batch timing, not an iPhone or production latency claim.

Private artifacts: `%LOCALAPPDATA%\Trimax\ocr-v2-training\phase5e\committed`, `committed-complete`, `synthetic-verified`, `generality-audit.json`, `final-verification.json`. Unscored inference artifacts are written before truth is read for scoring. The frozen B/C split and manifest remain unchanged.

Reproduce with `semantics-audit.cjs`, `semantics-regression.cjs --optical`, `semantics-benchmark.cjs PRIVATE_CONFIG FRESH_OUTPUT`, and `dataset/cli.cjs benchmark PRIVATE_CONFIG MANIFEST FRESH_OUTPUT BASELINE --phase5e` (Node strip-types for TypeScript imports).

## Next phase recommendation

Ready for **Phase 6 consideration: yes** under the Phase 5E success gate. Recommended scope: controlled integration/shadow evaluation of the semantic candidate, additional independent physical vendor layouts, explicit operator review for missing fields, and preserved evidence diagnostics. This is not approval for automatic payment, deployment or a claim that all real documents succeed. Phase 6 has not begun.
