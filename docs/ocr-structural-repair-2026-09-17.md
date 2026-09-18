# Structural OCR repair audit — 2026-09-17

## Evidence and limits

Effective access: danger-full-access. Git staging succeeded in C:/Users/robbi/trimax.
The supplied physical-test summary reports canvas selected, better still quality, a source-selection failure, empty header candidates, and a displayed 2227 total. It does not contain the HTTP response, exception, or individual candidate evaluation payloads. The exact historical exception and candidate outcomes cannot be reconstructed from those summary lines. No physical capture was performed during this repair.

## Verified code paths

- All three candidates previously shared one browser HTTP request. A request/response failure discarded comparison and chose canvas. Server candidate errors were already individually caught, but candidates shared a worker, so the existing code did not prove that every individual candidate error aborted comparison. The new browser sends independent requests, retains successful evaluations, and records candidate-specific preparation, HTTP status, response parsing, and OCR stage errors. Server workers are isolated per candidate. Ranking prefers candidates containing both explicit total and invoice rows, then OCR usefulness; still capture has no unconditional preference.
- Source evaluation and production could re-detect/crop the already prepared image. Remittance OCR now preserves the selected frame. The camera guide, mapping, capture dimensions, and layout are unchanged.
- Cross-pass row tolerances used a 26/28-pixel floor and 1.4/1.5 times row height. Close physical rows therefore overlapped. Evidence now passes exclusive neighboring-midpoint boundaries and a 0.65-row-height cap. Row reconstruction tolerance is also reduced. Diagnostics expose pass, token center, row center, distance, acceptance and reason.
- Invoice-column OCR previously ran after structured row evidence was assembled. It now feeds geometry-bound row evidence before handoff. Invoice-shaped OCR substitutions and column-scoped bare tokens normalize generically, and equivalent normalized candidates retain the strongest provenance. Exact literal row tokens precede alternate fuzzy candidates. Duplicate-row checks use resolved row identities rather than counting discarded OCR alternatives; duplicate resolved invoices remain blocked.
- Empty header evidence fell through to general body-total inference. The UI also had an invoice-balance sum fallback. Those paths could explain a fabricated total, but the exact arithmetic producing 2227 is not provable without the original raw OCR payload. OCR now passes authoritative unknown/nonpayable total evidence and blank check number when header selection fails. Resolved rows remain reviewable; payment stays blocked.
- Amount candidates with bounding boxes inside a complete standard monetary token are penalized as fragments. Same-pass adjacent monetary pieces can reconstruct a standard comma/decimal amount. Invoice balances are not substituted by this repair.

## Validation

New executable structural tests exercise the real source-selection browser function and real server row-building functions with synthetic inputs: one failed candidate with preserved canvas/full-still results, better still selection, exclusive five-row geometry, strongest equivalent normalization, malformed-token rejection, missing header/body fragments, 29 versus 1099 geometry, split monetary tokens, exact row versus alternate noise, and five resolved invoices totaling 5495. Fixture identifiers/amounts occur only in tests.

Existing OCR fixture, matching, camera geometry, duplicate, retry, payment application/reconciliation, and full application regressions are required alongside lint, TypeScript, and production build. Physical iPhone validation remains necessary to establish the selected production source and actual OCR results after deployment. No payment, invoice, or remittance data was modified by this audit.
