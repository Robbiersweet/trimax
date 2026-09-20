# Phase 3D — local PP-OCRv5 domain adaptation

Offline experiment. No production OCR, layout, amount parsing, matching or payment
changes. No Phase 4, push or deployment.

## Frozen data protocol

- Train: A, older checks 2715/2721/2734/2743; 12 automatic invoice crops.
- Validation: D, five automatic crops, plus 300 synthetic lines.
- Reserved: B and C, seven rows. Both were evaluated previously and are not pristine.
  Neither participates in this phase's training, augmentation or checkpoint selection.
- No unused real documents remain in the eight-document corpus. Document separation
  is maintained, but a new independent corpus is needed for an unbiased future gate.
- Layout and original automatic/manual crops are inherited unchanged from the
  generalization study. Manual crops are diagnostic evaluation only.
- Literal printed text is supervised, including unhyphenated `INV####` and two
  historical numeric-only references. No numeric substitution or business lookup.

## Model provenance and environment

Official English PP-OCRv5 mobile training checkpoint:
https://paddle-model-ecology.bj.bcebos.com/paddlex/official_pretrained_model/en_PP-OCRv5_mobile_rec_pretrained.pdparams

SHA-256: `e25c9536f39791dfbd2f005f7e0fbbc2652d35b79bae999740059d93fec8e950`.
Verified identical downloads through Windows and WSL. Source documented in the
[official recognition guide](https://github.com/PaddlePaddle/PaddleOCR/blob/dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf/docs/version3.x/module_usage/text_recognition.en.md).

PaddleOCR training source pinned to commit
`dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf`; config
`configs/rec/PP-OCRv5/multi_language/en_PP-OCRv5_mobile_rec.yaml`.
This uses source modules rather than a separately installed PaddleOCR pipeline.

The official PPLCNetV3 (scale .95), SVTR neck and CTC classifier are preserved.
All CTC-branch tensors must match the checkpoint by name and shape or loading fails.
Only the auxiliary NRTR training branch is omitted. The full pretrained English
dictionary is retained to avoid replacing the classifier with random weights;
supervision uses the invoice-field vocabulary. Training-only SVTR gradient
detachment is disabled so selective/full fine-tuning can reach the backbone;
forward values are unchanged. Batch-normalization running statistics remain frozen.

Environment is isolated under `~/trimax-ocr/paddle-venv` in WSL. Installation:

```sh
python3 -m venv ~/trimax-ocr/setup-venv
~/trimax-ocr/setup-venv/bin/pip install uv
~/trimax-ocr/setup-venv/bin/uv venv --python 3.12 ~/trimax-ocr/paddle-venv
~/trimax-ocr/paddle-venv/bin/python -m ensurepip
~/trimax-ocr/paddle-venv/bin/python -m pip install paddlepaddle-gpu==3.3.0 \
  -i https://www.paddlepaddle.org.cn/packages/stable/cu130/
```

## Prespecified experiments

20,000 synthetic training lines; 12 original real crops plus 1,200 real augmentations.
Real degradations include low contrast, soft edges, tint, shadow, dropout, JPEG,
compression and skew; the synthetic corpus additionally includes perspective,
fonts/spacing and broad unseen numeric suffixes. B/C values are excluded from
synthetic data too. Measured training-image contrast/dimensions are saved privately.

Each arm starts from the official checkpoint, three epochs × 100 batches × 32:

| Arm | Trainable layers | Real fraction | Learning rate |
|---|---|---:|---:|
| head-synthetic-heavy | CTC classifier | 12.5% | 1e-4 |
| head-balanced | CTC classifier | 50% | 1e-4 |
| late-balanced | Classifier, SVTR neck, final backbone block | 50% | 2e-5 |
| full-balanced | Full CTC branch | 50% | 1e-5 |

Selection order: D automatic exact count, then D CER, then combined validation CER.
Reserved B/C predictions are opened only after selection/freeze. CPU/GPU latency
profiling uses D, so reserved inference need not be repeated for benchmarking.

## Baseline discrepancy

The request lists reserved totals as 2/2. The frozen generalization observations
and `summary.json` record **1/2**: C has valid total evidence; B's two total passes
produce malformed text and no strict money candidate. Amount evidence is 17/17
development and 4/7 reserved; development totals 5/6. This phase does not alter or
rerun that pipeline, and must not claim a nonexistent 2/2 baseline.

## Results — completed, acceptance gate failed

Python 3.12.14; PaddlePaddle GPU 3.3.0; CUDA runtime 13.0, driver API 13.1;
NVIDIA GeForce RTX 5060 Laptop GPU, compute capability 12.0. PaddleOCR is the
pinned training-source commit above, not an installed pipeline package. Full
dependency versions and installation logs are retained privately. WSL inference
commands use process-local `LD_LIBRARY_PATH=/usr/lib/wsl/lib OMP_NUM_THREADS=4`;
the Windows production runtime and system environment are not modified.

### Selection and preservation

All four arms reached 5/5 exact real validation and zero combined validation CER.
The unmodified pretrained checkpoint was also exact on all 305 validation lines.
The first full-layer epoch had one validation character error; later epochs tied.
**No strategy demonstrated a validation advantage.** The prespecified strict
improvement rule retained the first checkpoint: `head-synthetic-heavy`, epoch 1,
100 updates, 12.5% real/87.5% synthetic batches, learning rate 1e-4. This is a
conservative tie choice, not evidence that low real weighting is superior.

| Arm | Three-epoch duration | Best real validation | Best combined validation CER |
|---|---:|---:|---:|
| Head, 12.5% real | 40.22 s | 5/5 | 0% |
| Head, 50% real | 40.05 s | 5/5 | 0% |
| Late layers, 50% real | 75.99 s | 5/5 | 0% |
| Full layers, 50% real | 165.49 s | 5/5 | 0% |

Total training/validation suite: **324.73 seconds**, excluding installation and
initial image-cache preparation. Each arm consumed 9,600 sampled presentations;
20,000 is the available synthetic corpus size, not a claim every sample was seen.
Selected epoch consumed 400 real/augmented and 2,800 synthetic presentations.

Pretrained audit: all 884 retained tensors loaded, 84 auxiliary NRTR tensors
omitted. The selected model changes only `head.ctc_head.fc.weight` and `.bias`;
882 tensors remain byte-identical. Selective/full arm gradient audits confirm
that their intended backbone layers received gradients.

Selected checkpoint SHA-256:
`680f25c1baa7b41dd7804be3af2fce10c6a74d6f608a121d5c5de70141f4cf33`.

### Reserved real comparison

All scores use identical frozen source crops and literal printed transcriptions.
Case/whitespace cleanup and formatting-only hyphen insertion never change digits.
Historical baselines retain their documented engine-specific preprocessing.
An additional unmodified Paddle checkpoint was evaluated with the **exact same
preprocessing** as fine-tuning to isolate adaptation from preprocessing differences.

| Engine | Automatic exact | Automatic chars | Manual exact | Manual chars |
|---|---:|---:|---:|---:|
| Generic Tesseract (saved baseline) | 1/7 | 69.39% | 1/7 | 59.18% |
| Fine-tuned Tesseract (saved baseline) | 2/7 | 71.43% | 4/7 | 79.59% |
| PP-OCRv5 / RapidOCR (saved baseline) | 3/7 | 87.76% | 3/7 | 83.67% |
| Custom CRNN (saved baseline) | 3/7 | 83.67% | 3/7 | 83.67% |
| Unmodified Paddle, matched preprocessing | 2/7 | 75.51% | 2/7 | 73.47% |
| **Fine-tuned Paddle** | **2/7** | **75.51%** | **2/7** | **79.59%** |

| Engine | Auto CER; substitutions/insertions/deletions | Manual CER; substitutions/insertions/deletions |
|---|---|---|
| Generic Tesseract | 30.61%; 13/2/0 | 40.82%; 12/1/7 |
| Fine-tuned Tesseract | 28.57%; 11/3/0 | 20.41%; 3/0/7 |
| Generic PP / RapidOCR | 12.24%; 6/0/0 | 16.33%; 8/0/0 |
| Custom CRNN | 16.33%; 4/0/4 | 16.33%; 5/0/3 |
| Generic Paddle, matched | 24.49%; 12/0/0 | 26.53%; 13/0/0 |
| **Fine-tuned Paddle** | **24.49%; 12/0/0** | **20.41%; 10/0/0** |

There is **no automatic-crop exact or aggregate character improvement over the
matched pretrained model**. Manual character accuracy improves, but exact count
does not. Saved RapidOCR remains stronger on this reserved set; differences in
preprocessing/export execution mean its score is not an isolated fine-tuning gain.
Development fine-tuned results are 17/17 exact on automatic and manual crops;
these include training documents and do not establish generalization.

### Fixture B

| Expected canonical | Automatic raw = formatting-only output | Exact | Character accuracy | Manual raw |
|---|---|---|---:|---|
| INV-0513 | INVUSI3 | No | 57.14% | INVUS13 |
| INV-0514 | INVON14 | No | 71.43% | INV0N14 |
| INV-0515 | INVO515 | No | 85.71% | INVO515 |
| INV-0518 | INVOSI8 | No | 57.14% | INVOSI8 |
| INV-0519 | INVOS1S | No | 57.14% | INVOS15 |

B automatic: **0/5 exact, 65.71% character accuracy**; manual: 0/5, 71.43%.
C is 2/2 exact. The denominator uses the seven visibly printed characters,
without penalizing the absent printed hyphen. All five B outputs fail the numeric
suffix syntax check. No O→0, S→5, I→1, candidate substitution, or business matching
was applied. Errors span multiple faint glyphs, not isolated formatting mistakes.

The full English classifier was deliberately preserved rather than randomly
reinitialized with a reduced dictionary; supervision uses invoice characters.
That does not prevent competing alphabetic classes on faint digit positions.
No post-holdout vocabulary mask or replacement was selected to rescue these results.

### Performance

Stored CTC training-branch checkpoint: **22,421,800 bytes** (22.42 MB / 21.38 MiB),
without auxiliary NRTR. This is not a fused/quantized deployment artifact.

| Measurement | GPU | CPU (4 threads) |
|---|---:|---:|
| Model construction + load | 254.66 ms initially; 131.21 ms warm | 158.27 ms |
| First single-crop forward | 36.25 ms | 109.11 ms |
| Warm single-crop median | 12.63 ms | 93.60 ms |
| Warm five-row batch median | 17.59 ms | 485.76 ms |

Ten timed samples after warm-up; validation D crops only. Forward measurements
include host output transfer, exclude file reading/image preprocessing, and do not
represent iPhone or whole-payment-workspace latency. Framework import time is not
included in model load. Historical comparison latencies remain in GENERALIZATION.md;
those used different engines/devices and are not controlled hardware rankings.

### Amounts/totals, artifacts and decision

Amount and total logic/crops were not modified or rerun. Frozen evidence remains:
development amounts **17/17**, reserved **4/7**; totals development **5/6**, reserved
**1/2**. The request's 2/2 total claim is not supported by the retained observations.
These are evidence availability counts, not fused/authoritative payment results.

Private artifacts: `~/trimax-ocr/phase3d` and
`%LOCALAPPDATA%/Trimax/ocr-v2-training/phase3d`, including the selected model,
raw predictions, training history, plan/freeze, tensor/gradient/split audits,
environment versions and logs. Model binaries/customer crops are not committed.

Validation: three decoder/preparation tests passed in the Paddle environment;
strict pretrained loading, frozen tensor preservation, document separation,
gradient flow and checkpoint hash checks passed. TypeScript passed; no application
source changed in this phase. Frozen layout hashes still match the prior study.

**Phase 3D experiment complete; recognition gate FAILED. READY FOR PHASE 4: NO.**
The small, visually easier validation corpus could not rank the strategies, while
B still fails on both automatic and manual crops. More independently verified
faint real development/validation documents are needed before another meaningful
reserved evaluation. Do not keep tuning on B/C and call them pristine.

Production changes: none by this phase. Push/deployment: none. No Phase 4 started.
