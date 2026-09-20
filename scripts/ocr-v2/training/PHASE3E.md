# Phase 3E — frozen real-document recognizer benchmark

Completed locally on 2026-09-20. Eight documents, 24 invoice rows, eight document groups. No new training, production changes, push, deployment or Phase 4 implementation.

## Protocol and limits

Every row is scored once per fixed model/crop/preprocessing condition: 24 automatic + 24 manual, native + one established local-contrast variant = 96 observations per model. All six adapters receive identical hashed input files; truth is loaded only by the scorer. Native automatic results are the primary comparison. No per-row best-of-model or best-of-preprocessing selection.

This is fixed pretrained leave-one-document-out evaluation, not eight newly trained models. No held-out document enters new training because there is no new training. The corpus and enhancement were used in earlier research, so these are retrospective results, not a new independent acceptance set. The fine-tuned Tesseract is a historical comparison only: five documents trained it and C validated it; its 24-row score cannot represent unseen generalization.

Literal ground truth contains 22 INV tokens without printed hyphens and two legacy numeric-only references. Raw exact and whitespace/case normalized exact agree for native automatic results. Canonical normalization inserts only the structural hyphen after INV before digits; it never replaces characters or supplies missing digits. Character accuracy = 1 − CER; CER = (substitutions + insertions + deletions) / truth characters.

Earlier 7-row baseline scores used global autocontrast, 2× resize and padding. This experiment uses native crops as primary, plus the established OCR-v2 local-background contrast enhancement. Those historical numbers are not the same preprocessing condition; no output was chosen to reproduce them.

## Automatic native crops

| Model | Exact | Character accuracy | CER | S / I / D |
|---|---:|---:|---:|---:|
| generic | 5/24 (20.83%) | 71.88% | 28.12% | 36 / 9 / 0 |
| pilot (historically trained) | 18/24 (75.00%) | 93.12% | 6.88% | 11 / 0 / 0 |
| ppocr | 19/24 (79.17%) | 93.12% | 6.88% | 11 / 0 / 0 |
| svtr | 22/24 (91.67%) | 98.75% | 1.25% | 2 / 0 / 0 |
| parseq | 22/24 (91.67%) | 98.12% | 1.88% | 3 / 0 / 0 |
| trocr | 12/24 (50.00%) | 91.88% | 8.12% | 13 / 0 / 0 |

**Best pretrained: SVTRv2.** PARSeq ties exact accuracy; SVTRv2 has fewer character errors. Both pass the requested approximate aggregate 90% exact / 95% character research gate. This does not establish production safety.

## Crop and preprocessing comparison

| Model | Auto native | Auto enhanced | Manual native | Manual enhanced |
|---|---:|---:|---:|---:|
| generic | 5/24 | 7/24 | 5/24 | 6/24 |
| pilot | 18/24 | 19/24 | 19/24 | 19/24 |
| ppocr | 19/24 | 19/24 | 18/24 | 19/24 |
| svtr | 22/24 | 22/24 | 21/24 | 22/24 |
| parseq | 22/24 | 22/24 | 22/24 | 22/24 |
| trocr | 12/24 | 6/24 | 9/24 | 6/24 |

Manual crops do not rescue the leading models. Enhancement does not improve their exact accuracy and harms TrOCR. No crop clipping was observed in the inherited crop audit or difficult-row montage.

## All condition metrics

