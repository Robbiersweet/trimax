# Phase 4 — offline visual evidence fusion

`fuseInvoiceObservations` is a pure, inactive function. Nothing in production imports
it. Its only input is row-scoped invoice recognition with optical provenance. It
cannot query invoices, select business records, reconcile money, or apply payments.
Amount and document-total evidence never enter this function.

## Contract

- Preserve every raw observation, duration, crop path/hash, source image hash,
  independent model identity, optional character/sequence scores and visual warnings.
- Uppercase, remove whitespace/wrapper punctuation, standardize the INV separator.
  Letters never become digits. Inserting a separator does not make a token valid.
- Modern candidates require `INV-` and at least four observed numeric suffix digits.
  Numeric-only observations retain a distinct legacy format; no prefix/zero padding
  is supplied. This is recognition of visible syntax, not verification of document era.
- Retain only complete tokens actually observed by SVTRv2, PARSeq or PP-OCRv5.
  Do not synthesize combinatorial strings from position votes. This deliberately
  trades some possible recall for a strong no-invention invariant.
- Candidate references resolve to the full observations carried by the result.
  All observations must belong to the same document, source image, row and base crop.
- Dynamic-programming edit alignment represents substitutions, missing characters
  and inserted characters as explicit position alternatives; gaps are `null`.

## Weights and confidence

Weights are frozen Phase 3E aggregate character accuracies: SVTRv2 0.9875,
PARSeq 0.98125, PP-OCRv5 0.93125. Tesseract has zero voting weight. Each model
family contributes at most once per candidate/position, regardless of repeated
or derived observations. These weights are descriptive retrospective performance,
not fitted likelihoods or independent-error probabilities. They were not optimized
against Fixture B. Shared pretraining and shared pixels make errors correlated.

`supportScore` sums family weights, not a probability. Top-1 is a ranking, not an
acceptance decision. `confidentlySelected` requires both primary and secondary to
agree on the selected complete token, no conflicting variants of either core model,
no optical warning and no observed low-confidence veto. Exact agreement additionally
requires all three trusted model families. Strong agreement allows the supporting
model to differ. One-model output never establishes agreement.

Calibrated confidence is not available in the saved Phase 3E observations; scores are
explicitly null. No positive confidence boost uses uncalibrated logits. Where supplied,
any score below 0.5 vetoes confidence; this conservative warning threshold is not
fitted to the benchmark and must not be mistaken for calibration. Model disagreement,
two families with weak scores, or independently supplied faint/blur/clipping warnings
flag possible shared visual ambiguity. No fixture identity is used as a quality flag.

Unanimous high-scoring errors cannot be discovered from text agreement alone. The
contract preserves that limitation with a null correctness probability and explicit
reason. `supported-agreement` is not certainty and must never authorize payment.

## Evaluation

`scripts/ocr-v2/fusion-benchmark.cjs` consumes native automatic Phase 3E observations.
It writes fusion decisions **before** opening the separate benchmark labels. Results
and labels remain private under `%LOCALAPPDATA%/Trimax/ocr-v2-training/phase4`.
No derived variants were added to improve benchmark results. Existing 3× and contrast
observations remain available as diagnostic evidence, not independent extra votes.

`fusion-regression.cjs` covers disagreement, missing characters, unsafe repair,
legacy syntax, weak shared agreement, repeat-vote inflation, cross-row/document
provenance, monetary scope rejection, immutability and 216 adversarial combinations.

The research contract may feed a separately authorized Phase 5 resolver. Phase 4
does not define payment eligibility or a business-level acceptance threshold.
