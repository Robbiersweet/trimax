# Phase 3C-2 — experimental recognizer pilot

**Complete; insufficient for Phase 4. No production integration, push or deployment.**

## Broader harvest

Independent real documents increased from 1 to 8. Eleven payment attachments in
the private storage bucket contain eight document identities, including A/B/C/D,
one exact duplicate and two additional C recaptures. The 33 payment-related audit
records have seven distinct image references, all already in those attachments.
Job-site media has zero records. The earlier OCR-attempt/local-artifact audit adds
only B, not an additional independent document. Sources overlap and must not be summed.

There are 24 visually verified crops: the five frozen B crops and 19 new crops.
Fifteen new originals from five documents train the pilot; two C crops validate;
two older numeric-only invoice references are excluded from this format pilot.
All B captures, derivatives and textures remain excluded from train/validation.

Frozen Phase 1 normalization and Phase 2 layout ran on all seven new documents.
Automatic invoice fields were absent on six documents; D produced five fields
but included a neighboring column fragment. These failures remain in private
evidence. Explicit manual **dataset annotations**, on the normalized images,
provide token crops; they are not detector improvements or end-to-end successes.
Neither Phase 1 nor Phase 2 was changed. The archived B crop geometry was not edited.

Private originals, annotations, labels, hashes, payment/storage provenance and
contact sheets are under `%LOCALAPPDATA%/Trimax/ocr-v2-training/pilot-v1/harvest`.
No customer images, labels or model binaries are committed.

## Corpus and experiment

Production syntax is `INV-` plus a zero-padded number, minimum four digits
(`src/app/api/recurring-invoices/run/route.ts`). Historical remittances also visibly
print `INV####`; training preserves literal transcriptions instead of inventing
hyphens. Synthetic examples contain both renderings, covering 9,000 unique suffixes
from 0000–9999, with B suffixes excluded too.

- 8,000 synthetic train / 1,000 synthetic validation, independent seeds/suffixes.
- Liberation and DejaVu train fonts; FreeFont family reserved for validation.
- Serif/sans/mono, weights, sizes, spacing, horizontal/vertical compression,
  faint ink, blur/defocus/scanner and motion softness, paper tint, gradients,
  wrinkle shadows, JPEG, perspective, skew, dropout and low-resolution resampling.
- Approximately 25% clean examples; synthetic pixels never derive from B.
- 15 real training crops × 40 deterministic versions = 600 records including originals.
- Two unaugmented C validation crops; split by document before augmentation.
- Final training set: 8,600 records. Validation: 1,002 records.

The initial all-hyphen synthetic render was archived unused. The final mixed
printed-format corpus was generated before training, based on A/C/D evidence.
Feature generation uses PSM 7 and recorded PSM 13 fallback for empty line segmentation.

## Isolated Ubuntu environment

WSL 2, Ubuntu 26.04.1 LTS; Python 3.14.4, Tesseract 5.5.0,
Leptonica 1.86.0. `tesseract`, `lstmtraining`, `lstmeval`, `combine_tessdata`,
`combine_lang_model`, `text2image`, and `unicharset_extractor` verified in `/usr/bin`.
Windows production Tesseract was not modified. The rejected Windows installer
was deleted after its verification record was preserved privately.

Installation (inside Ubuntu, root for apt only):

```sh
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y tesseract-ocr libtesseract-dev libleptonica-dev python3 python3-pip python3-venv make build-essential git fonts-dejavu fonts-liberation fonts-freefont-ttf fontconfig pkg-config
python3 -m venv ~/trimax-ocr/venv
~/trimax-ocr/venv/bin/pip install pillow numpy
git clone https://github.com/tesseract-ocr/tesstrain.git ~/trimax-ocr/tesstrain
```

