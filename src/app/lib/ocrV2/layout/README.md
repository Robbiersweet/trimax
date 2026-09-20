# Phase 2 — inactive pixel layout engine

`detectLayout(documentColor)` takes the full-resolution, upright color document
from Phase 1. It returns only geometry. It does not import Tesseract, recognize
characters, load benchmark labels, resolve invoices, or write records. Production
routes and UI remain disconnected.

## Detection

1. Make a separate grayscale analysis image, capped at 3200 px on its longest
   edge. Keep the source image unchanged. Measure both scale factors explicitly.
2. Estimate local background, isolate weak dark structure, and collect connected
   components at glyph scale. Long page edges/rules and large creases are excluded.
3. Form horizontal density bands. Find the dominant repeated broad body, using
   band height, component support and spacing. Include taller interior body bands;
   do not derive row count from a fixture or expected invoice set.
4. Define stable ordered row IDs and shared whitespace cuts. Row ownership is
   `[top, bottom)`. Adjacent rows share a boundary, never an ownership area.
5. Find heading groups and repeated vertical whitespace across the body. Align
   compact-field candidates to heading anchors and distinguish a longer description
   span and the rightmost narrow amount span.
6. Search below the actual last row for a separate right-aligned text group. A
   nearby footer can shorten the last ownership band. If no supported group exists,
   preserve the entire remaining footer area and return an uncertainty warning.

No fixed customer coordinates or recognized invoice strings participate. Numerical
thresholds describe glyph scale, density, repetition and geometric support. They
are not yet calibrated across a representative multi-customer image dataset.

## Coordinate and ownership contract

All returned geometry is in **normalized-document-color pixels**, after Phase 1's
orientation correction. This is distinct from Phase 1's EXIF-normalized full-frame
coordinates. Use its homography and final rotation when mapping back to the source.

`ownerAtY` implements half-open ownership. `ownerOfBounds` rejects an observation
that crosses row boundaries. `cropBounds` permits small padded crops without
mutating row ownership. Generate Phase 3 crops from `documentColor`, never the
downsampled analysis image. The benchmark writes crop provenance with source,
full-resolution bounds and authoritative ownership bounds.

## Column certainty

Geometry can locate a field without proving its semantic label. The output names
`invoice`, `date`, `description`, `amount`, and `propertyAccount` are explicitly
marked `roleIsGeometricHypothesis`. Each includes supporting evidence and a
certainty classification. Phase 3 must validate field contents; layout confidence
does not authorize a payment or total.

On physical B, the invoice/date pair aligns with separate heading groups; amount
uses repeated right-hand alignment. A unit token appears within the description
area, but geometry cannot reliably distinguish it from an ordinary first word.
It remains in the description crop; no separate unit column is fabricated.

## Benchmark and tests

```powershell
node scripts/ocr-v2/layout-regression.cjs
node scripts/ocr-v2/foundation-regression.cjs
node scripts/ocr-v2/layout-benchmark.cjs PRIVATE_MANIFEST.json
```

Private annotations are stored beside the private manifest as
`layout-B-annotation.json`. They contain an image hash, coordinate space, manual
row/column/header/footer rectangles and a visible-total test point. The detector
finishes before the benchmark reads these labels. Labels are never engine inputs.

Overlays, row/field crops, raw geometry, annotation and reports remain outside the
repository and production UI. Only B has a retained real high-resolution original;
A/C/D remain structural labels. Synthetic perspective, skew, wrinkles, shadows,
faint text, uneven/tall rows, header additions, footer distances, variable amount
widths, different row counts and reduced-analysis-coordinate tests supplement B.

Region overlap is rectangle intersection-over-union against approximate manual
annotations. Row matching uses IoU >= 0.5 for missed/extra counts. The physical
benchmark additionally requires every row IoU >= 0.85, correct count/order,
exclusive ownership, invoice IoU >= 0.85, amount >= 0.70, header >= 0.90, footer
>= 0.75, and containment of the annotated total location. These are Phase 2
geometry acceptance criteria, not payment or production release gates.

## Limits / stop point

This is validated on one real physical document plus supplementary geometry tests.
No universal layout accuracy is claimed. Very sparse, heavily occluded or atypical
tables may return no supported body or uncertain columns. Unit separation is not
implemented. No field-specific OCR, whitelist tuning, fusion, total authority,
business resolution, capture UX, production flag, push or deployment is added.

Phase 3 should recognize the existing row-local invoice/amount crops with a small
bounded field-specific ensemble, preserve every observation and its transforms,
and reject cross-row evidence. Header/date and isolated total crops require their
own observations; total authority stays downstream. **Do not start Phase 3 until
the Phase 2 metrics and overlays are reviewed.**
