# OCR preflight preservation and targeted recovery

## Scope and verified defects

Both physical attempts after `5b2d6ed` lost all source evaluations when the
three-variant helper exceeded its shared five-second budget. The helper threw
away already completed siblings. Detailed extraction subsequently ran 38 OCR
passes in the first physical attempt and took 49.817 seconds; API responses took
54.9 and 55.2 seconds. The best individual variant had completed at 7.578 seconds.

Preflight now retains independent completed, no-useful-structure, timed-out and
errored outcomes. Each recognition has a maximum three-second allocation inside
the unchanged five-second candidate ceiling. A timed-out worker is terminated;
remaining siblings can use a replacement worker if budget remains. Unstarted
variants are explicitly identified with zero elapsed time and their reason.
Local gray runs first, followed by local binary and native color; selection
scoring is unchanged. A late failed variant cannot invalidate useful siblings.

## Reuse and recovery

Orientation, preflight, detailed extraction and diagnostic recognition use the
same observation cache. Keys include a random capture/attempt namespace, exact
processed image digest and segmentation mode. Words are mapped into the current
source coordinates after reuse. A retry gets a fresh namespace. Cache entries
are server-produced, expire after two minutes, and are capped at 64 observations.
Reuse across requests is opportunistic on the same server process; a cold or
different instance safely repeats recognition. Different/lossily re-encoded
images are deliberately not assumed equivalent.

After the primary variants, usable geometry selects unresolved invoice/amount
row bands at native resolution, plus missing header/total regions. Each target
gets bounded local-gray/local-binary recognition and can stop when its evidence
is no longer unresolved. Full-document recovery remains for insufficient
structure. Per-pass completion time, optical score, new observed tokens, cache
hits/misses and recovery plan are recorded. Token additions are observations,
not assertions that a new token is correct or payable.

Row crops never enter document header/footer selection. Their end-of-crop amount
is not a document footer. Header/footer crops exclude detected body rows. This
was essential: physical replay exposed an intermediate implementation promoting
a repeated body amount to a total. The final replay and regression reject that
promotion while keeping row observations and the original total-authority rules.

## Persistence

The completed response is checkpointed before reading/merging/uploading large
optical images. A transient core write gets one bounded retry; failures retain
attempt ID, stage, error code and message. A separate failure-marker write and
runtime error remain available if response writes fail. Optional image failure
cannot roll back the already committed response. Existing attempt IDs and
monotonic phase RPC protection prevent late writes replacing a newer attempt or
completed client resolution. Client cancellation does not cancel the independent
checkpoint request. This cannot guarantee database durability during a sustained
database outage; runtime errors explicitly record that condition.

Attempt 2's exact underlying database/transport failure is **not recoverable**
from the old log: it retained only `OCR history checkpoint unavailable:` with no
code/message. The proven software defect is one fallible response-plus-images
write with no response retry and inadequate error reporting. No claim is made
that a particular database error was established retrospectively.

## Measurements

Local Windows Sharp/Tesseract replay, not an iPhone acceptance result:

| Input/run | Preflight | Detailed | Server request | Recovery | Detailed observations |
|---|---:|---:|---:|---:|---:|
| Sanitized fixture, old | 1.516 s | 10.036 s | 10.053 s | 3.328 s | 42 |
| Sanitized fixture, repair with preflight reuse | 1.444 s | 1.423 s | 1.436 s | 0.857 s | 7: 3 reused, 4 new |
| Retained earlier physical canvas, old | 2.447 s | 12.328 s | 12.347 s | 2.961 s | 42 |
| Same physical canvas, final repair | 2.582 s | 2.584 s | 2.600 s | 1.504 s | 9: 3 reused, 6 new |

The sanitized comparison retained five rows and the same authoritative $1,500
total. A final cold-cache regression also retained five rows, taking 2.505 s
detailed / 0.773 s targeted recovery with seven new observations. The physical
replay retained only three incomplete rows and an UNKNOWN total in both versions;
no payable result was introduced. Its best individual evidence was available at
0.970 s into the repaired detailed request. It is an earlier retained physical
image, not a new scan or a replay claimed to be either of the two latest attempts.

Orientation rules and four-angle comparison remain unchanged. The two latest
physical orientation totals were 26.781/28.752 s; those are historical measurements,
not a promised post-repair latency. Physical acceptance must measure the full
capture/orientation/preflight/extraction path again.

Run `node scripts/ocr-latency-benchmark.cjs [optional-local-image]` for the actual
historical/current route comparison. Private physical images are not committed.

## Validation and limits

Golden A–E, optical/faint and orientation regressions, capture geometry/readiness,
retry/stale response, duplicate, payment/reconciliation, the full test suite,
lint, TypeScript and isolated production build are release gates. New checks
cover partial timeout survival, worker termination/replacement, exact observation
reuse, retry isolation, unresolved-row targeting, body-amount exclusion from
header authority, insufficient-structure fallback, client disconnection and
checkpoint retry/identity protection.

Two old standalone tests also failed on untouched `5b2d6ed`. Their expectations
were updated to the existing per-candidate multipart requests and fingerprint-only
candidate discovery contract. No duplicate or payment implementation changed.

No matching, invoice eligibility, unit corroboration, reconciliation, duplicate,
payment, camera geometry or capture threshold implementation changed. Automated
success does not establish physical OCR success: one physical iPhone acceptance
test must still prove latency, recognition, authoritative total, invoice resolution
and exact reconciliation.
