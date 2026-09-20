# OCR v2 generalization experiment

**Phase 4 blocked. Production unchanged. No push or deployment.**

## Corpus and split

Eight independent documents, 24 physical invoice rows. Six development documents
(A, D and four older checks), 17 rows. B (five faint rows) and C (two stronger rows)
were reserved before development. B/C pixels were not inspected or evaluated in
this phase until the layout and model were frozen. **They are not globally unseen:**
both have historical exposure; C was validation for the previous Tesseract pilot.
The baseline pilot therefore has a historical advantage on C and some development
documents. New CRNN real training uses 12 rows from five development documents;
D's five rows validate. Two training references are legacy numeric-only print.

Private images, provenance, manual annotations, dimensions, document/row/invoice/
amount/footer geometry, labels, quality notes and all observations are under:
`%LOCALAPPDATA%/Trimax/ocr-v2-training/generalization-v1`.
`ground-truth.json` is evaluation-only; inference does not read it.
Manual bounds are approximate (+/-3 pixels on a 1500px preview). Full row envelopes
may overlap on skewed pages; individual invoice crops do not include adjacent rows.
These documents share a header-aligned remittance family, with a whole-check-plus-
stub variant. Eight documents do not establish broad unseen-template coverage.

## Layout diagnosis and results

| Prior document | Proven old output / contributing geometry |
|---|---|
| A | Five rows, no invoice fields; heading/whitespace pairing fails on faint account/invoice boundary |
| C | No supported repeated body; short two-row table rejected |
| Older 2715 | No body; whole check/header content confuses repeated-band selection |
| Older 2721 | No body despite readable print; two-row band selection insufficient |
| Older 2734 | No body; paper/background not isolated, skew merges global projection bands |
| Older 2743 | No body; single row cannot satisfy old repeated-row assumption; skew/background |
| D (additional) | Five fields, neighboring account-column fragment in padded invoice crop |

The new **inactive experimental entry point** `structuralLayout` uses connected
components, slope-corrected line clustering and geometric header alignment.
It reads no invoice labels, document IDs, customer identity or business candidates.
It supports one row when a header/body/footer structure corroborates it. Invoice
fields stop at component gaps and avoid the prior broad account-column padding.
The existing `detectLayout` default and production route remain unchanged.

| Metric | Development | Reserved B/C |
|---|---:|---:|
| Correct document row counts | 6/6 | 2/2 |
| Complete invoice tokens, visual review | 17/17 | 7/7 |
| Neighboring invoice row/column contamination | 0 observed | 0 observed |
| Mean row-envelope intersection-over-union | 89.02% | 92.88% |
| Rows with >=95% envelope IoU | 5/17 | 1/7 |

**The preferred 95% row-overlap gate was not met.** Token completeness is visual,
not an independently pixel-labeled glyph metric. Training below remains an
experiment; it is not proof of end-to-end release readiness.

## In-house recognizer

- Four convolution layers (32/64/128/128 channels), bidirectional 128-unit LSTM,
  CTC head; 508,559 parameters; grayscale 192x32 line canvas.
- WSL Ubuntu, Python 3.14.4, PyTorch 2.14.0+cu130, NVIDIA GPU. No hosted OCR.
- 20,000 synthetic training samples; 1,000 synthetic validation samples.
- 12 real training originals + 1,188 augmentations; five unaugmented D validation
  crops. Total training 21,200; validation 1,005.
- Broad 4/5-digit numeric space, serif/sans/mono fonts, faint toner, dropout,
  compression, spacing, skew/perspective, shadow/tint, blur, JPEG/resolution loss.
  B/C numeric strings were additionally excluded from synthetic generation.
- 25 epochs, 103.93 seconds training; checkpoint 22 selected only by validation CER.
- Model SHA-256: `3dd9860294d23203aa178822865645b1999e8f785a29639c628c25e50e38e244`.
- Training/weights/package manifest stay private in `~/trimax-ocr/generalization-v1`.

The decoder preserves raw CTC output. Its formal `INV-` + at least four digits
grammar **rejects only**; it never supplies a missing digit or consults invoices.
These remittances print `INV####` without a hyphen. Scores below measure literal
printed text; formatting-only canonical exact scores are also retained and happen
to match. Strict grammar output is null for these unhyphenated observations; raw
accuracy must not be confused with accepted business identifiers.

