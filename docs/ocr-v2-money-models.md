# Phase 6 mature monetary evidence

The isolated shadow worker reuses its existing SVTRv2, PARSeq and PP-OCRv5 instances for native money crops, after the unchanged invoice crops. Model weights, invoice decoding/fusion, layout, total authority, identity/date acceptance and payment resolution are unchanged. There is no new training or payment authority.

## Decision contract

All three mature recognizers must report on the same hash-bound physical field. Two distinct models must agree on complete numeric digits. A conflicting repeated observation from one model, an incomplete model set or a provenance mismatch cannot authorize an amount. Formatting normalization cannot substitute letters or invent cents. Whitespace-separated complete amounts cannot be concatenated. Confidence remains explicitly uncalibrated; agreement is not presented as a calibrated probability.

Tesseract observations remain in the append-only ledger. Mature model observations add model/version provenance, raw text, normalized candidate, crop/source hashes, region, timing and an explicit uncalibrated-confidence note. Mature total readings are diagnostic only: the existing independently validated total authority remains authoritative.

## Frozen private evaluation

Eight historical documents contain 24 row crops and eight total crops. Six documents (17 rows) form development; B/C (seven rows) form held-out evaluation. B/C were exposed in earlier research and are not new physical acceptance documents. The latest native capture is a separate evaluation recapture of B, not a ninth independent document. No labels enter the inference subprocess.

The three-model decision was frozen before held-out/native mature inference. A subsequent adversarial test exposed concatenation of two whitespace-separated amounts; a safety-only rejection was recorded separately, without changing any corpus decision or the model/vote selection.

Results: development 17/17 exact accepted rows; held-out 7/7; native 4/5 (previously 2/5). Zero wrong accepted amounts. Native row 1 retains letter-like cents and remains Unknown. Native total authority is unchanged. This is a partial shadow improvement, not full physical acceptance or production payment promotion.

## Reproduction

All private data and outputs stay outside Git. Scripts take explicit private paths:

1. `money-benchmark-prepare.cjs <research-root> <fresh-output> <development|heldout|native>` exports hash-bound crops and writes labels separately.
2. `money-model-benchmark.py <fresh-output>` runs frozen local model adapters without labels.
3. `money-benchmark-score.cjs <output>` scores after inference. Raw recognition accuracy and Tesseract confidence-gated acceptance are separate fields.
4. `mature-money-regression.cjs` checks format/vote/provenance safety. Optional private benchmark root verifies frozen results; optional retained fixture executes the actual combined WSL model batch and unchanged resolver, checking invoice equivalence and independent total authority.

Model initialization is shared with invoice recognition, never repeated per crop. The local combined test added 319 ms of mature monetary inference across five rows and the total, within a 27.65-second complete worker pipeline. This is worker processing time, not an iPhone capture-to-result measurement.

Validation: OCR phases 1–6, dataset regression gate, eight-document semantic replay, retained combined worker test, lint, TypeScript and build passed. The full npm suite passes with read-only CRLF-to-LF normalization for source-text assertions. The raw Windows checkout triggers existing line-ending-sensitive assertions in tenant isolation, business read isolation and queue polish; their production code was not changed.
