# Camera release and high-resolution preflight

## Scope

Physical attempt c44d4cd7-7ee6-4710-9362-70a14374b92a retained three
`No preflight variant completed` failures. Its per-variant errors were lost in
the browser failure mapping, so the historical timeout/error breakdown cannot
be reconstructed. Do not claim that all nine variants actually ran or timed out.

The previous helper terminated any recognition exceeding three seconds even
when candidate budget remained, then spent time restarting a worker. Three
candidate requests also competed concurrently. The repair removes that
three-second subdivision while retaining the five-second recognition budget,
serializes candidate requests, preserves successful siblings, and persists
started/finished timestamps, duration, exact error and explicit not-started
outcomes. A regression demonstrates a 3.1-second useful observation survives.
Worker startup and preprocessing remain outside that recognition budget; five
seconds is not a promise for the whole request.

The camera is released synchronously after the still Blob resolves, with the
fallback canvas File already secured. No metadata read, orientation request,
preflight or detailed processing precedes release. Failure/unavailable-camera
paths release before fallback processing. Processing UI remains locked while
the hardware is released. Diagnostics record stream request/start, fallback
acquisition, still request/acquisition, stop and elapsed post-still milliseconds.
Physical OS privacy-indicator timing still needs acceptance verification.

Source selection prefers completed usable still evidence, ranking full/cropped
stills with the existing completeness ordering. Canvas is used if neither still
is usable. Optical credibility criteria and all invoice, total-authority,
reconciliation, duplicate and payment rules are unchanged.

## Cold observation-cache validation

`node scripts/ocr-cold-pipeline-regression.cjs [image]` executes production
orientation, three sequential source preflights and detailed extraction. Every
request gets a fresh module graph and observation namespace: detailed cache hits
must be zero. This is a local server-pipeline test, not camera acquisition,
network, Safari rendering, or a replay of the browser document detector. The
test crop uses a documented two-percent inset; the canvas candidate is derived.

An earlier retained physical 4032x3024 still (not the unavailable original from
c44d4cd7) completed all candidate preflights. Local gray and binary supplied
usable evidence for full still, inset crop and derived canvas. Native color
completed with no useful structure. The cropped still reached detailed OCR.

Measured local physical-image run: orientation 4.603 s; preflights 13.271 s;
detailed extraction 14.477 s; summed server calls 32.397 s; full harness 33.508 s.
Detailed extraction had zero reused observations. Three incomplete rows were
recovered; authoritative total remained UNKNOWN, safely non-payable. This is a
remaining recognition failure, not a source-selection success claim for iPhone.

The sanitized faint fixture recovered five rows and its $1,500 total with zero
detailed cache hits. Camera lifecycle, partial failures, source preservation,
orientation, golden A–E, retry/stale-response, duplicate and payment regressions,
lint, TypeScript and a clean release build are required release checks.