## Fair crop comparison

Each engine receives the same automatic/manual source crops. Tesseract/PP use
fixed autocontrast, 2x resize and padding; CRNN uses its fixed line tensor transform.
No truth-based result selection. CER is edit distance / literal truth characters.
Previous B percentages used different crops and canonical strings, so they are
historical context, not directly comparable with this table.

| Engine | Dev auto exact / chars | Dev manual exact / chars | B+C auto exact / chars | B+C manual exact / chars |
|---|---|---|---|---|
| Generic Tesseract | 4/17 / 80.18% | 5/17 / 83.78% | 1/7 / 69.39% | 1/7 / 59.18% |
| Fine-tuned pilot | 16/17 / 99.10% | 16/17 / 99.10% | 2/7 / 71.43% | 4/7 / 79.59% |
| PP-OCRv5 | 17/17 / 100% | 17/17 / 100% | 3/7 / 87.76% | 3/7 / 83.67% |
| New CRNN | 16/17 / 99.10% | 17/17 / 100% | 3/7 / 83.67% | 3/7 / 83.67% |

| Engine / split / crop | CER | Insertions / deletions / substitutions | Summed inference/preparation ms |
|---|---:|---|---:|
| Generic / dev / auto | 19.82% | 7 / 0 / 15 | 1293.4 |
| Generic / dev / manual | 16.22% | 2 / 0 / 16 | 1351.8 |
| Pilot / dev / auto | 0.90% | 0 / 0 / 1 | 1854.0 |
| Pilot / dev / manual | 0.90% | 0 / 0 / 1 | 1887.5 |
| PP / dev / auto | 0% | 0 / 0 / 0 | 359.2 |
| PP / dev / manual | 0% | 0 / 0 / 0 | 388.0 |
| CRNN / dev / auto | 0.90% | 1 / 0 / 0 | 69.0 |
| CRNN / dev / manual | 0% | 0 / 0 / 0 | 351.1 |
| Generic / reserved / auto | 30.61% | 2 / 0 / 13 | 545.6 |
| Generic / reserved / manual | 40.82% | 1 / 7 / 12 | 578.0 |
| Pilot / reserved / auto | 28.57% | 3 / 0 / 11 | 818.1 |
| Pilot / reserved / manual | 20.41% | 0 / 7 / 3 | 879.0 |
| PP / reserved / auto | 12.24% | 0 / 0 / 6 | 153.0 |
| PP / reserved / manual | 16.33% | 0 / 0 / 8 | 161.6 |
| CRNN / reserved / auto | 16.33% | 0 / 4 / 4 | 29.9 |
| CRNN / reserved / manual | 16.33% | 0 / 3 / 5 | 559.0 |

Manual samples run first, so CRNN manual latency includes first GPU inference
warm-up. These are not balanced cold-latency engine rankings. Model initialization
is separately retained in each private benchmark report.

The frozen B/C layout, CRNN, pilot and PP were evaluated once. Generic Tesseract's
comparison aborted when concurrent benchmark processes wrote the same prepared
filename; it was rerun with engine-specific temporary filenames. No image
processing, model, decoder or layout decision was changed after freeze. This
engineering retry is disclosed rather than calling every execution strictly once.

### Fixture B raw CRNN outputs

| Expected canonical identifier | Automatic crop | Manual crop |
|---|---|---|
| INV-0513 | INV013 | INV0613 |
| INV-0514 | INV14 | INV64 |
| INV-0515 | INV0515 | INV0515 |
| INV-0518 | INV018 | INV0618 |
| INV-0519 | INV6665 | INV669 |

B is 1/5 exact on either crop set; C is 2/2. Automatic crops visibly include the
tokens, and tight manual crops still fail: the remaining B failure is recognition
of faint/blurred digits, not solely adjacent-column contamination. The limited
training corpus does not demonstrate adequate generalization to this degradation.
Do not repair these predictions from invoice candidates. No post-holdout tuning.

## Amount/total safety and complete staged benchmark

