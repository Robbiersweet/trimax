# Phase 3B — isolated invoice study

These scripts use saved Phase 2 geometry and the hash-verified full-resolution
physical B image. No production module, Phase 1/2 geometry, Phase 3 field logic,
or payment behavior changes. No push, deployment or Phase 4 is authorized.

## Bounded design

- Ten preprocessing configurations cover native, gray, local contrast, mild
  sharpening, and 1x/2x/3x/4x interpolation.
- Separate fixed-factor studies compare cubic/linear/Lanczos, PSM 7/8/11/13,
  unrestricted versus invoice whitelist, and current/+2%/+4% horizontal padding.
- Vertical +4% is clamped to existing row ownership: it cannot add pixels when
  the crop already occupies the full row. No row or column is redetected.
- The later factor studies use a fixed contrast-3 reference, not a runtime
  label-selected input. Labels are read only after every observation completes.
- Total: 115 whole-token observations. This is an offline study, not a proposed
  production pass count. Saturation fraction records clipping/noise tradeoffs;
  images permit visual review. No binary image is supplied to OCR.

Original and processed crops, exact bounds, preprocessing/OCR duration, mode,
scale, interpolation, whitelist, raw text, normalized text and transformations
are retained outside the repository. Scores select one global configuration
across all five rows, not a different truth-selected winner per row. These are
in-sample exploratory scores, not independent generalization metrics.

The projection experiment compares two weak-stroke thresholds. In physical B,
component counts/boundaries are unstable, so character OCR is rejected before
running. Prefix/suffix splitting likewise requires stable components and a clear
interior gap. No fixed prefix width or digit count is supplied to segmentation.

## Formatting and safety

Uppercasing, removing whitespace, standardizing hyphens, and trimming punctuation
are recorded. Alphabetic leading noise is never silently removed. O/0, I/1, S/5
and other glyphs are never substituted. An observed `INV` plus four or more
observed digits can produce a separately marked separator-format candidate.
It is not literal recognition and is scored separately. The recurring invoice
route generates `INV-${String(nextNumber).padStart(4, "0")}`: four is a minimum,
not a guarantee that every external invoice has that syntax. No missing prefix
or digit is invented. No database is accessed.

## Commands

```
node scripts/ocr-v2/invoice-study-regression.cjs
node scripts/ocr-v2/invoice-benchmark.cjs PRIVATE_MANIFEST.json
node scripts/ocr-v2/invoice-visuals.cjs PRIVATE_ROOT/phase3b-B
```

## Conclusion / stop

Current English Tesseract fails the 4/5 exact and 90% character gate. Soft/faint
physical glyphs plus model recognition remain limiting; interpolation/padding
alone do not repair them. These experiments cannot separate irrecoverable image
information loss from model shortcomings. Character segmentation is unstable.

Recommended next step: collect diverse independently transcribed invoice-token
line images and reserve a held-out set, then evaluate Tesseract LSTM fine-tuning.
Do not train on five B rows and claim generalization. Tesseract documents line
image/ground-truth training and fine-tuning at:
https://tesseract-ocr.github.io/tessdoc/tess5/TrainingTesseract-5.html
No training or alternate recognizer implementation begins here.
