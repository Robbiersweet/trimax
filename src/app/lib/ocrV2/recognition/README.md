# Phase 3 — inactive field recognition

`recognizeFields(fullResolutionDocument, phase2Layout, imageId)` returns independent
observations. It does not read labels, query invoices, fuse candidates, reconcile,
or authorize totals/payments. No production imports or feature switch are added.

## Contract

Phase 2 owns every region and physical row. Crops use the original full-resolution
normalized color image with two horizontal padding pixels and **no expansion past
vertical ownership**. Fractional vertical cuts are rounded inward. An input whose
dimensions disagree with the layout is rejected. The caller must supply the same
normalized image used for layout; dimension validation alone is not identity proof.

Each field uses two passes: native color and gentle local-background contrast.
There is no binary threshold. Both are interpolated 2x and given a 12px white
border. Every observation records these transforms, crop/ownership, image/row/
region IDs, raw text, normalization transformations, unresolved glyph ambiguity,
configuration, confidence, duration, status/error, and mapped word boxes. Original
crop PNGs remain available in the private benchmark output.

Invoice uses single-line A–Z/digit/hyphen OCR; money uses numeric punctuation;
date uses date punctuation. Header and footer use unrestricted sparse text.
The small total crop and broad footer are distinct Phase 2 regions: the latter
preserves labels and their word geometry. No OCR text can redefine layout.
Unit is skipped unless Phase 2 explicitly marks a separate unit column supported.

Money parsing accepts complete decimal tokens only. It does not repair missing
punctuation/digits, replace O with 0, select among amounts, or infer totals. Check
candidates require a check label in header text. Dates from row crops stay row
observations and cannot supply a header date. All sibling observations survive.

## Evaluation

Run `node scripts/ocr-v2/field-regression.cjs` and
`node scripts/ocr-v2/field-benchmark.cjs PRIVATE_MANIFEST.json`.
The physical benchmark runs Phase 1 and Phase 2, then recognition, before reading
expected labels. It retains all observations plus a private contact sheet.
Diagnostic best = highest Tesseract confidence, with nonempty/longer text breaking
ties; it is not candidate fusion or a business decision. Exact candidate-set hit
is reported separately from that selected diagnostic observation. Character
accuracy is 1 minus Levenshtein distance / expected length, floored at zero.
Missing hyphens count as errors; they are never inserted.

A grayscale/unrestricted single-line invoice probe did not improve exact invoice
recognition on physical B, so it was not added. Two passes per crop means 36
passes on B's 18 regions (15 row fields, header, footer, total), not 36 full-page
passes. The bounded recognizer has no retry or broad recovery loop.

## Review boundary

Physical B remains the only real image. It recovers useful amounts and the total
but still misreads invoice glyphs and header metadata. Passing contract/safety
tests is not proof of exact physical recognition or production readiness.
Phase 4 must preserve unresolved alternatives and abstain when evidence is weak;
it must not manufacture digits from fixture expectations. Stop for review here.