| Model / condition | Exact | Character accuracy | CER | S / I / D |
|---|---:|---:|---:|---:|
| generic / auto-native | 5/24 | 71.88% | 28.12% | 36 / 9 / 0 |
| generic / auto-native-constrained | 3/24 | 13.19% | 86.81% | 0 / 0 / 158 |
| generic / auto-enhanced | 7/24 | 81.25% | 18.75% | 25 / 5 / 0 |
| generic / auto-enhanced-constrained | 5/24 | 21.98% | 78.02% | 0 / 0 / 142 |
| generic / manual-native | 5/24 | 76.88% | 23.12% | 35 / 2 / 0 |
| generic / manual-native-constrained | 3/24 | 13.19% | 86.81% | 0 / 0 / 158 |
| generic / manual-enhanced | 6/24 | 78.75% | 21.25% | 28 / 6 / 0 |
| generic / manual-enhanced-constrained | 4/24 | 17.58% | 82.42% | 0 / 0 / 150 |
| pilot / auto-native | 18/24 | 93.12% | 6.88% | 11 / 0 / 0 |
| pilot / auto-native-constrained | 17/24 | 78.02% | 21.98% | 2 / 0 / 38 |
| pilot / auto-enhanced | 19/24 | 93.75% | 6.25% | 8 / 2 / 0 |
| pilot / auto-enhanced-constrained | 17/24 | 78.02% | 21.98% | 1 / 1 / 38 |
| pilot / manual-native | 19/24 | 95.62% | 4.38% | 6 / 1 / 0 |
| pilot / manual-native-constrained | 17/24 | 85.71% | 14.29% | 4 / 0 / 22 |
| pilot / manual-enhanced | 19/24 | 94.38% | 5.62% | 9 / 0 / 0 |
| pilot / manual-enhanced-constrained | 17/24 | 78.57% | 21.43% | 1 / 0 / 38 |
| ppocr / auto-native | 19/24 | 93.12% | 6.88% | 11 / 0 / 0 |
| ppocr / auto-native-constrained | 17/24 | 74.73% | 25.27% | 0 / 0 / 46 |
| ppocr / auto-enhanced | 19/24 | 93.75% | 6.25% | 9 / 0 / 1 |
| ppocr / auto-enhanced-constrained | 17/24 | 74.73% | 25.27% | 0 / 0 / 46 |
| ppocr / manual-native | 18/24 | 94.38% | 5.62% | 9 / 0 / 0 |
| ppocr / manual-native-constrained | 16/24 | 74.18% | 25.82% | 1 / 0 / 46 |
| ppocr / manual-enhanced | 19/24 | 95.00% | 5.00% | 8 / 0 / 0 |
| ppocr / manual-enhanced-constrained | 17/24 | 74.73% | 25.27% | 0 / 0 / 46 |
| svtr / auto-native | 22/24 | 98.75% | 1.25% | 2 / 0 / 0 |
| svtr / auto-native-constrained | 20/24 | 95.60% | 4.40% | 2 / 0 / 6 |
| svtr / auto-enhanced | 22/24 | 98.75% | 1.25% | 2 / 0 / 0 |
| svtr / auto-enhanced-constrained | 20/24 | 95.60% | 4.40% | 2 / 0 / 6 |
| svtr / manual-native | 21/24 | 98.12% | 1.88% | 3 / 0 / 0 |
| svtr / manual-native-constrained | 19/24 | 91.21% | 8.79% | 2 / 0 / 14 |
| svtr / manual-enhanced | 22/24 | 98.75% | 1.25% | 2 / 0 / 0 |
| svtr / manual-enhanced-constrained | 20/24 | 95.60% | 4.40% | 2 / 0 / 6 |
| parseq / auto-native | 22/24 | 98.12% | 1.88% | 3 / 0 / 0 |
| parseq / auto-native-constrained | 21/24 | 96.15% | 3.85% | 1 / 0 / 6 |
| parseq / auto-enhanced | 22/24 | 97.50% | 2.50% | 4 / 0 / 0 |
| parseq / auto-enhanced-constrained | 21/24 | 96.15% | 3.85% | 1 / 0 / 6 |
| parseq / manual-native | 22/24 | 98.12% | 1.88% | 3 / 0 / 0 |
| parseq / manual-native-constrained | 21/24 | 96.15% | 3.85% | 1 / 0 / 6 |
| parseq / manual-enhanced | 22/24 | 96.25% | 3.75% | 6 / 0 / 0 |
| parseq / manual-enhanced-constrained | 21/24 | 96.15% | 3.85% | 1 / 0 / 6 |
| trocr / auto-native | 12/24 | 91.88% | 8.12% | 13 / 0 / 0 |
| trocr / auto-native-constrained | 10/24 | 43.96% | 56.04% | 0 / 0 / 102 |
| trocr / auto-enhanced | 6/24 | 86.88% | 13.12% | 21 / 0 / 0 |
| trocr / auto-enhanced-constrained | 4/24 | 17.58% | 82.42% | 0 / 0 / 150 |
| trocr / manual-native | 9/24 | 88.12% | 11.88% | 19 / 0 / 0 |
| trocr / manual-native-constrained | 7/24 | 30.77% | 69.23% | 0 / 0 / 126 |
| trocr / manual-enhanced | 6/24 | 85.00% | 15.00% | 24 / 0 / 0 |
| trocr / manual-enhanced-constrained | 4/24 | 17.58% | 82.42% | 0 / 0 / 150 |

