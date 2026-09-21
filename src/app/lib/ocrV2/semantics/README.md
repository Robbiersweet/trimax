# Vendor-neutral semantic candidate (offline)

The candidate entry is `analyzeUnseenDocument` in `index.ts`: normalize original pixels, obtain broad text geometry with two bounded non-destructive page variants, identify labels, map columns/metadata, classify structure, and return evidence or review. Trusted retained observations bypass OCR. No customer records, expected answers, fixture IDs, absolute field coordinates, or preferred column order enter interpretation. Identity authority is distinct from resolver compatibility.

The Phase 2 `layout/index.ts`, `layout/generalized.ts`, Phase 5B `paymentRegions`, and Phase 5D Property/Account crop discovery are **frozen research adapters**, not fallback templates for unseen pages. They assumed rightmost amounts, invoice/date/description ordering, nearby upper headers, or a Property/Account pair. They are retained for reproducible historical crops/recognizer comparisons. The Phase 5E real benchmark imports their already validated observations and geometry via `replay.ts`; it does not infer their field order from customer text. The generic candidate does not call those detectors. `interpret.ts` uses the existing formatting-only money parser, not the legacy total recognizer.

## Semantic contract

`DocumentSemanticModel` records typed fields, raw labels, corrections, spatial relationships, source observation IDs, row geometry, identity/total authority and review reasons. Types include property/customer/payor/payee, account, invoice, unit, row amount, subtotal, final total, balance, check/date, description and remittance. An unqualified Date remains generic; only Check Date establishes that semantic role.

Labels use a centralized generic vocabulary. Formatting normalization and a unique one-edit label hypothesis are allowed. No digits or organization spelling are repaired. SUBTOTAL, BALANCE, PAYEE and TOTALS are protected from final-total/payor promotion. Noisy labels require corroborated high-confidence observations and geometry; recognizing a semantic candidate is not authority. Labels inside a colon-delimited organization value are not treated as new labels.

Organization normalization folds case for comparison and standardizes whitespace, periods/commas and quotation marks. It preserves raw display evidence, legal suffixes and misspellings. No customer alias lookup exists here. The existing business resolver receives the strongest observed display text and remains unchanged.

Tables can have any column order or no unit column. Invoice and amount labels plus repeated row values establish a new table; missing structure returns `unknown_review`. Imported historical row geometry is explicitly an earlier optical result, not guessed from fixture/customer identity. No columns are fabricated to satisfy a known template.

Totals may be adjacent above, below or beside rows, or an upper label with a separately aligned final value. A label/value relationship, supported monetary observation and row exclusion are mandatory. Existing Phase 5C authority survives replay unless new supported evidence conflicts. Observed subtotal only corroborates or vetoes; it never selects or creates a total. Balance and subtotal are not automatically payable amounts.

Structure IDs: `tabular_header_total_footer_value_v1`, `tabular_header_total_pair_v1`, `tabular_footer_total_v1`, `check_stub_tabular_v1`, `tabular_metadata_v1`, `unknown_review`. Classification cannot confer authority or alter the resolver. Sparse evidence can leave the subtype less specific than the physical image; it is not a customer classifier.

## Constants and heuristics

Every candidate semantic tolerance is based on observed text scale, not a fixture's pixel coordinates:

| Constant / rule | Generic purpose |
|---|---|
| One label edit, minimum 5 characters, unique vocabulary match | Bounded label-only OCR noise; short ambiguous labels cannot be fuzzy repaired |
| Label windows 3/2/1 words | Multiword labels such as Check Amount and Grand Total; longest match first |
| Same baseline within 0.6 word height; gaps within 2 word heights | Join words on a printed line without fixed image coordinates |
| Adjacent values within 12 label heights; stacked values within 2 heights | Bounded metadata pairing; distant fields are not silently attached |
| Invoice-column tolerance 3 glyph heights; amount alignment 8 heights for initial mapping | Coarse label-to-column association, subsequently checked for repeated row evidence |
| Identity label 60; corrected label 70 with two observations; value 80 with two run keys | Conservative optical agreement, not calibrated probability or name matching |
| At least three observed letters | Excludes punctuation/numeric-only identity while allowing single-word organizations |
| Money 85 strong-single or two variants at 40 | Preserved Phase 5C money support rule |
| Exact total label 85 or repeated labels at 20 with one at 40 | Preserved Phase 5C semantic support; noisy labels use stricter corroboration |
| Final amount alignment within 2 field heights; distance within 4 row heights | Optional detached-final-value structural pattern; adjacent totals do not need a footer |
| Separate check metadata more than 8 row heights from body, with payee context | Descriptive check/stub subtype only; cannot authorize fields or payments |
| PSM 11, 300 DPI hint, native/grayscale, two passes | Bounded general page-text observation; no invoice-specific alphabet or customer lexicon |
| Source/crop/run-key dedupe | Reused evidence does not manufacture independent votes |

Inherited generic optical constants: 48-million-pixel decode/warp cap; 900-pixel paper-contour analysis; 1800-pixel orientation preview; four right-angle candidates with a two-second observation cap; 10% orientation-score separation; 10-pixel page-edge preservation margin; 8-bit intensity bounds; Otsu/contour-fill/edge-contrast thresholds. These describe resource limits, rotations, paper geometry and image filtering, not field positions. They remain experimentally calibrated and are not proof of broad physical generalization. Uncertain geometry/orientation is retained as evidence, not a reason to select a customer template.

Other frozen Phase 1–5D numeric constants (connected-component filters, glyph/line grouping, sharpening kernels, crop padding, field grammar, ledger support and resolver enumeration limits) are listed by source line in the private AST audit. General mechanics are category B; legacy column-order/header/footer assumptions are category D and excluded from unseen-page mapping. Benchmarks and expected answers remain category A. No category C customer/fixture branch remains in the candidate entry.

## Limits

Five rendered fictional structures test general semantics, not physical multi-vendor acceptance. The eight real documents share a business ecosystem. Real review cases remain review when optical information is insufficient. Phase 6 may evaluate integration/shadow behavior; this module is not a production deployment or payment authorization.

## Native still table mapping

Aligned labels from verified passes on the same normalized image are merged before column construction. Repeated invoice-token bands preserve unreadable amount cells. Without an Amount label, only a single repeated decimal-money alignment can provisionally supply that column; bare numbers, dates, and competing alignments remain unresolved. Label references, geometry observations, and semantic certainty are recorded separately. No monetary value or business authority comes from geometry.

Private image regression: `node --experimental-strip-types scripts/ocr-v2/native-layout-regression.cjs PRIVATE_MANIFEST PRIVATE_OUTPUT`. The manifest binds `file`, `sha256`, and `expectedRows`; image bytes and output stay outside Git. Recognition expectations are not inputs to layout.
