# Faint remittance optical repair — 2026-09-19

## Proven failure and scope

The retained physical iPhone canvas was upright, complete, and human-readable
at 2918 × 1213. Its grayscale/normalized pixels still contained faint strokes.
Tesseract's intermediate binary image removed those strokes, leaving white
paper and no recognized text. Native-resolution color also returned empty text.
Thus the first demonstrated destructive step was internal OCR binarization;
resize was a contributor, not a sufficient explanation. The failing orientation
probe did not call Sharp's explicit `threshold()` operation. A separate inversion
defect was not established. We do not claim a recorded numeric internal threshold.

Removing slow background shading before binarization recovered ink. An exploratory
native text crop also recovered partial text, but cut out header/footer evidence;
its coordinates are not used by production.

The private original and reconstructed intermediate images stay outside Git.
The committed sanitized fixture uses blank paper texture and entirely fictional
print; see `scripts/fixtures/faint-remittance.md`.

## Actual physical-image comparison

Counts use the existing `opticalScore` strict token definitions, not corrected or
matched invoice identities. Money/date/header counts indicate observations, not
verified values. These measurements are actual Tesseract output.

| Variant | Pixels | Meaningful words | Invoice tokens | Money | Dates | Headers | Confidence | Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Full native color | 2918×1213 | 0 | 0 | 0 | 0 | 0 | 0 | -300 |
| Full grayscale | 2918×1213 | 0 | 0 | 0 | 0 | 0 | 0 | -300 |
| Full local histogram contrast | 2918×1213 | 0 | 0 | 0 | 0 | 0 | 0 | -300 |
| Full shading-corrected grayscale | 2918×1213 | 83 | 0 | 3 | 2 | 3 | 47 | 10294.7 |
| Above plus light sharpening | 2918×1213 | 92 | 0 | 2 | 2 | 3 | 43 | 10339.3 |
| Full local binary | 2918×1213 | 84 | 1 | 5 | 0 | 3 | 39 | 10408.9 |
| Exploratory native text crop | 2550×470 | 46 | 0 | 2 | 0 | 3 | 53 | 10203.3 |
| Production broad region, native color | 2790×1125 | 0 | 0 | 0 | 0 | 0 | 0 | -300 |
| Production broad region, local gray | 2790×1125 | 81 | 0 | 3 | 2 | 3 | 49 | 10294.9 |
| Production broad region, local binary | 2790×1125 | 84 | 1 | 5 | 0 | 3 | 39 | 10408.9 |

The production physical-canvas region is (119,22,2790,1125), scale 1, estimated
component height 22 pixels. The binary option wins the existing preflight optical
score; gray has higher average confidence. Neither is forced for every document.
Detailed physical replay returns **three rows and no authoritative total** and
remains unresolved. Improved ink preservation is not complete physical acceptance.

## Implementation

- Find the largest broad bright-paper component on a small detection image; then
  process its native pixels. A component envelope plus margins retains text bands
  at the top and bottom. If component evidence is insufficient, retain the broad
  paper region. The complete source remains the audit image.
- Compare exactly three primary inputs: native color, local gray, and local binary.
  Gray subtracts a Gaussian background estimate (sigma 18) with gain 9; the binary
  alternative uses local darkness difference greater than 4. Native color remains
  a candidate. No customer identifiers or fixed document coordinates participate.
- Recognition crops do not infer invoices. Word boxes are translated back into
  document coordinates and passed to the unchanged physical-row model.
- Main faint recognition does not resize. Browser normalization now caps the long
  edge at 4600 rather than 3200, preserving the actual 4032-pixel still. Legacy
  detailed recovery variants retain their existing 2400/3600 targets. Provenance
  records input/output dimensions, crop offsets, estimated character scale, and
  resize factor. No orientation thumbnail becomes the detailed OCR input.
- Orientation uses native local-gray pixels at four angles, confident horizontal
  words, uniqueness, and line evidence. It requires a decisive winner and complete
  comparison, not invoice recognition. The physical canvas selects 0°; the EXIF-6
  normalized still selects 270° and returns the full upright 4032×3024 image.
- Preflight variants share a five-second recognition deadline. Detailed recognition
  retains the existing route budget; a timed-out worker is not reused. Blank or
  noncredible optical evidence remains unresolved.
- Failed-attempt evidence can retain up to six prioritized images within the
  existing 11-million-base64-character budget: chosen input, original, normalized
  sources, final input, and unresolved orientation input. Chosen local binary is
  itself the binary preview. Images remain separate from ordinary diagnostics.
  The existing success exclusion, 30-day expiry, pinning, and cleanup remain intact.

## Regression evidence

The sanitized 2918×1213 fixture reproduces empty old-probe OCR and zero black ink
in an invoice-column binary patch. The repaired patch retains strokes. Its broad
native region is 2421×804. Local gray: 33 meaningful words, five invoice-like
tokens, four money values, four dates, four headers, confidence 72. Local binary:
35 meaningful words, five exact fictional invoice IDs, seven money values, five
dates, five headers, confidence 79, score 11236.9. The bottom total is recovered.
The actual production preflight selects it and detailed OCR constructs five rows.

Tests exercise actual Sharp/Tesseract, coordinate offsets, four rotations, EXIF,
ordinary prose orientation without invoice structure, blank rejection, variant
timeout, optical checkpoint preservation, and no duplicate diagnostic image bytes.

Golden A–E, capture/orientation, OCR, retry, duplicate, payment/reconciliation,
full `npm test`, lint, TypeScript, release coverage gate, and the isolated webpack
production build passed. Production deployment has its own normal Vercel build gate.

No matching, reconciliation, duplicate, payment, Queue, corrections, splits, tax,
or live camera detector/guide logic changed. Live detector instability remains a
separate unresolved issue. One new physical OCR test is still required after deployment.
