# Private dataset and offline benchmark

This directory is offline tooling. No production imports, deployment hooks,
payment writes, training, or OCR algorithm changes. All artifacts belong outside
the repository. The existing Phase 1, Phase 2, Phase 4 fusion, Phase 5 resolver,
Phase 5B extraction and five recognizer adapters are reused unchanged.

## Configuration

Put a JSON configuration in a private directory:

```json
{
  "repository": "C:/work/trimax",
  "privateRoots": ["C:/private/trimax"],
  "researchRoot": "C:/private/trimax/research",
  "snapshotFile": "C:/private/trimax/research/phase5/resolver-evidence.json",
  "seed": "trimax-real-v1",
  "frozenSplits": {"protected-document": "holdout"},
  "wslDistribution": "Ubuntu",
  "python": "/home/research/trimax-ocr/benchmark-venv/bin/python",
  "pathMappings": [
    {"windows": "C:/work/trimax", "wsl": "/mnt/c/work/trimax"},
    {"windows": "C:/private/trimax", "wsl": "/mnt/c/private/trimax"}
  ]
}
```

The installed frozen adapters expect their existing `~/trimax-ocr` model layout.
Missing models fail the batch instead of silently inflating scores by omission.
No model training occurs. Recognition uses offline model loading.

## New documents

```powershell
node scripts/ocr-v2/dataset/cli.cjs discover CONFIG PRIVATE_INBOX PRIVATE_SOURCES_JSON
node scripts/ocr-v2/dataset/cli.cjs ingest CONFIG PRIVATE_SOURCES_JSON PRIVATE_MANIFEST trimax-ocr-real-v2
node scripts/ocr-v2/dataset/cli.cjs validate CONFIG PRIVATE_MANIFEST
```

Discovery is recursive; use an inbox containing retained originals, not model
directories or generated crops. It emits image references, byte hashes and a
perceptual review hint; it never infers truth. Review source provenance and add
verified physical-document/payment identity before ingestion. Perceptual hashes
never merge records automatically. Exact bytes deduplicate; verified identities
group recaptures; otherwise images remain separate draft groups. Unknown groups
must be reviewed before interpreting independent-document counts scientifically.

Use `augmentationOf` to bind augmented records to a source capture. Grouping and
split validation reject cross-document exact duplicates and recapture/augmentation
leakage. `frozenSplits` must include **all prior assigned groups** when extending a
version. A private split-ledger.json additionally rejects reassignment across versions in the same output directory; configure splitLedgerFile to share this ledger across directories. New groups use a deterministic SHA-256 seed assignment across four splits.
Holdouts cannot be trained merely because they have labels; training opt-in is
independent and defaults false. Benchmarking does not grant training consent.

## Verified truth

`import-truth CONFIG OLD_MANIFEST VERIFIED_BUNDLE NEW_MANIFEST NEW_VERSION`
creates a new version, never mutating an existing frozen manifest. Bundles require
`purpose: "verified-dataset-labels"`, `verifiedBy`, `verifiedAt`, `sourceExportHash`
and `documents`. Each document supplies `independentDocumentId`, exact `imageHash`,
`businessTruthVerified: true`, and `truth` containing rows (rowId, invoiceNumber,
invoiceRecordId, unit, integer amountCents), optional authoritativeTotalCents,
checkNumber, checkDate and payor. Import a reviewed read-only transaction export;
do not assume invoice face value equals a partial/deposit payment. Unverified
fields stay null. Geometry requires separately reviewed normalized-image boxes.

Inference exports have an explicit allowlist: IDs, image reference and hash.
The Python recognizer rejects extra fields and rechecks crop hashes. Labels are
used only in post-decision scoring; the resolver receives its separate frozen
invoice snapshot, never the expected answer or a truth-filtered invoice pool.

## Benchmark and regression gate

