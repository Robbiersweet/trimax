# Remittance OCR deterministic contract

Status: HARDENING — NOT PHYSICALLY ACCEPTED / NOT STABILIZED.

## Production path

Prepared camera/existing photo → isolated source evaluations → Tesseract observations → exclusive physical rows and independently ranked header candidates → `RemittanceEvidence` → `resolveRemittanceAttempt` → duplicate identity → reconciliation → Payment Review → `attemptAllowsApply` → existing server payment validation.

`src/app/lib/remittanceAttempt.ts` owns the versioned contract. A UUID identifies each OCR request. Pending/failed reads have immutable empty-evidence snapshots; a completed read creates a new immutable snapshot under that attempt ID. Retry creates a new ID and never mutates the old object. Deep cloning and recursive freezing prevent shared inputs or later UI updates from modifying evidence. The resolver receives explicit invoice/activity/context snapshots, not React state, network calls, or time.

## Invariants

1. Observation, normalization, corroboration, and final resolution remain separate. Diagnostics expose FACT, NORMALIZATION, CORROBORATION, FINAL_RESOLUTION, and attempt ID. Full pass text/word observations and geometry assignments accompany normalized rows. MICR text remains excluded from text interpretation.
2. Physical rows have stable row-1… IDs, bounds, raw assigned tokens, source passes, normalized candidates, and resolution traces. Adjacent rows are excluded by midpoint-bounded Y bands. Original OCR observations are not rewritten to database identifiers or balances.
3. Header candidates are distinct from rows. Check/date/payor fields require field-shaped evidence; conflicting dates/payors remain unknown. Missing reliable total is null/nonpayable. Single-pass tiny totals contradicted by much larger row evidence remain unknown. Row subtotal and resolved balance total are retained as diagnostics, never promoted to an explicit document total.
4. The database narrows invoice-shaped candidates. Unit/amount-only recovery is removed. Known glyph families are structural; there is no arbitrary edit-distance search. Conflicting observed units require review.
5. Exactly one OCR resolver result supplies selected review IDs, amount authority, duplicate identity, audit metadata, and eligibility. Missing structured responses fail to review. The UI no longer computes fallback totals or replaces OCR amounts with due balances. Exact invoice-set/document-total corroboration in the existing matcher remains visible in traces; raw row amounts remain intact.
6. Reconciliation requires unique eligible invoice IDs, no unresolved material rows, authoritative document total, exact cent reconciliation, no duplicate conflict, and exact review/selected/contract ID-set equality. Current UI amount/duplicate checks and server collectible/payment checks remain additional restrictions. Manual payment and owner/admin server rules remain separate.
7. Source candidates run independently with separate requests/workers. Failures record stage/error; successes retain quality, confidence, header/row counts and coverage. No successful evaluation means review, even if a later fallback OCR returns text. Sharper still images receive no unconditional preference.
8. Retry clears parsed amounts/check/date/payor, selected/review invoices, duplicate modal/override state and active attempt. Late OCR responses, image preparation, crop detection, and duplicate preflight callbacks cannot update newer state. Only the current image/source provenance is retained.
9. Fingerprints remain candidate-location hints. Document-specific identity drives duplicate decisions. View Possible Match stays read-only. All duplicate conflicts prevent automatic photo Apply; existing explicit manual review/server override workflow is unchanged.

## Audit and consolidation

Removed OCR UI total fallback chain (response → raw-text matching → line sum), UI balance substitution/reconciliation, and raw-text re-matching for payment audit fields. Removed structured unit+amount-only invoice inference. Added one contract boundary around the existing matcher rather than replacing the matching engine.

Intentionally separate:
- General text parsing remains for manual/diagnostic helpers and legacy parser regressions. It cannot authorize photo Apply or override an attempt rejection.
- Candidate OCR is a low-cost source comparison; production OCR provides richer evidence for the selected frame.
- Invoice-column passes are explicitly included as observations and may contribute only through the same physical-row geometry.
- Check-only/add-details mode remains manual review, not an alternate invoice-selection authority.
- Live duplicate checks and server apply checks protect manual edits/concurrent database changes. They may veto but cannot elevate an OCR rejection.

## Golden matrix and provenance

`scripts/fixtures/remittance/golden.json` holds expected identifiers, fixture DB IDs, dates/checks, units, amounts, totals, duplicate state and Apply eligibility for A/B/C/D/E. These are reconstructions from historically tested text, not original camera images. Existing Tesseract image, matching, source, geometry, duplicate, retry, correction, split, timeliness and application tests remain in the full matrix.

Fixture D corrected with user-verified physical values on 2026-09-17: INV-0520 B06 1099.00; INV-0521 P01 1300.00; INV-0522 P01 458.40; INV-0524 V10 1300.00; INV-0525 V10 348.50. Five unique invoices total 4505.90. This replaces the synthetic equal-row reconstruction. Original camera-image acceptance remains outstanding.

Vercel's build command runs the full tests, then `scripts/remittance-release-gate.ts`, then the production build. Required A–D expected-value records are now complete; the release gate still rejects any missing/unverified required fixture. The contract golden matrix is imported into the existing matching regression, so it cannot be skipped by the normal deployment build. A failed old or new fixture blocks deployment. Local lint and TypeScript remain required release checks.

## Acceptance and freeze

Multiple different physical stubs still require fresh normal camera reads, correct readable headers/unique invoice sets, exact reconciliation, no stale data or false duplicates, and retry only after a failed initial attempt. Safe manual review is acceptable; invented values or wrong automatic selection are not.

Only after complete golden coverage AND physical acceptance may this document be marked STABILIZED. Thereafter OCR-core changes require a reproduced defect, new regression fixture, and proof that the complete old/new matrix passes. No opportunistic cleanup/refactoring of the stabilized core.
