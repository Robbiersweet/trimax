# Phase 4 — evidence fusion and confidence contract

Status: offline implementation complete; baseline recognition preserved and safety gate met on this retrospective corpus. Preferred ≥95% top-1 accuracy was not met. No production connection, Phase 5 implementation, push or deployment.

## Method

Primary SVTRv2, secondary PARSeq, supporting generic PP-OCRv5. Frozen character-accuracy weights: 0.9875 / 0.98125 / 0.93125. No row-specific tuning. Tesseract is diagnostic-only with weight zero. Each model family contributes once; preprocessing variants cannot multiply votes.

Candidates must be complete format-normalized tokens already present in a trusted observation. No character-class repair, invented digits, database lookup or token assembly. Edit alignment preserves all partial/invalid observations and disputed positions. Raw observations remain unchanged. Model scores were not retained by Phase 3E and are explicitly unknown, not reconstructed.

Confidence is a documented agreement heuristic, never a calibrated correctness probability or payment decision. Primary/secondary disagreement, observed low scores or independent visual warnings prevent confident selection. Shared-failure detection is conservative and cannot identify unanimously wrong high-confidence text without additional optical evidence.

## 24 real rows

- Raw SVTRv2: 22/24 exact; 98.75% character accuracy.
- Fusion top-1: 22/24 (91.67%); 98.75% character accuracy.
- Candidate-set recall: 23/24 (95.83%).
- Ambiguous rows requiring review: 3; confidently selected: 21.
- Wrongly confident rows: 0.
- Invented token characters/digits: 0.

The truth appears for all 23 rows where one of these recognizers emitted the correct complete token. This does not prove the remaining image is irrecoverable. Neither zero benchmark overconfidence nor 23/24 recall establishes generalization to new documents. The same eight documents informed prior research and the global weights.

## Fixture B

Positions below are one-based indexes in normalized `INV-####` text, including the separator. Expected values were loaded only after fusion decisions were saved.

| Expected | SVTR raw | PARSeq raw | PP-OCR raw | Fused top | Alternate complete tokens | State | Confidence | Expected location |
|---|---|---|---|---|---|---|---|---|
| INV-0513 | INV0313 | INV0513 | INVUS13 | INV-0313 | INV-0513 | MULTI_GLYPH_AMBIGUITY | ambiguous | alternate |
| INV-0514 | INV0414 | INVON14 | INVO914 | INV-0414 | none | MULTI_GLYPH_AMBIGUITY | ambiguous | absent |
| INV-0515 | INV0515 | INV0515 | INVO515 | INV-0515 | none | STRONG_AGREEMENT | supported-agreement | top |
| INV-0518 | INV0518 | INVO518 | INVOSI8 | INV-0518 | none | MULTI_GLYPH_AMBIGUITY | ambiguous | top |
| INV-0519 | INV0519 | INV0519 | INVOS1S | INV-0519 | none | STRONG_AGREEMENT | supported-agreement | top |

### Aligned disagreements

- INV-0513: position 5: 0 / U; position 6: 3 / 5 / S.
- INV-0514: position 5: 0 / O; position 6: 4 / N / 9.
- INV-0515: position 5: 0 / O.
- INV-0518: position 5: 0 / O; position 6: 5 / S; position 7: 1 / I.
- INV-0519: position 5: 0 / O; position 6: 5 / S; position 8: 9 / S.

B candidate-set coverage: 4/5. B top-1: 3/5. Shared visual ambiguity: B-0, B-1, B-3 (expected 0513, 0514, 0518). These are possible shared-failure flags, not proof that image information is absent. B-0 and B-3 have an isolated primary/secondary disagreement, but the supporting model adds other glyph disagreements, so the overall class is MULTI_GLYPH_AMBIGUITY. B-2 and B-4 are STRONG_AGREEMENT despite weaker PP-OCR disagreements.

The hardest row emits 0414 / ON14 / O914. Its expected 0514 is absent, and no model observed the needed 5 at that position. Phase 4 correctly declines to manufacture it. The other wrong top candidate remains ranked first by the slightly higher primary weight but is explicitly ambiguous, with the true observed PARSeq token retained as an alternate.

## Complementarity

SVTRv2 and PARSeq each get 22/24, with only one common failed row. Their complete-token union covers 23/24. PARSeq supplies the correct alternative for the first B row; SVTRv2 supplies the correct token where PARSeq confuses O/0 in the fourth B row. Generic PP-OCRv5 adds no new correct complete token beyond that union on this corpus; its weaker output is useful as disagreement evidence but is not a reason to run every historical recognizer. Tesseract and TrOCR are not part of fusion.

## Format and monetary authority

Two legacy numeric-only rows remain numeric; no modern prefix or zero-padding is invented. The format label reflects observed syntax, not a business invoice-era decision. No unit, amount, open-invoice list or total was used for candidate selection. Amount/total recognizers and authority rules are unchanged. The invoice fusion contract rejects amount/total/document-scope input.

## Latency

Fusion only, unrelated synthetic observation set: median 0.0190 ms per row; 0.0951 ms per five rows; five-row p95 0.1511 ms.
100 warm-ups and 1,000 batches of five, excluding model inference, file reads and label scoring. Fusion cost is negligible relative to recognizer inference. No deployment architecture was implemented.

## Verification

- Phase 1 foundation/EXIF regression: passed.
- Phase 2 layout regression: passed.
- Phase 3 amount/total optical and ownership regression: passed.
- Phase 3E hashes/metrics: passed; fresh offline rerun of all six recognizers: 576 observations, zero raw-output differences. Recorded in private recognizer-regression/comparison.json.
- Phase 4: 14 suites plus 216 adversarial combinations passed, including alignment, no invented digits, ambiguous/shared failure, repeat votes, legacy syntax, field scope, immutability and provenance.
- Golden A–E business contract: passed.
- Retry/stale-response, duplicate, payment/reconciliation: passed, including npm test / stabilization.
- Lint: passed after adding the standard CommonJS lint annotation to the existing Phase 3E offline crop-preparation script.
- TypeScript and production build: passed. Build/test results include existing unrelated working-tree changes; those changes were neither altered nor included in this commit.

## Recommended Phase 5 plan — not implemented

READY TO PROCEED TO OCR v2 PHASE 5: yes for a separately authorized offline resolver-integration study, not production payments. Preserve the raw observations and candidate sets at the boundary. Treat every ambiguous or incomplete row as unresolved; business records must not manufacture absent visual digits or silently erase disagreement. Keep amount/total provenance, duplicate, eligibility and exact reconciliation guards independently enforced. Require explicit review/correction where visual evidence is insufficient. Validate on fresh real documents before any production acceptance claim.

Phase 4 meets the baseline-preservation / nearly-all candidate coverage / zero confidently wrong benchmark criteria, but misses the preferred ≥95% top-1 target. Further confidence calibration and independent real-document evaluation remain necessary.

Artifacts: private phase4/fusion-evidence.json (written before truth access), fusion-report.json (scored results and full position/provenance details), recognizer-regression/ (fresh offline recheck).

Production changed: no. Push/deployment: none. Phase 5 not begun.