## Format-only constrained decoding

Only PARSeq uses an actual position-logit constrained decoder. It requires an already observed INV prefix and at least four observed suffix positions; numeric positions can select a digit from their existing logits. Length and observed numeric characters are preserved. No business candidates, expected digits, missing-prefix repair or missing-digit generation. Other adapters report **grammar validation only**, not a constrained recognizer. Rejected outputs count as abstentions (empty predictions), so their constrained CER includes deletion penalties. The two numeric-only references are unsupported by this grammar and remain rejected; they are never padded or assigned an invented prefix.

PARSeq native automatic: 21/22 modern tokens correct after the format-only decoder, with both legacy rows rejected (21/24 overall). Raw modern tokens: 20/22. One O→0 correction helps, but another faint row becomes a structurally valid wrong number. SVTRv2 already emits two wrong numeric digits, which syntax cannot repair. Do not use grammar validity as proof of correctness.

## Eight document folds (native automatic)

| Document | Rows | generic | pilot* | PP-OCRv5 | SVTRv2 | PARSeq | TrOCR |
|---|---:|---:|---:|---:|---:|---:|---:|
| A | 5 | 0/5; 62.86% | 5/5; 100.00% | 5/5; 100.00% | 5/5; 100.00% | 5/5; 100.00% | 4/5; 97.14% |
| B | 5 | 0/5; 54.29% | 0/5; 71.43% | 0/5; 68.57% | 3/5; 94.29% | 3/5; 91.43% | 0/5; 82.86% |
| C | 2 | 1/2; 78.57% | 2/2; 100.00% | 2/2; 100.00% | 2/2; 100.00% | 2/2; 100.00% | 2/2; 100.00% |
| D | 5 | 1/5; 85.71% | 5/5; 100.00% | 5/5; 100.00% | 5/5; 100.00% | 5/5; 100.00% | 3/5; 94.29% |
| check2715 | 2 | 2/2; 100.00% | 1/2; 83.33% | 2/2; 100.00% | 2/2; 100.00% | 2/2; 100.00% | 2/2; 100.00% |
| check2721 | 2 | 1/2; 78.57% | 2/2; 100.00% | 2/2; 100.00% | 2/2; 100.00% | 2/2; 100.00% | 1/2; 92.86% |
| check2734 | 2 | 0/2; 78.57% | 2/2; 100.00% | 2/2; 100.00% | 2/2; 100.00% | 2/2; 100.00% | 0/2; 85.71% |
| check2743 | 1 | 0/1; 71.43% | 1/1; 100.00% | 1/1; 100.00% | 1/1; 100.00% | 1/1; 100.00% | 0/1; 85.71% |

Cells: exact rows; character accuracy. *Pilot folds include historical training exposure. Full per-fold metrics for all four conditions are in private report.json.

## Error localization and optical information

Every incorrect token across all conditions has an alignment and error categories in private report.json. Categories distinguish prefix corruption, leading garbage, digit substitutions/deletions/insertions, and multiple-digit corruption. No evidence supports declaring cropped-off or irretrievably missing glyphs. No printed hyphens exist in this corpus, so hyphen deletion is **not measurable**, not a demonstrated zero failure rate.

All leading-model primary failures are in B. SVTRv2 substitutes 5→3 in B-0 and 5→4 in B-1. PARSeq substitutes 0→O and 5→N in B-1 and 0→O in B-3. B-1 is the strongest common optical difficulty: all four mature models misread the same 5. The montage shows faint, blurred, mottled strokes. That supports an image-quality contribution, but does not prove information is unrecoverable. Several other shared model failures are recovered by another model.