Python dependencies: Pillow 12.3.0, NumPy 2.5.3. Full `dpkg-query -W` and pip
locks are private. Tesstrain commit: `405346a3a67d8e4e049341d1da6a4b752e0b8351`.
The native binaries are invoked directly with explicit lists, following the
[official LSTM training workflow](https://tesseract-ocr.github.io/tessdoc/tess5/TrainingTesseract-5.html).

Base: official `tessdata_best/eng.traineddata` float LSTM, downloaded from
`https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/eng.traineddata`.
SHA-256: `8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba`.
No standard language file is overwritten.

## Training and selection

Model: `trimax_invoice_pilot_v1`. Learning rate 0.0001; fixed checkpoint budgets
1,000 / 3,000 / 6,000. Selection: lowest synthetic validation CER, then highest
exact accuracy, then earlier budget. C validation is reported separately.

| Checkpoint export | Synthetic exact | Synthetic CER | C exact |
|---|---:|---:|---:|
| Generic float base | 90.5% | 2.2249% | 1/2 |
| 1,000 | 98.1% | 0.6928% | 2/2 |
| 3,000 | 98.1% | 0.6395% | 2/2 |
| 6,000, selected | 98.2% | 0.6395% | 2/2 |

Training plus checkpoint evaluation: 207.85 seconds (3m28s), excluding feature
generation and generic baseline. Training-only wall time was not separately
instrumented. Logs retain mean RMS, delta, BCER/BWER and every checkpoint.
Final logged RMS 0.177%, delta 0.083%, training BCER 0.236%; trainer's minimum
training BCER 0.068%. Tesseract internally exports its best stored weights from
each checkpoint, so the export budget is not a claim that the final step was best.

Selected model SHA-256:
`86a52e3e1a119394980bae6f9f5ff216a8805d9fc1d326b740be8c4cf29b86ec`.
Model, logs, manifests and checkpoints live in `~/trimax-ocr/pilot-v1` in WSL;
selected model and reports also have private Windows copies.

## Sealed real holdout

Selection was sealed before reading B for this pilot. Generic and pilot each
received one pass over the five frozen Phase 3B contrast-3 crops, no whitelist,
digit correction, matching or fusion. An atomic marker prevents training after
holdout and prevents silently repeating the comparison.

| Recognizer | Exact canonical tokens | Character accuracy | S / I / D |
|---|---:|---:|---:|
| Generic native float base | 0/5 | 40% | 16 / 4 / 4 |
| Fine-tuned pilot | 0/5 | 52.5% | 9 / 6 / 4 |

The archived JavaScript generic benchmark also had 40% aggregate accuracy, but
its individual raw strings differ. The fresh native comparison is the controlled
base-versus-fine-tuned measurement. Accuracy uses raw uppercased, whitespace-cleaned
text against canonical IDs; no hyphen insertion or glyph repair. Errors include
leading neighboring-column fragments, prefix confusions and incorrect digits,
not just missing separators. Five-line parallel CLI wall time: generic 155 ms,
pilot 120 ms, excluding image preparation. Not a production-pipeline benchmark.

B was fully excluded from this pilot's training and validation. It was already
used for preprocessing studies in Phase 3B, so this is **training-held-out**, not
a newly blind document for the entire project. No tuning followed its result.

## Required alternate recognizer benchmark

Tesseract tuning stopped. A fixed pretrained PP-OCRv5 English mobile recognizer
was benchmarked locally through RapidOCR 3.9.2 / ONNX Runtime 1.30.0, in a separate
`modern-venv`. Recognition only: no detector, orientation, cloud inference or matching.
Same frozen five crops: **0/5 exact, 52.5% character accuracy**, about 40.24 ms
recognition plus 148.76 ms cached model initialization. Initial weight download
is excluded from that cached initialization number.

Model source is the [maintainer's published model registry](https://github.com/RapidAI/RapidOCR/blob/main/python/rapidocr/default_models.yaml).
Weight SHA-256: `c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8`.
The first alternate run failed on a missing visualization `font_path` configuration
after starting the first line; its failure marker is retained. After supplying
that non-recognition configuration, one complete fixed-model benchmark ran.
This exploratory comparison is not presented as a second pristine blind holdout.

## Conclusion and verification

Synthetic validation improved substantially; the real holdout did not reach the
acceptance gate. The trained model is insufficient. The fixed modern recognizer
also failed on these frozen crops. No recognizer is promoted into production.
Next: gather additional independent faint/soft remittances and reserve a new
document-level test set before any further crop or recognizer development.
Investigate neighboring-column contamination and glyph ambiguity using new
development data; do not retune on B and continue calling it untouched.

Existing amounts (4/5 exact) and footer total (exact) remain archived unchanged;
no amount/total OCR or Phase 1–3B engine code changed.
Tests: Phase 1, layout, field recognition, invoice study, dataset integrity,
pilot scoring/seal tests, full npm regression suite, lint, TypeScript and build pass.
Only offline tools/documentation were added. Existing unrelated working-tree
changes remain separate. **Phase 4: no. Push/deployment: none.**
