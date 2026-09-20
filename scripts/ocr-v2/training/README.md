# Phase 3C — private dataset and training preparation

Status: dataset preparation complete for available evidence; native model
training blocked by zero independent real training/validation documents.
Authenticated OCR history and pinned-case inventory completed. No production changes.

## Actual inventory and splits

One independent physical document has retained pixels: B (five verified invoice
rows). Its original SHA-256 is in the private dataset. A duplicate original and
normalized derivative are the same document, not additional training sources.
Four local physical-attempt exports have image metadata but no image bytes.
Local diagnostic/worktree copies of the synthetic faint fixture are not real data.
A/C/D still have structural labels only.

The authenticated history exposed 23 attempts: 20 with physical optical evidence
(29 retained images), one synthetic UI case, and two without optical images.
The pinned filter was empty. Visual review of all physical cases identified the
same B remittance: recaptures and retries are one document group, not independent
training examples. All are excluded from training. Only the five canonical B
crops are scored, avoiding an inflated sample count from repeated captures.
Four downloaded CSV evidence exports add only the same B original/derivative
and metadata already inventoried. Private live-history audit records list each
attempt and available resolutions. Camera distance remains unrecorded.

All five B rows are protected held-out samples. B has already been used to tune
preprocessing; describe it as training-held-out, not a pristine blind test.
Record the attempt ID as unknown when it cannot be established; never invent it.
Camera distance is unknown. Quality notes describe the visible faintness,
softness, uneven lighting and wrinkles, not calibrated measurements.

Generated: 1,000 synthetic train + 200 synthetic validation images, four fonts,
broad independent numeric values, font size/weight/spacing, blur, skew, shadow,
background/ink and JPEG quality. B token strings are excluded from synthetics.
No real augmentations were generated. Synthetic data cannot open the training gate.

Pilot collection target: 30 independent remittances, approximately 150 verified
crops if each contains five rows: 20 train / 5 validation / 5 held-out documents.
From the current one held-out document, this means **29 additional documents,
approximately 145 crops**. This is a practical initial experiment target, not a
statistical guarantee of 90% accuracy. Include templates, fonts and capture quality
variation. Expand beyond this pilot if validation/learning curves have not settled.

## Collection workflow

1. Sign in to existing OCR history; inventory all pages and pinned cases. Export
   originals/evidence through existing authorized tools before retention expires.
   Do not apply payments or change retention policy.
2. Group recaptures, derivatives, retries and screenshots by the original physical
   remittance, not just attempt ID. Exact hashes catch duplicates; manual document
   identity review must catch recaptures with different hashes.
3. Use existing normalization/layout and manually inspect each crop. Record both
   source image hash and document reference. Discard unclear/clipped transcriptions.
4. Verify the label independently from the physical document or verified historical
   truth. Record verifier and verification reference. Never label from OCR output.
5. Assign whole document groups to one split before augmentation. Keep B held out.
6. Pass reviewed records to `intake.import_reviewed`. Required provenance includes
   sampleId, sourceDocumentReference, sourceOriginalHash, sourceFile, sha256, rowId,
   templateId, qualityMetadata, transcription, verifiedLabel, verifiedBy,
   verificationReference, kind=real and split. No storage/API writes occur.
7. Only `augment_training` may create real derivatives; it rejects held-out parents
   and keeps parent IDs. Add derived records to the manifest and revalidate.

## Environment and reproducibility

Use the bundled normal Python 3.12.14 executable, not the Windows Store alias.
A venv was created under `%LOCALAPPDATA%/Trimax/ocr-v2-training/venv`.
Installed there: Pillow 12.1.1 and NumPy 2.4.3 from pip. No global installs.
Tesseract.js/core 7.0.0 are existing dependencies. Native Tesseract, lstmtraining,
combine_tessdata, tesstrain, WSL and Docker are unavailable. OpenCV is unnecessary
for this preparation. The RTX 5060 laptop GPU is present but unused.

The private folder contains environment.json, requirements-lock.txt, inventory,
trimax-invoice-dataset-v1, tesstrain-input-v1, and heldout-report.json. Dataset and
crop SHA-256 hashes are recorded; no customer images are committed.

Run with the private venv:

```
python scripts/ocr-v2/training/dataset.py PRIVATE_FIXTURE_ROOT PRIVATE_DATASET_ROOT
python scripts/ocr-v2/training/test_dataset.py
python scripts/ocr-v2/training/export_training.py PRIVATE_DATASET_ROOT
node scripts/ocr-v2/training/heldout-benchmark.cjs
```

`dataset.py` is a reproducible initial builder; do not rerun it over a dataset with
reviewed intake additions. Preserve that dataset as a new version first.
Export writes separate PNG/.gt.txt train/validation pairs and zero held-out files.
Do not use tesstrain's default random row split: supply document-disjoint lists.

## Planned training, deliberately not run

`config.json` reserves model trimax_invoice / trimax-invoice-v1, float eng base,
validation-only checkpoint selection and bounded stopping. No selected checkpoint,
training curve, trained model or trained-held-out score exists yet.
Before training: install/pin native tools in an isolated environment; pin the
float base and source revision/hash; generate lstmf files from exported pairs;
retain explicit train/eval lists; evaluate every 100 iterations, stop after five
validation plateaus, cap pilot at 2,000 iterations. Save loss, CER and exact token
accuracy at each checkpoint. Evaluate the held-out split once after selection.
Do not overwrite default eng.traineddata.

Official references:
- https://github.com/tesseract-ocr/tesstrain/blob/main/README.md
- https://tesseract-ocr.github.io/tessdoc/Data-Files.html

Native installation and a synthetic-only pilot were deferred because the requested
credible real validation cannot currently be performed. No alternate recognizer
comparison is claimed: fine-tuning has not been attempted and found inadequate.
Once data exists, compare a local line recognizer if trained Tesseract fails.
No hosted OCR, no Phase 4, no push or deployment.