All B rows meet the requested possible-information-limitation flag (two mature models fail at least one same glyph). This flag is diagnostic, not a finding that every B row is unreadable.

3× Lanczos is a separate post-hoc diagnostic, excluded from primary selection. No super-resolution or generated characters were used. Results on B:

| Model | Native exact / 5 | 3× upscale exact / 5 | Enhanced exact / 5 |
|---|---:|---:|---:|
| ppocr | 0 | 1 | 0 |
| svtr | 3 | 3 | 3 |
| parseq | 3 | 4 | 3 |
| trocr | 0 | 0 | 0 |

## Confusions (all models, native automatic only)

| Expected → observed | Count |
|---|---:|
| 0→O | 32 |
| 5→S | 14 |
| ∅→O | 7 |
| 0→U | 5 |
| 0→S | 3 |
| 0→G | 2 |
| 1→I | 2 |
| 9→S | 2 |
| 5→9 | 2 |
| 5→3 | 2 |
| ∅→S | 1 |
| ∅→G | 1 |
| 0→A | 1 |
| 5→L | 1 |
| 8→A | 1 |
| 1→3 | 1 |
| 5→2 | 1 |
| 3→1 | 1 |
| 5→U | 1 |
| 5→0 | 1 |
| 9→5 | 1 |
| 2→4 | 1 |
| 5→4 | 1 |
| 5→N | 1 |

The requested 0/O/U, 1/I/L, 2/Z, 3/S, 4/A, 5/S, 6/G, 7/T, 8/B, 9/R subgroup matrices are included in report.json. Unseen combinations have count zero; numeric-to-numeric confusions remain in the full matrix.

## Runtime practicality

Measured on local WSL/Ubuntu, RTX 5060 Laptop GPU (8 GB); four CPU threads for Torch/ONNX, one for Tesseract. Recognition-only timings include model preprocessing and decoding, not camera/layout/network. Five-row timing is five sequential calls on an unrelated synthetic token, not a measured complete payment workflow. One warm-up, five measured samples; GPU synchronized. GPU is unavailable for native Tesseract; PP-OCRv5 was measured with the established CPU-only ONNX runtime, so its GPU latency is unmeasured. Diagnostic runs supply cached-weight fresh-process initialization (downloads excluded) and sequential isolated latency samples for the four mature models. Tesseract initializes in each subprocess, included in per-crop time rather than the trivial Python adapter initialization.

| Model | Weight MiB | Init seconds | CPU ms/crop | GPU ms/crop | Five CPU / GPU ms |
|---|---:|---:|---:|---:|---:|
| generic | 3.92 | per subprocess | 64.42 | N/A | 325.97 / N/A |
| pilot | 14.69 | per subprocess | 96.68 | N/A | 488.86 / N/A |
| ppocr | 7.51 | 0.655 | 11.52 | N/A | 57.98 / N/A |
| svtr | 118.19 | 2.636 | 55.20 | 15.89 | 281.77 / 79.02 |
| parseq | 90.97 | 4.239 | 33.02 | 22.71 | 167.49 / 129.04 |
| trocr | 234.45 | 3.285 | 131.13 | 45.95 | 653.63 / 221.69 |

SVTRv2, PARSeq and TrOCR need Python + PyTorch; PARSeq also uses timm/Lightning and TrOCR Transformers. PP-OCRv5 uses RapidOCR + ONNX Runtime. Tesseract uses native Tesseract/Leptonica. All inference is local; pretrained assets were downloaded once from the maintainers. HF offline mode was verified for diagnostic execution.

