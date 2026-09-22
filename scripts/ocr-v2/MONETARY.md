# Phase 6 native-still monetary evidence

The shadow entry previously populated money only from unrestricted full-page
semantic OCR. The offline specialized field recognizer and Phase 5C total
authority adapter were never invoked for these native stills.

`recognition/semanticMoney.ts` consumes the existing semantic row ownership
regions. Pixel components tighten only monetary crops, excluding the paper edge;
the document layout and invoice crops remain unchanged. Each field uses two
bounded Tesseract LSTM single-word numeric passes: native and local contrast.
There is no answer, invoice balance, vendor name, fixed page coordinate, or
invoice model input in this module.

Rows require a complete numeric observation at confidence 85 or greater and no
credible competing value at confidence 40 or greater. Correlated weak outputs
cannot authorize a row simply because they agree. Confidence is an uncalibrated
heuristic; unresolved rows always block automatic shadow classification.

An isolated footer line must align with the detected amount regions, remain
outside all rows, and be near the last row. Multiple eligible footer lines fail
closed. An already observed exact TOTAL label receives two small label-only
passes. The unchanged Phase 5C document-total policy decides authority using
these observations and existing page evidence. Check/date/identity are unchanged.

Every pass records source/crop hashes, physical ownership, native bounds, raw
text, confidence, configuration, words, and timing in the append-only ledger.
Exact ledger matches are reusable; conflicts cannot supply acceptance. No
historical image or expected value is committed. The private real-image harness
checks hash integrity, all five monetary crop invocations, total evaluation,
resolver propagation, unchanged invoice fusion/date/identity, no wrong accepted
money, and zero-pass exact evidence reuse. Its truth enters after inference.

Run `money-regression.cjs PRIVATE_MANIFEST` with Node strip-types. The private
manifest contains `file`, `sha256`, `pairedEvidence`, `expectedRows`,
`amountsCents`, and `totalCents`. Paired evidence is an existing production
diagnostic export. Frozen invoice observations are reused only after asserting
every crop hash is unchanged; this test is not a fresh invoice-model benchmark.

The production worker still executes the unchanged invoice models and resolver.
This change grants no payment access and does not affect legacy OCR.