```powershell
node --experimental-strip-types scripts/ocr-v2/dataset/cli.cjs benchmark CONFIG MANIFEST FRESH_RUN_DIRECTORY
node --experimental-strip-types scripts/ocr-v2/dataset/cli.cjs benchmark CONFIG MANIFEST ANOTHER_FRESH_RUN BASELINE_REPORT_JSON
node scripts/ocr-v2/dataset/cli.cjs compare CONFIG BASELINE_REPORT_JSON CANDIDATE_REPORT_JSON
node scripts/ocr-v2/dataset/regression.cjs
```

Each batch starts from originals, runs normalization/layout, writes row/invoice/
amount/header/footer crops, recognizes payment evidence, runs all five invoice
models, fuses observations, resolves offline, then scores. Header/footer crops
reflect the frozen detector's regions; absent geometry labels are reported as
unscored, not guessed or treated as 100% coverage. Numeric-only printed invoice
tokens remain numeric in optical scoring. No digit or prefix is invented.

Outputs include `inference.json`, `inputs.json`, per-document `pipeline.json`,
`recognition.json`, `unscored-decisions.json`, and `report.json`. Inspect individual
scorecards/raw observations/private crops before the aggregate. A report records
dataset hash, source commit, adapter hash, installed package versions and model
weight hashes. Timing includes batch startup in totalPipelineMs; per-document
processingMs excludes shared model initialization and is **not iPhone latency**.

Gate policy: fail missing documents, token/CER regressions in any model/row,
amount/header/total regressions, newly wrong accepted amounts, wrong automatic
resolution, geometry loss/contamination, and lost full-document success. Dataset
or model changes require explicit reviewed baselines rather than incomparable
scores. Existing failures remain visible; passing this nonregression gate does
not mean the dataset passes production acceptance. Latency is reported but not
hard-gated because shared-machine scheduling is noisy. No deployment integration.

To add a recognizer, implement a label-free adapter, emit raw text and milliseconds,
record its package and weight hashes, add its name to the worker/scorer, and create
a reviewed new baseline. Never pass annotations into an adapter.

## Current frozen version and limitations

`bootstrap CONFIG NEW_MANIFEST` imports the existing private research archive.
It retains eight canonical independent documents, 24 verified rows, six development
documents and two frozen holdouts (B/C). Train and validation are empty: this task
does not reclassify historically exposed examples or train models. B/C have been
examined in earlier phases and are **not newly untouched** test documents.

The corrected current manifest is `manifest-v2.json` (`trimax-ocr-real-v2`); its
`sourceAttachmentId` is distinct from `sourcePaymentId`. Earlier v1 artifacts
remain private development records.

Twenty historically visually verified B attempts are grouped as metadata-only
recaptures. The audit reported 29 retained images at that time; this task does not
claim that their remote pixels are currently available or benchmark all recaptures.
Only one deterministic canonical image per independent document contributes to baseline metrics. Prefer the explicit canonical-research-image tag; otherwise sort by fixture ID. Other captures remain grouped in the manifest. The current batch processes eight canonical local images. No new
independent documents are invented from retries. Two check-date labels and all
payor labels remain unverified; they are not counted as recognition successes.

Current private root: `%LOCALAPPDATA%/Trimax/ocr-v2-training/dataset-v1`.
Original images stay referenced in the private training harvest and
`%LOCALAPPDATA%/Trimax/ocr-v2-private`; they are not copied unnecessarily.
Paths are resolved through symlinks and must stay in configured private roots,
outside the repository and public directories. Credential-bearing metadata is
rejected. Reports/crops/labels must never be staged. Filesystem access control
continues to depend on the operator's private-directory permissions.

## Future intake (disabled)

`core.intake()` prepares an offline payload only. It requires owner/admin role,
verified payment, explicit dataset opt-in, canonical image reference and verified
label provenance. Training opt-in is separate. Its result always carries
`productionEnabled: false`. There is no production caller or permission bypass;
a future authenticated server integration needs separate review/authorization.
