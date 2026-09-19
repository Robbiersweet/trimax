# Faint physical-image optical fixture

`faint-remittance.png` is a sanitized derivative of the retained physical iPhone
remittance investigated on 2026-09-19. It exercises real Sharp pixels and English
Tesseract recognition, including the production preflight and detailed route.

Only a visually inspected blank lower-paper rectangle (2500 × 300 pixels) was
copied from the physical image. It was reduced to 64 × 24, blurred, and enlarged
to preserve broad uneven paper illumination while discarding fine detail. The
desk border is synthetic. Every printed character is newly rendered fictional
text: Example Place / Example Apartments, INV-9001 through INV-9005, and amounts
100.00 through 500.00. The total is 1,500.00. No original printed text, EXIF,
customer identity, bank details, production invoice number, or original image
is included. This is a controlled regression for the demonstrated faint-ink
failure mechanism, not a claim to reproduce every optical imperfection exactly.

The 2918 × 1213 layout retains a header, five spatially separated rows, a bottom
total, broad blank paper, and a dark surround. Faint gray print is lightly blurred.
The former 1500-edge grayscale/normalize probe returns empty OCR; native color
also fails. Local shading subtraction recovers structure; the binary alternative
recovers all five invoice identifiers and the bottom total.

Run `node --experimental-strip-types scripts/ocr-faint-regression.cjs`.
The test invokes actual OCR, tests all four rotations and fail-closed blank
handling, maps real recognized word boxes back to original coordinates, and
exercises production preflight plus the existing physical-row reconstruction.
Expected strings are assertions only; nothing injects text into recognition.

The private original and diagnostic intermediates remain outside the repository.
