# Trimax OCR v2 — inactive development

Phase 2 now adds an equally inactive [pixel layout module](layout/README.md).
The Phase 1 implementation and its historical benchmark below are unchanged.

This module is inactive. No route or UI imports it. It accepts one still-image
buffer and returns optical images plus typed evidence; it cannot select invoices,
authorize payments, or write attempt/payment records. No hosted OCR service is used.

## Existing architecture and unreleased work

The pinned production baseline is `c1e805efea8dbd55c1a9a34292cea8ef8c07e400`.
Its camera UI collects live/video and ImageCapture candidates, probes orientation,
compares source-preflight results, and calls the Tesseract extraction route. That
route uses faint-image variants, geometry reconstruction, targeted recovery and
invoice-column observations. `remittanceAttempt.ts` and `remittanceMatching.ts`
then perform deterministic business resolution; duplicate, exact-total and
eligibility guards remain downstream.

Earlier **uncommitted** changes in `BatchInvoicePayments.tsx`, the extraction route,
`ocrSingleStill.ts` and related tests replace the capture front end. Those changes
have not passed physical release acceptance. They are preserved, not wired to v2,
and must not be included in a Phase 1 deployment. Their useful invariants—one
original still, EXIF consumed once, bounded direction probes and immediate preview—
inform v2. Capture integration remains Phase 6.

## Module boundary

- `types.ts`: versioned optical evidence and a future correction-label schema.
- `documentGeometry.ts`: connected contours over several luminance thresholds,
  convex quadrilateral, fitted edge lines, measured edge contrast and confidence.
  No bright-pixel fraction is used as the document-size measurement.
- `documentNormalization.ts`: safe single-frame decoding, original hash, EXIF once,
  conservative paper rectification, color preservation, lighting variants and
  four bounded text-direction observations. It reuses only the existing generic
  direction-evidence scorer, not business-resolution logic.

All geometry is explicitly in the EXIF-normalized full-image coordinate system.
The retained homography maps the rectified document **before its final right-angle
rotation** back to that coordinate system. Phase 2 must compose the final rotation
when mapping regions back; never mix those spaces. The original JPEG and normalized
full frame remain available. The rectified color document is not overwritten by
enhancement or binary variants.

Perspective rectification also removes the measured paper-edge skew. It does not
claim to flatten folds or correct arbitrary curved pages. If reliable edges are
absent, the complete image is retained. Tiny/uncertain images do not establish
orientation. Confidence is an optical heuristic, not a calibrated probability.

## Variants and interpretation

Native color, plain grayscale, local contrast, and light sharpening are retained
separately. Adaptive threshold is emitted **only for diagnostic comparison**. Its
speckle and weak-stroke losses on physical B mean it is not approved as a default
recognition input. Local contrast is also a candidate, not a replacement for the
original; plain grayscale and native color preserve evidence it may alter.

Weak-stroke retention measures dark local contrast at the same pixels relative to
the native document. It includes wrinkles/noise and is **not** character accuracy.
Paper annotations are approximate manual labels, not ground-truth segmentations.

## Private benchmark

Run from the repository root:

```powershell
node scripts/ocr-v2/benchmark.cjs PRIVATE_MANIFEST.json baseline
node scripts/ocr-v2/benchmark.cjs PRIVATE_MANIFEST.json foundation
node scripts/ocr-v2/foundation-regression.cjs
```

The manifest and outputs must be outside the repository. Keep them in user-private
storage under existing image-retention permissions; never commit real images,
OCR text, base64, EXIF payloads or generated visual artifacts. The manifest format:

```json
{
  "baselineCommit": "c1e805efea8dbd55c1a9a34292cea8ef8c07e400",
  "fixtures": { "B": { "file": "fixture-b-original.jpg", "sha256": "VERIFIED_HASH" } }
}
```

`scripts/ocr-v2/labels.json` contains evaluation-only user-supplied structural truth.
Labels are never passed to the normalization module or recognition engine. Missing
real images for A/C/D are reported as unavailable, not successful. Different crops
or variants of B are not independent real fixtures.

The baseline loader reads all application source from the pinned Git commit,
ignoring dirty working files. Each server stage has a fresh module graph and OCR
observation scope; the public language-model download cache may be warm. It replays
orientation, single-still preflight and detailed recognition. It does **not** invent
a video capture or claim physical-camera/network/browser latency.

The foundation benchmark also performs two explicitly separate experiments:

1. Feed v2's rectified color document to the unchanged pinned legacy recognizer.
2. One fixed general-text OCR pass per optical variant, reporting literal token
   coverage. Those diagnostic passes are not a proposed v2 recognition pipeline,
   field/row matching, total authority or release acceptance.

No business ID, authorization token or persistence payload is supplied. This is
an offline harness; no real payment or production attempt is written.

## Phase 1 limits and Phase 2 handoff

Only one original physical remittance is available locally. This cannot establish
generalization or a release success rate across customers, lighting or devices.
Phase 2 adds the isolated layout engine described above. V2 still has **no
specialized field recognition, fusion, resolver adapter, native capture integration
or production activation**. Each phase stops for review.

The Phase 2 layout module independently detects text-density bands and repeated
column alignment, separates header/footer from body, and measures row precision,
recall and boundary overlap against private annotations before field OCR is added.
Keep ambiguous regions unresolved; do not use known invoice records to invent
geometry or tokens. Continue to the existing resolver only in Phase 5.

## Diagnostics and future training

Foundation evidence carries `engine: v2`, version, source hash, transforms,
orientation observations, variant metrics and durations. It can be attached to the
existing attempt diagnostics later; no duplicate debug page or new storage system
is introduced. Existing history, retention, pinning and stable links are unchanged.

The correction-label type records attempt/row/region, observation references,
incorrect candidate and explicit owner/admin correction. It does not implement a
new write path or automatic training. Any future dataset needs consented retained
line/crop images, exact transcriptions, original-to-crop transforms, capture/device
provenance and splits by physical document, not by augmented variants. Tesseract
training would additionally need compatible LSTM training tools, line ground truth,
font/language assets and independent validation. First measure segmentation plus
the standard engine; no training is started in Phase 1.
# Phase 5E candidate boundary

The vendor-neutral offline entry is [semantics/index.ts](semantics/index.ts). Earlier layout/payment/identity crop adapters are frozen research compatibility paths, not universal templates for unseen documents. See [the semantic contract](semantics/README.md). Production remains unchanged.