Existing Phase 3 recognizer/strict money parser unchanged. The figures below show
exact evidence present in at least one of its two fixed variants, **not** a fused
choice or authoritative payable total. Native-only results remain in summary.json.

| Document | Rows | Exact invoice | Exact amount evidence | Total evidence | Phase1 s | Layout ms | Invoice ms | Amount/total ms | Combined stages s |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|
| A | 5 | 5 | 5 | Present, conflicting alternative | 3.003 | 74.7 | 22.2 | 585.6 | 3.745 |
| D | 5 | 5 | 5 | Present | 3.675 | 94.3 | 20.0 | 677.7 | 4.535 |
| Older 2721 | 2 | 2 | 2 | Present | 5.915 | 116.5 | 7.9 | 436.2 | 6.505 |
| Older 2734 | 2 | 2 | 2 | Present | 10.000 | 241.9 | 8.0 | 809.7 | 11.178 |
| Older 2743 | 1 | 1 | 1 | Present | 8.800 | 271.9 | 4.3 | 655.1 | 9.769 |
| Older 2715 | 2 | 1 | 2 | Missing | 11.293 | 280.2 | 6.7 | 959.1 | 12.672 |
| B | 5 | 1 | 2 | Missing | 4.593 | 93.1 | 22.5 | 554.6 | 5.335 |
| C | 2 | 2 | 2 | Present | 2.496 | 76.8 | 7.4 | 300.8 | 2.895 |

Development: native amounts 16/17; evidence ceiling 17/17; total evidence 5/6.
Reserved: native amounts 3/7; evidence ceiling 4/7; total evidence 1/2.
All documents: evidence ceiling 21/24 amounts, 6/8 totals. **B regresses from the
previous 4/5 amounts plus readable total to 2/5 and no valid total.** Tighter generic
field geometry is not an acceptable Phase 3 replacement. No business fusion was used.

Normalization was rerun from each original. Combined times add independently
measured invoice inference to the measured normalization/layout/field process.
They are complete *staged offline* totals, not a single-process cold-start or iPhone
UX measurement; model initialization and first GPU warm-up are separate. Phase 1
dominates elapsed time. No production latency claim is made.

## Private collection workflow

`verified_collection.py` consumes a verified-payment export with canonical image
reference/hash, reviewer/proof reference, independently verified labels/amounts,
and row geometry. It automatically content-addresses/copies originals, creates
row crops and records provenance/template metadata. Duplicate intake is idempotent;
conflicting verification and invalid bounds fail closed. Training inclusion starts
as **unassigned** and cannot be inferred from payment completion.

This is an operator-run private intake workflow; the user does not organize crop
files. It is **not connected to production payment events**. A verified export
adapter is still needed for unattended live collection; production isolation is
preserved. Example: `python verified_collection.py verified-export.json PRIVATE_ROOT`.

## Environment/reproduction

Installed only in WSL:

```sh
python3 -m venv ~/trimax-ocr/crnn-venv
~/trimax-ocr/crnn-venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cu130
~/trimax-ocr/crnn-venv/bin/pip install pillow numpy
~/trimax-ocr/crnn-venv/bin/pip freeze > ~/trimax-ocr/generalization-v1/packages.txt
```

Versions: PyTorch 2.14.0+cu130, Pillow 12.3.0, NumPy 2.5.3; Tesseract 5.5.0;
RapidOCR 3.9.2/ONNXRuntime 1.30 in the separate existing modern-venv.
Use `sequence_model.py generate ... --real PRIVATE_DEVELOPMENT_ROOT`, then
`sequence_model.py train ... --epochs 25`. Do not re-evaluate B/C and relabel them
untouched; future tuning requires new independent final documents.

## Validation and decision

- Existing Phase 1, Phase 2, Phase 3 and Phase 3B regressions passed.
- New CRNN shape, reject-only decoder and private verified-intake tests passed.
- Lint, TypeScript and production build passed.
- Real experimental gates **failed**: row-envelope overlap, B recognition and
  amount/total preservation. Synthetic/regression passes do not override them.

**READY FOR PHASE 4: NO.** Production OCR, BatchInvoicePayments, matching,
reconciliation and payment safety were not changed by this task. Pre-existing
unrelated working-tree edits remain untouched. No push or deployment.
