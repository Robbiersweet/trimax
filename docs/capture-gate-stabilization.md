# Live capture guidance stabilization

## Proven defect and evidence limits

The previous `analyzeLiveCameraFrame` counted bright, low-chroma pixels inside the
guide, then called that fraction document coverage. It did not detect document
bounds. White background and printing/exposure therefore changed distance guidance
without changing document size. The shutter was advisory (disabled only while
capturing), not hard-blocked by `cameraQualityReady`.

The previous release also reset optical evidence and source selections inside the
450 ms analyzer. These resets now occur once when capture starts; live analysis
pauses during capture. No orientation algorithm or OCR decision was changed.

The reported iPhone session has no retained frame measurements. These findings
prove defects in the implementation, not the exact exposure or dimensions of
that unrecorded session. Physical iPhone acceptance remains required.

## Before: exact evaluation order

All live statistics used a canvas of the mapped guide's video pixels, max edge
260. Bright pixels: `(luminance > 145 && chroma < 72) || luminance > 198`.

| Order | Value / threshold | Message |
|---|---|---|
| Initialization, missing video, mode change | No measurement | Move closer (full check mode: Capture stub separately) |
| 1 | Full check/stub native guide short edge <980 px | Capture stub separately |
| 2 | Remittance guide short edge <900 AND bright fraction below minimum | Move closer (redundant with next rule) |
| 3 | Bright fraction <.58 horizontal remittance, .64 vertical, .46 full check/stub, .50 check only | Move closer |
| 4 | Bright fraction >.94 | Move farther away - show the full remittance |
| 5 | Mean luminance <72 | More light |
| 6 | Contrast standard deviation <20 OR mean Laplacian magnitude <7.5 | Hold steady |
| 7 | Two successful samples, every 450 ms | Ready |

The numeric lower/upper bounds did not overlap. Rejections changed immediately;
only Ready required two samples. There was no document-containment check here.
`guidanceForDocumentType` separately said “Fill the wide frame with the remittance
rows.” It did not measure width or rows. Guide-to-video mapping is recomputed each
sample (not cached zoom/dimensions). Still EXIF normalization runs after shutter.

The **post-capture** quality report is separate and unchanged: area <.22 and long
edge <1800 => “Move closer - document is too distant.”; incomplete area <.72,
not readable at long edge >=1800 / short edge >=650, and long edge <1500 or short
edge <520 => “Use a higher-resolution photo.”; blur <8, brightness <70, contrast
<22 produce their existing retake/light/background warnings. These are decoded
crop-image measurements, not live-video guidance.

## After: one model, unchanged guide geometry

`captureReadiness.ts` owns the decision. Sample the entire visible video at max
edge 384 so paper edges outside the guide can be observed. Largest bounded,
connected bright region overlapping the guide supplies document bounds; a
frame-filling white surface is not a detected document. This is a lightweight
paper detector, not semantic row detection. All bounds map back to **native live
video pixels**, using the existing object-fit/guide mapping unchanged.

Decision precedence: detected bounds -> oversize -> containment -> scale ->
full-check resolution -> existing light/contrast/blur thresholds -> stability ->
Ready. Oversize precedes containment because translation cannot fix a document
larger than the guide. All other outside-guide documents receive Reposition.

- Scale = max(document width / guide width, document height / guide height), so
  long remittance aspect ratios do not need to fill both axes.
- Initial minimum .70; Ready exits below .67; Move closer exits at .73.
- Move farther enters above 1.04; exits at 1.00. Containment tolerance 1.5% per
  axis covers downsample quantization, not permission to crop whole rows.
- Three consecutive samples confirm guidance; unsettled samples say Hold steady.
- Ready additionally requires two bounded-motion comparisons, <=3% of guide per
  axis. Any rejected sample removes Ready immediately.
- Video/guide geometry changes reset stability. 90/270-degree still orientation
  cannot enter this model. Swapping video/document/guide axes preserves ratios.
- Full-check 980 px short-edge guard and quality thresholds are preserved.
- No manual-shutter override or post-capture OCR acceptance behavior changed.

## Bounded diagnostics

Keep the last 12 frame decisions in memory (roughly 5.4 seconds), including
document/guide bounds, dimensions, width/height ratios, bright fraction, scale,
containment, stability, video orientation, message and exact reason. Attach this
snapshot to existing capture preparation diagnostics. On abandonment after six
samples with a rejected final frame, save at most one `camera-framing` failed
attempt through the existing history/outbox/retention system. No frame images,
per-frame database writes, new tables, or storage policies are introduced.

## Reproduction and acceptance

`scripts/capture-readiness-regression.ts` renders real raster remittance-like
frames and runs the production measurement/model: small .357/.313 -> closer;
large 1.214/1.313 -> farther; contained .857/.813 -> Ready; same size offset ->
Reposition. White background coverage >.94 no longer means “too large”.
Tests cover jitter, live dimension changes, rotated coordinate axes and bad image
quality. Existing guide mapping and all optical/business regressions remain gates.

These are controlled pixel simulations, not evidence from a physical iPhone.
One new phone capture should reach Ready with visible paper edges on a darker
background. No payment should be submitted during acceptance.