Recommended deployment if later approved: a persistent private inference service, with Vercel handling authenticated orchestration. CPU service is already plausible at these line-crop times; a GPU is not necessary merely to achieve sub-second five-line recognition. Tesseract/PP-ONNX could potentially fit a carefully packaged CPU function; Torch models require explicit packaging and cold-start testing. No claim that Vercel cannot host them: current documented Python bundles allow 500 MB and eligible large functions up to 5 GB beta, with 2–4 GB memory. These limits make the current CUDA development environment unsuitable as-is. A private service is the simpler predictable option, not an architecture implemented here. [Vercel limits](https://vercel.com/docs/functions/limitations).

## Model provenance

- [SVTRv2 official source](https://github.com/Topdu/OpenOCR); weights https://github.com/Topdu/OpenOCR/releases/download/develop0.0.1/openocr_svtrv2_ch.pth
- [PARSeq official source](https://github.com/baudm/parseq); weights https://github.com/baudm/parseq/releases/download/v1.0.0/parseq-bb5792a6.pt
- [Microsoft TrOCR small printed](https://huggingface.co/microsoft/trocr-small-printed), snapshot 04e994ab854b0089d4929f48c2b4dbe2ce78a340.
- PP-OCRv5: same English mobile ONNX model as the preceding generic baseline.

| Model | SHA-256 |
|---|---|
| svtr | `3be361b72dc52e8d4f5569ae822d263b4e70671486bbaa45605711d17b8aec27` |
| parseq | `bb5792a68e367476abca029cbf8699abc805f3d3dc7e57aae45c8ec4f7b7cd00` |
| ppocr | `c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8` |
| pilot | `86a52e3e1a119394980bae6f9f5ff216a8805d9fc1d326b740be8c4cf29b86ec` |
| generic | `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2` |
| trocr | `49350a39968df83e5a1adc90fc0ede02ff247671aed70b842af350fd4a7103f3` |

Source commits: {"parseq": "1902db043c029a7e03a3818c616c06600af574be", "OpenOCR": "0d522801ec6dc1df852c6b6d4ed6a08f5127ed97"}

Runtime packages: {"torch": "2.14.0+cu130", "torchvision": "0.29.0+cu130", "transformers": "4.57.6", "timm": "1.0.29", "pytorch-lightning": "2.6.6", "rapidocr": "3.9.2", "onnxruntime": "1.30.0", "pillow": "12.3.0", "numpy": "2.5.2"}

## Reproduction and validation

Run phase3e_prepare.cjs with the frozen generalization-v1 corpus and a new private output directory. Run phase3e_benchmark.py once per model (CUDA for svtr/parseq/trocr). Run phase3e_report.py, then the four mature models with --diagnostic, then phase3e_validate.py and phase3e_markdown.py. Scripts accept paths explicitly; no corpus/model files are committed.

Validation passed: 96 immutable input hashes and matching prediction provenance; six complete 96-observation matrices; eight disjoint document groups; no duplicate input observations; suffix-length preservation; unsupported/missing content abstention; controlled character-class ambiguity; edit-distance substitution/insertion/deletion checks. Adapter input manifests contain no labels. Node syntax and Python compilation passed. No production build was needed because only offline research scripts/report changed. SVTR checkpoint loading reported only missing BatchNorm num_batches_tracked counters, irrelevant in eval mode; no learned parameter omissions. Its generic loader logs “finetune from checkpoint” when loading pretrained weights, but no optimizer, backward pass or training ran.

Private artifacts: %LOCALAPPDATA%/Trimax/ocr-v2-training/phase3e (inputs/truth/protocol, six raw result files, four diagnostic files, full metrics/error/confusion report, difficult-crop montage and weight hashes). Installation logs and cloned model source: ~/trimax-ocr/phase3e; isolated Python: ~/trimax-ocr/benchmark-venv.

## Decision

Recommend pretrained SVTRv2 as the lead invoice architecture, retaining PARSeq as a research comparator. Do not fine-tune on these same eight documents yet. Collect a fresh diverse real-document acceptance set, particularly faint print; lock the selected model first. Aggregate 22/24 is encouraging but the sample is small, prior research exposed the documents, and B is only 3/5 for SVTRv2.

READY FOR OCR v2 PHASE 4: **yes for a separately authorized offline research phase**, based on the specified aggregate gate; **not production/payment readiness**. Any future fusion must retain uncertainty and abstain on valid-looking wrong numbers. Phase 4 was not begun.

Amounts and totals preserved: no files in those paths changed. Prior aggregate recognition findings are inherited, not rerun or improved by this invoice-only experiment. Production changed: no. Push/deployment: none.
