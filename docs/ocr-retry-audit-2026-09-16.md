# OCR retry audit — September 16, 2026

## Evidence boundary

The request supplies the expected check 2797, date 08/19/2026, five invoice/unit pairs, five $1,099 balances, incorrect $2.49 total, truncated check 279, and a row-5 OCR amount of $1,035. It does not include the original diagnostic JSON, OCR pass text, coordinates, confidence values, image, or source-preflight error. Those were requested. The new fixture reconstructs the reported evidence synthetically; it is not a replay of the physical capture. Exact incident causation and all original candidates cannot yet be established.

## Confirmed code defects and repairs

- Cross-pass total selection previously took the total from the highest-scoring whole OCR attempt. Row-rich attempts could therefore outrank stronger totals from other passes. Totals now compete on their own explicit label, monetary form, independent-pass agreement, text footer position, confidence, and structured-row subtotal support. Synthetic merges do not vote. Unlabelled footer amounts need repeated-pass or row-subtotal support; the largest visible number is never sufficient. Close conflicting totals are non-payable. The old text repeat calculation also missed thousands separators; it now compares parsed amounts.
- Check completion only considered suffix compatibility (missing leading digit), not prefix compatibility (missing trailing digit). Header candidates now support both, plus an adjacent single digit on the same labelled line. Header evidence is collected across the current request's passes rather than only the selected body text. Payment history is not involved.
- The row resolver ignored `invoiceEvidenceByPass` when constructing eligible candidates. It now consumes that same-row evidence. A completely missing invoice token can be recovered only from structured unit plus amount evidence with exactly one eligible invoice. Unstructured unit-only recovery remains blocked. Whether this was the precise INV-0513 failure stage awaits the original payload.
- Unresolved rows now block reconciliation, even if the remaining subset totals happen to match. Duplicate IDs and duplicate invoice numbers remain blocked. Row OCR amounts remain in traces; the review can use invoice balances only after every row uniquely resolves, every target is collectible, and the unique invoice set exactly matches a payable explicit document total.
- The photo flow previously used reconciliation checks only when OCR status was `ready`; incomplete photo review could bypass that condition. Photo application now requires verified reconciliation, and the submit handler checks the same gate.

## Retry path

The API receives only the current image, document type, and retry strategy. Each request creates its own attempts and structured row evidence. There is no first-request candidate array sent to the next request.

Standard pass order: grayscale/sparse, high-contrast/block, adaptive/auto, sharpened/sparse, row-focused/line. Alternate order: adaptive/auto, sharpened/sparse, high-contrast/block, grayscale/sparse. Alternate omits the row-focused single-line pass. Route budgets and early exits can therefore change which evidence is available. The scoring rules themselves do not depend on retry strategy. Camera crop geometry and preprocessing recipes are unchanged.

The UI intentionally reuses the current normalized image and regenerates its duplicate fingerprint, with empty OCR fields in duplicate preflight. That is current-document identity, not payment-history evidence used for parsing. It formerly retained the previous amount/check/payor/date when a later response lacked those fields. Primary reads now clear those fields, selected invoices, reconciliation approval and diagnostics; version checks reject late responses. Preparation invalidates older OCR work. Check-details-only capture retains its separate intended flow.

## Diagnostic output

`diagnostics.headerEvidence` records every considered total with raw/normalized value, pass source, confidence, text position, independent agreement, subtotal agreement, score and selected evidence; it also records check candidates and the selected check. Text position is not measured image geometry. Existing structured-row diagnostics retain word bounding boxes. These candidate details are included in copied UI diagnostic lines.

## Source selection

The source preflight endpoint runs an isolated bounded comparison. The UI falls back to canvas when the preflight response fails and records its error plus per-candidate failure stage. Better contrast/sharpness does not establish successful OCR preflight. The exact candidate, timeout/parse/validation stage, and error for the reported ImageCapture failure are unavailable without the original diagnostics. Source selection and camera geometry are unchanged; ImageCapture has not been promoted.

## Validation boundary

The synthetic fixture resolves INV-0513/U05, INV-0514/H10, INV-0515/Q08, INV-0518/U03 and INV-0519/A10, check 2797, total $5,495. It preserves the $1,035 row evidence and requires complete invoice-set reconciliation. Tests exercise incomplete first response, one alternate retry, stale-response rejection, candidate isolation, ambiguous unit matches, duplicates, conflicting totals and unresolved extra rows.

A fresh physical installed-iPhone PWA test is required. Successful automated tests do not establish that this physical capture is fixed.
