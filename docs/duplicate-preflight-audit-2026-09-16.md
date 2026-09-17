# Duplicate preflight audit — September 16, 2026

## Verified incident and history

The supplied diagnostic reports distance 77, no invoice/check/amount evidence, six prior images compared, and a possible match to INV-0506 / INV-0507 for $2,252.95. A read-only production query found the corresponding two payment activity rows, applied September 12 at 01:50:16 UTC, with blank check reference and shared attachment `762ac37d-a55b-414c-982a-35e5d3cb7662`.

- Activity IDs: `345f81eb-a003-4fd0-8f5a-c99dd2a5205f`, `9e70c4b6-93bb-4fec-b154-9c69cafd749f`.
- Saved image: `f31adfa1-26ad-4e74-ad94-a4668d7ad57d/payments/2026-09-12/ac033902-b266-4583-8b33-c56413cd2763-trimax-remittance-ocr-1789177706967.jpg.jpg`.
- Both rows have a saved fingerprint; neither reports payment reversal.
- No production payment, invoice, attachment, date or activity record was modified during this audit.

## Root cause

`trimax-ahash-32-v1` rotates and flattens the image, converts to grayscale, stretches it to 32×32, and assigns each pixel one bit according to whether it is above the image mean. The 1,024-bit hashes are compared by Hamming distance. This measures coarse light/dark spatial patterns; it does not read check numbers, amounts or invoice identities. Stretching also removes original aspect ratio. Crop/background and shared printed layout can affect the result. Without both physical images, the exact contribution of template, crop and content to these 77 bits cannot be separated.

The old classifier independently accepted distance ≤84 as possible, with no metadata prerequisite. Distance 77 therefore qualified directly. It also allowed distances ≤36 with “compatible context,” including payor-only context, to become exact; distance ≤4 could become exact alone. Missing payor counted as compatible, so the diagnostic phrase “compatible payor” did not establish that a current payor was read.

The caller deliberately supplies empty check, amount, date, payor and invoice arrays before OCR to avoid stale evidence. The UI nevertheless stopped OCR for every non-`none` preflight result. That combination caused this failure.

## New decisions

- Pre-OCR: fingerprint candidates are returned separately as `imageHints`; the UI always continues reading. Hash-only evidence, including distance zero, is not document identity.
- Post-OCR: matching amount and invoice set with compatible check/date/payor identifies an exact duplicate. A matching check and amount plus very close image evidence can also establish identity when invoice sets do not contradict it. Rescan/received date is not document identity; stored dates are not changed.
- Partial document overlap may produce a possible warning after OCR, retaining owner/admin review requirements. Amount, check and disjoint invoice evidence can rule out a visually similar candidate.
- Exact active matches remain blocked; reversed matches preserve the existing review/reapply workflow. The server still checks duplicates before any apply-batch mutation. Payment allocation, eligibility, transaction/rollback and audit-write rules are unchanged.

## View Possible Match

The rendered anchor calls `closeDuplicateModal` and navigates to `/payments?business=…#payment-history`. The handler only clears local modal state. The destination reads history. It does not apply payment, update an invoice or received date, insert history/audit records, reassign attachments, acknowledge review, or set an override.

The separate `Continue After Review` button sets a local owner/admin override key and displays a green success toast. The underlying payment card also uses green styling. There is no green-success call in the View handler. The observed flash itself cannot be identified conclusively from the supplied text; no financial mutation path was found. A regression renders the actual modal, activates its anchor, and asserts only modal dismissal occurs, with payment APIs, database access, overrides and success toasts forbidden.

## Validation

Regression evidence includes a synthetic 77-bit distance between the prior two-invoice payment and the new five-invoice/$5,495 document. The image can locate the prior candidate, OCR continues, and extracted conflicting identity returns no duplicate. Tests retain exact rescans, matching check/total/invoice sets, partial review, reversed reapply, no input mutation, and a later-day rescan. Production camera geometry and image-source selection are unchanged. A physical installed-iPhone retest is still required.
