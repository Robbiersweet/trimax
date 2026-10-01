## 1. Production baseline

**Evidence labels used throughout:**

- **Live verified:** observed during this read-only audit.
- **Source verified:** present in the inspected deployed-source revision; not necessarily exercised physically.
- **Historical evidence:** retained results or earlier verification, not a new acceptance test.
- **Unknown/unverified:** not established by available evidence.

No code, schema, flags, credentials, or worker processes were changed. No OCR jobs, payments, commits, pushes, or deployments were initiated.

| Item | Verified state |
|---|---|
| Production URL | [app.rnlcreations.com](https://app.rnlcreations.com) |
| Production commit | `b5d0d51ab35a915292e54355d5c582a22876be11` |
| Remote `main` | Same SHA |
| Vercel deployment | `A6ZKcvjyxFE8483eBofsK9srxhHq` — Ready |
| Deployment timestamp | September 30, 2026, 20:16:41 UTC |
| Deployment hostname | `trimax-a3skz12jo-trimax-s-projects.vercel.app` |
| Supabase project | `gqknefosisnsjuzmhvts` — Trimax, main/production |
| Workspace examined | R&L Creations, `f31adfa1-26ad-4e74-ad94-a4668d7ad57d` |
| Public HTTP health | HTTP 200 during this audit |
| Migration ledger | `supabase_migrations.schema_migrations` does not exist |
| Service worker | Served SHA-256: `dba6df014e916ca5ec28619d4cfe89f400c3b6a0f3bc37966bf8bf1c4874c21e` |

**PRODUCTION = MAIN: YES — for the Vercel web deployment.**

**The distributed system does not have one verified common revision.**

| Checkout | Revision/state |
|---|---|
| `C:\Users\robbi\trimax` | `686c8a0`; multiple modified and untracked files |
| `C:\Users\robbi\.codex\worktrees\native-capture-lifecycle\trimax` | Deployed `b5d0d51`; untracked `eng.traineddata` |
| `C:\Users\robbi\.codex\worktrees\ocr-v2-shadow\trimax` | Worker checkout `b927b09`; modified `package.json`, `semanticMoney.ts`, and untracked monetary-ownership experiment |

The main checkout contains changes to authentication, capture, navigation, OCR, and other files. These are **not evidence of deployed changes**.

Current database objects were inspected, but complete migration-file equivalence cannot be certified without a migration ledger. Exact hashes of modules already loaded inside running workers are unverified.

## 2. Auth/login

### Verified source flow

```text
PWA start URL
→ RootLayout
→ AuthGuard
→ Supabase browser session
→ custom session-security checks
→ workspace memberships
→ role/property authorization
→ authenticated route or redirect
```

Primary files:

- `src/app/layout.tsx`
- `src/app/components/AuthGuard.tsx`
- `src/app/login/page.tsx`
- `src/app/lib/supabase.ts`
- `src/app/lib/supabaseServer.ts`
- `src/app/lib/sessionSecurity.ts`
- `src/app/lib/workspaceAccess.ts`
- `src/app/lib/propertyAccess.ts`
- `src/app/lib/rolePermissions.ts`
- `src/app/lib/maintenanceMode.ts`
- `Navigation.tsx`, `LogoutButton.tsx`, `LockSessionButton.tsx`
- Forgot-password, reset-password, and request-access pages
- `src/app/lib/ocrDebugServer.ts`

Root `proxy.ts` supplies pathname information for print routes. It is not an authentication gate. `src/proxy.ts` has an empty matcher.

### Redirects and session handling

| Condition | Behavior |
|---|---|
| No session on protected route | `router.push("/login")` |
| Invalid custom session state | Supabase sign-out, then `router.replace("/login?security=…")` |
| Successful login | `window.location.replace` to workspace home |
| Authenticated visit to login/request/forgot-password | Redirect to workspace home |
| Missing or unauthorized business parameter | Replace with default workspace route |
| Field-worker role | Route to technician workspace |
| Invalid property selection | Replace with first permitted property |
| Invite/recovery parameters | Route to reset-password flow |
| Logout/lock | Sign-out plus router navigation/refresh |
| Missing server session on OCR debug route | Redirect to login |

Custom session limits are **45 minutes idle** and **12 hours absolute**.

The active-browser marker lives in `sessionStorage`; activity/start timestamps live in `localStorage`. Focus and visibility changes recheck the session. Mouse, keyboard, scroll, click, and touch events update activity.

No application-level `onAuthStateChange` or explicit `refreshSession` call was found in the inspected source. Supabase SDK session behavior remains part of the authentication architecture.

### Verified authorization edge cases

- Workspace lookup can link a pending membership’s `user_id`.
- Workspace lookup errors can return an empty membership list.
- Client-side empty-list handling permits access, and the guard’s role fallback is `owner`.
- Several role checks run only when memberships are present.

These are **client-side fail-open branches**. They do not establish database access: RLS and server authorization remain separate gates.

### Current login defect evidence

**No current login loop was reproduced during this audit.**

Cross-tab session markers, shared sign-out state, asynchronous guard checks, and service-worker reloads are relevant code paths. Their involvement in any specific reported login failure is **unverified**.

## 3. PWA/service worker

| Area | Verified implementation |
|---|---|
| Registration | `components/PwaRegistration.tsx` |
| Worker | `public/sw.js` |
| Manifest | `src/app/manifest.ts` |
| Start URL | `/?business=rnl-creations` |
| Display/orientation | Standalone; portrait-primary |
| Installation | `skipWaiting()` |
| Activation | `clients.claim()` |
| Update checks | Registration update on load and visibility/focus |
| Waiting worker | Activation message supported |
| Controller change | Reload once per mounted registration component |
| Push handling | Push notification and notification-click handlers |

**There is no service-worker fetch handler, navigation cache, app-shell cache, or Cache API implementation in the current worker.**

Live `/sw.js` returned HTTP 200 with:

`Cache-Control: no-store, must-revalidate, no-cache`

There is no explicit service-worker version number or cache key. Capture diagnostics can record the controller script URL and client build; they do not provide a complete installed-client cache inventory.

**Current physical iPhone service-worker state: unknown.**

The available evidence does not establish stale PWA caching as the cause of the prior custom-camera incident.

## 4. Capture paths

Primary implementation: [`BatchInvoicePayments.tsx`](C:/Users/robbi/.codex/worktrees/native-capture-lifecycle/trimax/src/app/components/BatchInvoicePayments.tsx), with provenance in `lib/captureRouting.ts`.

| Path | Entry/selection | Acquisition | Current reachability |
|---|---|---|---|
| Normal Take Photo | `openCameraCapture` | File input with `capture="environment"` | Yes |
| Native still | Same primary path | Browser/device camera returns file | Yes |
| Choose Existing | Existing-photo input | User-selected image file | Yes |
| Custom camera | Historical `paymentEntryMode === "camera"` effect/portal | `getUserMedia`, still/frame preparation | Code remains; no current UI setter into camera mode found |
| Native invocation failure | Missing/failed picker invocation | Explicit error/Choose Existing option | Yes; no silent custom fallback |
| Retained-image diagnostic replay | Diagnostic reference path | Existing canonical object | Yes, owner/admin diagnostic flow |
| Manual entry | Payment workspace | No OCR acquisition | Yes |

**NORMAL TAKE PHOTO CURRENTLY EXECUTES:**

```text
Take Photo
→ freeze native-still provenance
→ native file input
→ returned image file
→ photo/preview state
→ preparation
→ canonical upload
→ background processing
```

**CUSTOM CAMERA CURRENTLY REACHABLE: NO through the inspected normal production UI.** Historical implementation remains in the bundle/source behind camera-mode state.

### Provenance and lifecycle

The capture implementation is frozen when selected:

- Native still
- Existing photo
- Custom camera, if explicitly invoked by a future/internal path

Recorded fields include selection time/reason, acquisition mechanism, fallback information, client build, opening-time flags, role/business loading state, and eligibility errors.

After a file returns, the current code:

1. Stops any camera stream.
2. Clears capturing state.
3. Enters photo mode.
4. Creates the image preview.
5. Waits for image load and a rendering opportunity.
6. Begins preparation.

The rendering opportunity is not a measurement of an actual iPhone display repaint.

The framing guide is an advisory pre-capture surface. It does not select the camera, gate capture, or determine OCR geometry.

**Historical production click-through:** Take Photo opened the native file chooser without the custom portal.

**Unknown:** successful fresh physical acquisition, preview timing, and persisted provenance under `b5d0d51`. No post-deployment physical attempt was present in the examined records.

## 5. Image durability/storage

### Current path

```text
Image file retained in current client session
→ prepared canonical image
→ SHA-256
→ direct private Storage upload
→ durable object reference
→ canonical metadata registration
→ separate legacy/shadow enqueue
```

Relevant modules:

- `ocrCanonicalClient.ts`
- `ocrCanonicalObject.ts`
- `trimax_store_ocr_capture`
- `trimax_prepare_ocr_handoff`
- `trimax_resume_ocr_handoff`

| Item | Verified state |
|---|---|
| Canonical bucket | `trimax-ocr-captures`, private |
| Object path | Business / attempt / source hash |
| Maximum bucket object size | 8,000,000 bytes |
| Allowed types | JPEG, PNG, WebP |
| Largest retained tested object found | 7,211,205 bytes |
| Upload overwrite | Disabled |
| Retry verification | Existing object size and hash checked |
| Canonical identity | Workspace, attempt identity, immutable source hash/reference |
| Worker integrity check | Downloaded image hash verified |
| Payment attachment bucket | Separate private `trimax-payment-images` |

Storage upload and job enqueue are separate operations. An enqueue failure does not transactionally roll back the already uploaded object.

### Temporary retention and recovery

The file/object URL remains in client memory during recoverable upload failure. Full original-image survival across a pre-acknowledgement reload is **not established**. The diagnostic outbox is not proof that the original photograph is durably stored on-device.

The canonical image is a prepared image; it must not automatically be described as the untouched original file with original EXIF.

### Base64 still exists

- Current canonical registration rejects inline image content.
- Historical optical records still contain base64 images: **61 image entries**, versus **2 object-reference entries** in the inspected optical inventory.
- A compatibility shadow-enqueue implementation still accepts inline image data.
- Internal OCR adapters use data URLs/in-process image representations.
- Legacy evidence chunks encode JSON, not canonical image uploads, as base64.

Therefore, **base64 image transport/storage has not been eliminated everywhere**, although the current primary canonical-upload path uses private Storage.

### Retention

Temporary optical/diagnostic evidence generally expires after 30 days unless pinned. Attempt summaries remain. Database cleanup runs hourly; object cleanup has a daily Vercel route and bounded batches.

Complete cleanup coverage for every legacy evidence-chunk record was not established.

## 6. Legacy OCR

### Current architecture

```text
Canonical reference
→ legacy enqueue
→ quick HTTP acknowledgement
→ restricted local Node worker claims job
→ canonical image retrieval/hash verification
→ orientation
→ upright document OCR
→ supplemental/targeted recovery
→ row/field evidence
→ checkpoints/evidence chunks
→ persisted terminal result
→ client polling restores review
```

Primary modules:

- `scripts/ocr-legacy-worker.cjs`
- `api/payments/ocr-jobs/route.ts`
- `api/payments/extract-check-stub/route.ts`
- `ocrLegacyProgress.ts`
- `ocrLegacyOrientation.ts`
- `ocrLegacyDirection.ts`
- `ocrDocumentDirection.ts`
- `ocrLegacyPass.ts`
- `ocrFaint.ts`, `ocrStructure.ts`, `remittanceMatching.ts`
- `scripts/ocr-legacy-evidence.cjs`

### Queue and timeouts

| Control | Value |
|---|---|
| Poll interval | 5 seconds |
| Worker RPC timeout | 20 seconds |
| Lease | 3 minutes |
| Heartbeat | 30 seconds |
| Individual recognition deadline | 6,000 ms |
| Initial full-document working resolution | Long edge 2,600 pixels |
| Compatibility extraction HTTP route | `maxDuration = 60` |
| Job API route | 15-second route budget |
| Client job polling | Approximately 2.5 seconds |
| Queue claim | `FOR UPDATE SKIP LOCKED`; expired leases reclaimable |

The background worker invokes extraction locally, outside Vercel’s request lifetime. The old synchronous extraction route still exists.

Orientation probes use shared lightweight evidence. The first detailed pass receives selected upright pixels. Supplemental failure is isolated when prior completed evidence exists.

### Persistence

- Stage checkpoints persist independently.
- `ocr_complete` and `response_ready` recovery avoid repeating already completed recognition where sufficient checkpoint data exists.
- Large evidence is append-only and chunked.
- Terminal summaries are bounded to approximately 4 KB.
- Evidence serialization has a 12 MB limit and bounded chunk count.
- Persistence failures can enter a recoverable completion-persistence state.

### Current evidence

A retained Capture 2 legacy job completed in approximately **27.08 seconds from claim to review** and produced seven row candidates.

The latest later legacy job returned **422 for uncertain orientation**, with no rows. That is a recorded recognition failure, not an HTTP 504.

Current queue: **5 review jobs, 2 failed jobs, none queued/running**.

Current worker process exists. A fresh end-to-end health job was not run in this read-only audit.

Shared monetary evidence reaches legacy through an explicit review adaptation path; it is not the same thing as automatically making the v2 resolver authoritative.

## 7. OCR v2

| Stage | Module family | Contract/current behavior |
|---|---|---|
| Canonical integrity | Shadow worker/pipeline | Verify source hash |
| Normalization | `documentNormalization.ts` | EXIF normalization, bounded image processing |
| Paper isolation/rectification | `documentGeometry.ts` | Detect document geometry; retain transform/provenance |
| Orientation | `ocrDocumentDirection.ts` | Four bounded angle probes; uncertainty retained explicitly |
| Text/components | `semantics/index.ts` | Native/grayscale observations; bounded additional contrast path |
| Headers/columns | `headerGeometry.ts`, `tableGeometry.ts`, `labels.ts` | Generic labels and slope-aware geometry |
| Physical rows | `physicalRows.ts` | Structural support independent of valid invoice tokens |
| Invoice recognition | Recognition adapters and `fusion/index.ts` | Complete observed candidates; independent-model corroboration |
| Money recognition | `semanticMoney.ts`, `matureMoney.ts` | Complete monetary observations; independent recognizer agreement |
| Shared money service | `documentFields/moneyService.ts` | Image/geometry evidence, separate from business resolver |
| Total localization | `totalLocalization.ts` | Structural candidate outside rows and aligned with amount geometry |
| Total authority | `documentTotalAuthority.ts` | Observed value plus semantic/geometric evidence; ambiguity preserved |
| Organization identity | `organizationIdentity.ts` | Generic normalization and independent visual corroboration |
| Residual evidence | Recognition/resolver residual modules | Strict prerequisites; derived amount kept separate from OCR |
| Resolver | `resolver/index.ts` | Existing eligibility, identity, totals, uniqueness and reconciliation gates |

### Important contracts

- No invoice digit is supplied by the database.
- Repeated variants from one model are not independent model votes.
- Monetary agreement does not permit ambiguous digits to be replaced by expected amounts.
- Arithmetic cannot create an unobserved document total.
- Generic dates do not automatically become authoritative check dates.
- Unknown layouts remain review-required.
- `paymentCanApply` remains false for shadow output.

### Current unresolved evidence

- Capture 2 preserves five rows.
- Row 1 invoice remains formally unresolved.
- Row 3 amount remains formally unresolved.
- Production monetary component containment still has the proven Row 5 boundary-clipping defect.
- Capture 2 total and identity remain non-authoritative in its recorded result.

The unreleased ownership experiment is not a verified production repair.

Recent recorded v2 pipeline durations were **31.99 seconds** and **27.38 seconds**. “Completed” means diagnostics persisted; it does not mean automatic document success.

## 8. Model inventory

Historical accuracy below is **invoice-crop exact accuracy on the recorded 24-row, eight-document benchmark**, not current full-document physical acceptance.

| Recognizer | Fields/use | Runtime/model | Historical exact | Initialization / warm crop |
|---|---|---|---:|---|
| Tesseract.js English | Page, orientation, targeted fields | Node; English trained data | Not independently measured here | Pass timings recorded separately |
| Native Tesseract generic | Invoice comparison; numeric evidence through relevant adapters | WSL Tesseract 5.5.0 | 5/24 | About 64 ms/crop; adapter-init figure excludes full process startup |
| `trimax_invoice_pilot_v1` | Invoice research/comparison | WSL custom traineddata | 18/24 | About 97 ms/crop |
| SVTRv2 | Invoice, money, organization | WSL/PyTorch | 22/24 | 1.48 s init; ~16 ms GPU/~51 ms CPU |
| PARSeq | Invoice, money, organization | WSL/PyTorch | 22/24 | 5.68 s init; ~21 ms GPU/~32 ms CPU |
| PP-OCRv5 | Invoice, money, organization | WSL/ONNX/RapidOCR | 19/24 | 0.76 s init; ~13 ms CPU |
| TrOCR small printed | Historical comparison | Transformers | 12/24 | 9.46 s init; ~34 ms GPU/~137 ms CPU |

Recorded model locations:

- `/usr/share/tesseract-ocr/5/tessdata/eng.traineddata`
- `/home/robbi/trimax-ocr/pilot-v1/trimax_invoice_pilot_v1.traineddata`
- `/home/robbi/trimax-ocr/phase3e/openocr_svtrv2_ch.pth`
- `/home/robbi/.cache/torch/hub/checkpoints/parseq-bb5792a6.pt`
- `/home/robbi/trimax-ocr/pilot-v1/modern-models/en_PP-OCRv5_rec_mobile.onnx`

Recorded runtime versions include Torch `2.14.0+cu130`, RapidOCR `3.9.2`, ONNX Runtime `1.30.0`, and Transformers `4.57.6`. These are recorded worker evidence, not a fresh WSL package inspection.

The shadow subprocess reuses models across crops within a job, then exits. Models are loaded again for subsequent jobs. Generic/pilot comparison observations are generated, but are not the mature ensemble’s voting authority.

Other research/training scripts remain. Their complete checkpoint inventory, usability, and present accuracy are **unverified**.

## 9. Evidence/diagnostics

| Storage | Responsibility |
|---|---|
| `ocr_attempts` | Durable attempt summary, identity, status and pairing |
| `ocr_attempt_diagnostics` | Detailed diagnostic result |
| `ocr_attempt_debug` | Debug workflow state |
| `ocr_attempt_optical` | Temporary optical evidence or references |
| `ocr_shadow_jobs` | Shadow queue/lease/result state |
| `ocr_shadow_acceptance` | Frozen human-verified acceptance truth |
| `ocr_legacy_jobs` | Legacy queue, checkpoints and terminal result |
| `ocr_legacy_evidence` | Append-only chunked evidence |
| Private Storage | Canonical image bytes |

Recent OCR Scans, OCR Proof, stable attempt links and Debug Queue expose this existing infrastructure.

### Authority distinctions

- Canonical hash identifies image bytes.
- Raw recognizer observations and provenance support evidence.
- Queue completion proves persistence, not recognition correctness.
- Legacy review authority is separate from v2 shadow diagnostics.
- Verified business truth belongs after human review; it is not inference input.

### Reconstruction and loss

Completed checkpoints can restore review without rerunning recognition. Canonical references permit replay while retained. Expired unpinned optical evidence can no longer be reconstructed from summaries alone.

A client image lost before durable acknowledgement may be unrecoverable.

**Live inconsistency:** attempt `286fa52f-fc2b-4032-9e08-13b5248941a3` remains `processing` with an upload-interrupted reason and no corresponding queued processing work. It is not evidence of active OCR.

The acceptance-truth table currently contains **zero records**.

## 10. Payment safety

### Current flow

```text
Legacy evidence
→ matching and eligibility
→ identity/unit/amount/total checks
→ exact reconciliation
→ duplicate checks
→ explicit user review/action
→ authenticated apply-batch API
→ invoice/business writes
```

Relevant files include:

- `remittanceAttempt.ts`
- `remittanceMatching.ts`
- `invoiceEligibility.ts`
- `BatchInvoicePayments.tsx`
- `api/payments/apply-batch/route.ts`

The client OCR path checks invoice eligibility, collectible restrictions, split relationships, ambiguity, total authority, reconciliation and duplicate evidence. Diagnostic replay cannot apply payment through that UI.

### Server boundary

The payment API independently checks:

- Authenticated user and business membership
- Invoice IDs belonging to the business
- Unique selected records
- Eligibility and split-parent restrictions
- Selected balances versus payment amount
- Supplied stub total where present
- Duplicate fingerprints/check evidence
- Owner/admin authority for duplicate override

**Important verified limitation:** normal application in this endpoint does not independently reconstruct the OCR attempt’s identity/total-authority evidence. It also does not impose the same owner/admin-only condition as the diagnostic UI; business membership is a separate server gate.

The endpoint uses a service-role credential. It performs multiple writes with compensating rollback rather than one database transaction.

| Capability | Result |
|---|---|
| LEGACY WORKER CAN WRITE PAYMENTS | **NO** |
| V2 WORKER CAN WRITE PAYMENTS | **NO** |
| OCR RESULT ALONE CAN APPLY PAYMENT | **NO in the current application flow** |
| Payment applied during audit | **NO** |

Anonymous table grants alone are broad, but worker access is constrained by RLS and narrowly scoped credential-checked RPCs. The audit verified no effective worker business-write path.

A complete concurrency proof for payment application was not performed.

## 11. Feature flags

| Configuration | Current value/default | Loading/failure behavior |
|---|---|---|
| R&L `ocr_shadow_flags.enabled` | Live `true`; absent/default disabled | Owner/admin lookup; errors disable shadow |
| R&L `native_still` | Live `true`; historical default disabled | Now diagnostic/config state, not primary camera selection |
| Legacy worker enabled | Live `true` | Claim/access checked through worker RPC |
| Maintenance mode | Live `false`; fallback false | Owner/admin exception |
| Custom-camera enable flag | None found in current routing | Dormant camera-state branch remains |
| Session idle limit | 45 minutes | Client session-security check |
| Session absolute limit | 12 hours | Client session-security check |
| Diagnostic retention | Generally 30 days, pin exception | Database/object cleanup |
| Build identifier | Vercel commit environment value | Captured in diagnostics |
| Worker polling/leases/timeouts | Constants/config described in worker sections | Separate from camera selection |

Production shadow/native flags were last updated September 21, 2026.

Disabling shadow prevents new permitted processing through its control points; it is not an instantaneous termination of computation already executing.

Full production environment-variable inventory was not exported. Secret values were not exposed. Values for unexamined workspaces remain unknown.

## 12. Workers

| Item | Legacy | V2 shadow |
|---|---|---|
| PID | `32732` | `3824` |
| Start time | Sep 26, 00:27:26 PDT | Sep 26, 00:55:02 PDT |
| Process running | Yes | Yes |
| Runtime | Windows Node | Windows Node coordinator + per-job WSL/Python |
| Startup | Manually launched background process | Manually launched background process |
| Loop | Continuous polling | Continuous polling |
| One-job mode active | No | No |
| Automatic supervisor restart | None found | None found |
| Current queued/running jobs | 0/0 | 0/0 |
| Queue totals | 5 review, 2 failed | 37 completed, 1 failed |
| WSL currently running | Not required | No distribution running at inspection |

No matching Windows service or scheduled task was found. Parent launcher processes were gone.

Both workers coexist as running processes. This does not prove the next queued job will complete.

The last successful legacy review job recorded was `bf2a5b18-29eb-4c9c-a586-f681fedf5462`. A later legacy job failed orientation safely. The latest shadow job persisted diagnostics but remained review-required.

Logs contain fetch failures without sufficient timestamps to establish a current outage. Shadow logs also contain image-box clipping warnings.

Reboot/logoff and computer availability are operational dependencies. No verified automatic post-reboot restoration exists in the inspected setup. Silent loss is not independently detected by a durable worker-heartbeat service.

## 13. Database/RPC/triggers

### Principal tables

OCR tables are listed in section 9. Related business tables include:

- `invoices`
- `invoice_line_items`
- `payment_attachments`
- `activity_logs`
- `clients`
- `business_users`
- `queue_items`
- `app_settings`

Payments are represented through invoice/business records and activity, not a separate payment table in the inspected set.

### RPC/function inventory

| Responsibility | Functions |
|---|---|
| Canonical registration | `trimax_store_ocr_capture` |
| Handoff | `trimax_prepare_ocr_handoff`, `trimax_resume_ocr_handoff` |
| Shadow processing | `trimax_enqueue_ocr_shadow`, `trimax_claim_ocr_shadow`, `trimax_complete_ocr_shadow` |
| Legacy processing | `trimax_enqueue_ocr_legacy`, `trimax_claim_ocr_legacy`, `trimax_update_ocr_legacy` |
| Legacy retrieval | `trimax_ocr_legacy_status`, `trimax_recent_ocr_legacy` |
| Attempts/debug | `trimax_save_ocr_attempt`, `trimax_update_ocr_debug`, `trimax_pin_ocr_attempt` |
| Flags | `trimax_set_ocr_shadow` |
| Optical/retention | `trimax_separate_ocr_optical`, `trimax_expired_ocr_objects`, `trimax_cleanup_ocr_diagnostics` |
| Storage authorization | `trimax_ocr_object_owner`, `trimax_ocr_object_worker` |

### Triggers

- Invoice `updated_at`
- Attempt capture/pair preservation
- Diagnostic handoff preservation
- Optical separation
- Canonical optical preservation
- Shadow optical-reference transfer before deletion

These overlap intentionally around preserving capture identity and evidence.

### RLS and indexes

All listed OCR tables have RLS enabled.

- Owner/admin diagnostic access
- Business-scoped authenticated application access
- Worker lease/key-scoped canonical reads
- RPC-only legacy worker/job/evidence access where direct policies are absent
- No worker overwrite/delete/business-write policy

Important indexes include attempt recent/original lookup, unique legacy/shadow pairing, pending queue indexes, legacy claim indexes, evidence `(attempt, hash, chunk)` keys, and payment attachment invoice-ID GIN indexing.

### Timeouts and large writes

| Role/config | Timeout |
|---|---|
| Anonymous | 3 seconds |
| Authenticated | 8 seconds |
| Authenticator statement/lock | 8 seconds |
| Service role | No role-specific timeout shown |

Legacy evidence chunking reduces terminal write size. Shadow completion still writes a full diagnostic result subject to a large bounded payload. Historical inline-image RPC compatibility also remains.

Those are **remaining large-write surfaces**, not newly reproduced timeout failures.

The hourly diagnostic cleanup’s recent runs succeeded. Its exclusions can retain recoverable `processing` states indefinitely, including the observed upload-interrupted attempt.

## 14. Regression timeline

| Problem | Proven cause/fix history | Current status |
|---|---|---|
| Black camera overlay | Stream stopped while camera portal remained mounted | Normal route isolated by `b5d0d51`; fresh physical acceptance pending |
| Native/custom routing | Async eligibility selected custom fallback | Unconditional native routing and frozen provenance in `b5d0d51` |
| Large-image HTTP transport | Inline image payload exceeded request constraints | Reference work `af44cdc`; direct Storage `f7ff841` |
| Canonical durability coupling | Image registration and handoff coupled | `22cee9b`, `9098f55`; later direct-object path remains |
| Terminal persistence | Large result writes failed after OCR | `f7ff841`, `be8d909` bounded terminal/chunk/checkpoint recovery |
| Worker availability | Manually managed processes stopped/unavailable | Processes running now; no supervisor/autostart found |
| Orientation failure isolation | Probe failure disrupted selection | `266e4c9`, `97d0fe0`, `8b91e2c` |
| First detailed pass timeout | Full-resolution initial pass cost | `54d1708` working resolution/worker reuse |
| Supplemental grayscale timeout | Later failure blocked completed evidence | `aba306a` failure isolation |
| Amount heading lost | Cross-pass/sloped header mapping | `28ab045` and later geometry repairs remain |
| Physical rows missing | Dependence on readable invoice tokens | `a0d2ca7` structural row localization |
| Monetary evidence divergence | Separate legacy/v2 evidence paths | `b8347f3` shared evidence adaptation |
| Total authority | Rigid footer localization | `d3cf621` generic structural localization |
| Identity | Insufficient/competing organization evidence | `d796754` generic consensus; review cases remain |
| Synchronous 504 | Legacy OCR inside HTTP lifetime | `d4ca13b`, `ee2c895` asynchronous jobs/timing |
| Capture 2 table mapping | Insufficient heading evidence | `b927b09` bounded contrast recovery |
| Login loop | No verified current causal trace | Cause/fix/reappearance unverified |

Presence of a fix in source is not equivalent to current physical acceptance.

## 15. Duplicate/competing paths

| Area | Parallel implementations |
|---|---|
| Capture | Native file intake and dormant custom camera in `BatchInvoicePayments.tsx` |
| Acquisition preparation | Normal single-still preparation plus old still/canvas source competition |
| Orientation | Shared direction helper, legacy wrapper, v2 normalization, historical custom preflight |
| OCR execution | Async legacy worker plus compatibility synchronous extraction API |
| Recognition | Legacy Tesseract recovery and v2 mature field recognizers |
| Layout | Legacy text-derived candidates and v2 physical row/column semantics |
| Money | Legacy extraction, specialized shared evidence, v2 fusion |
| Totals | Legacy parsing and structural v2 total-authority evidence |
| Invoice resolution | Shared business matching through different legacy/v2 adapters |
| Retry | Client upload retry, diagnostic outbox, handoff retry, queue reclaim, checkpoint recovery |
| Image persistence | Current Storage references plus historical base64 optical records |
| Evidence persistence | Legacy chunks versus full shadow diagnostics |
| Auth | Client AuthGuard, server debug checks, API membership checks, database RLS |
| Runtime revision | Deployed web checkout versus separate modified worker checkout |

These are verified coexistences. Not all are active in the same normal workflow.

## 16. Known-good

**Currently live verified:**

- Production web deployment is Ready and matches remote `main`.
- Public application and service-worker URLs return HTTP 200.
- Production database/catalog is accessible.
- Both Node worker processes are running.
- Neither queue has queued/running work.
- Database diagnostic cleanup has successful recent executions.
- Worker credential paths do not provide payment-write capability.
- Canonical object storage is private and independently registered.

**Retained production evidence:**

- Large-object upload and idempotent recovery passed previously.
- Legacy background processing has persisted review results outside HTTP lifecycle.
- Shadow processing has persisted paired diagnostics.
- Capture 2 v2 produces five physical rows.
- Supplemental OCR failure no longer discards completed first-pass evidence.
- Native Take Photo click-through opened the native picker without the custom portal.

These facts do not establish that all current physical capture and recognition cases succeed.

## 17. Known-broken

- Capture 2’s production monetary crop ownership can exclude the leading component at the Row 5 boundary.
- Attempt `286fa52f-fc2b-4032-9e08-13b5248941a3` retains a `processing` status despite upload interruption and no processing job.
- A recorded legacy attempt failed at uncertain orientation with HTTP/result status 422.
- Capture 2 remains review-required with unresolved invoice, monetary, total-authority and identity evidence.
- There is no verified automatic worker restoration after reboot/logoff.
- The worker checkout contains unreleased modifications, preventing a clean revision-only description of its runtime inputs.

Unresolved visual fields are not automatically classified as software defects.

## 18. Unknown/unverified

- Fresh physical iPhone behavior after `b5d0d51`.
- Actual preview-paint latency and camera-indicator duration.
- Current physical iPhone client/SW state.
- Persisted opening-time capture provenance from a new deployed capture.
- Fresh end-to-end health of both workers today.
- WSL startup/model availability on the next job.
- Exact hashes of already loaded worker modules.
- Complete database migration equivalence.
- Complete production environment/config inventory.
- Complete retention coverage for all evidence-chunk and orphan-object cases.
- Current independent accuracy of every recognizer on fresh unseen documents.
- A frozen five-document Phase 6 acceptance set: the acceptance table is empty.
- Current login-loop reproduction and cause.
- Payment concurrency behavior under simultaneous conflicting requests.
- Complete transactional recovery after every possible partial payment write.
- Whether every non-OCR manual payment surface enforces identical server-side authorization.

No new scans, replays, or mutation tests were used to fill these gaps.

## 19. Risk map

| Area | Evidence-based risk |
|---|---|
| Distributed builds | Web, worker checkout and in-memory modules cannot be represented by one verified commit |
| Worker availability | Desktop/process/WSL dependencies without verified automatic recovery |
| Authentication | Per-tab session marker combined with shared auth/sign-out state |
| Client authorization | Empty-membership/error branches have permissive client defaults |
| Payment boundary | Server validates business/payment inputs but does not reconstruct all OCR authority |
| Payment writes | Compensating rollback across separate writes |
| State consistency | Capture, attempt, handoff, job and debug statuses can disagree |
| Diagnostics | Queue completion can be mistaken for successful recognition |
| Legacy capture code | Dormant custom engine remains beside native intake |
| Recognition | Multiple evidence paths with different geometry and authority contracts |
| Persistence | Chunked legacy results versus large shadow diagnostic writes |
| Retention | Separate database, object and evidence-chunk lifecycles |
| Observability | Process existence is not end-to-end worker health; physical paint/indicator state unmeasured |
| Cross-subsystem effects | Capture preprocessing changes image geometry consumed by layout, recognition and evidence adapters |

The previous capture-provenance contradiction is repaired in current source. Its correction has not yet been demonstrated by a new physical attempt record.

## 20. End-to-end architecture

```text
INSTALLED PWA / WEB
  |
  | launch / route
  v
SUPABASE SESSION + AUTHGUARD
  | custom idle/absolute/per-tab checks
  | workspace membership + role/property lookup
  | redirects / maintenance checks
  v
PAYMENT WORKSPACE
  |
  +-- Take Photo --> native device file capture
  +-- Choose Existing --> image file
  +-- Manual entry --> existing review/payment flow
  |
  | freeze acquisition provenance
  | image returned
  v
PHOTO/PREVIEW STATE
  | client-memory file retention
  | preparation / canonical hash
  v
PRIVATE SUPABASE STORAGE                         [async upload]
  | immutable object path/hash
  v
CANONICAL DB REGISTRATION                        [separate DB write]
  |
  +-- recoverable upload/handoff state
  |
  +--> LEGACY JOB ENQUEUE                        [DB queue]
  |      |
  |      +--> quick HTTP attempt/status response
  |      |
  |      v
  |    WINDOWS NODE LEGACY WORKER                [lease + heartbeat]
  |      | image retrieval/hash verification
  |      | orientation / OCR / recovery
  |      | stage checkpoints                     [DB writes]
  |      | append-only evidence chunks           [DB writes]
  |      v
  |    TERMINAL LEGACY RESULT                    [bounded DB write]
  |      |
  |      +--> client status polling/reload recovery
  |
  +--> V2 SHADOW ENQUEUE                         [separate DB queue]
         |
         v
       WINDOWS NODE SHADOW COORDINATOR           [lease]
         | canonical image retrieval/hash
         | normalization/layout
         v
       WSL/PYTHON MATURE RECOGNIZERS              [subprocess boundary]
         |
         v
       FUSION + UNCHANGED DIAGNOSTIC RESOLVER
         |
         v
       SHADOW DIAGNOSTICS / PAIRED ATTEMPT        [DB writes]
         |
         +--> owner/admin comparison
         +--> explicit shared-money evidence adaptation
                    |
                    v
LEGACY REVIEW / EXISTING SAFETY RESOLVER
  | identity / eligibility / amounts / total / reconciliation
  | duplicate / split / correction safeguards
  | explicit user action
  v
AUTHENTICATED APPLY-PAYMENT API
  | server business/eligibility/amount/duplicate checks
  | separate service-role authority
  v
INVOICE + ACTIVITY/PAYMENT-RELATED WRITES
  | compensating rollback on failure
  v
PAYMENT RESULT

Neither OCR worker has a payment-write branch.
V2 shadow does not automatically control payment review or application.

Compatibility synchronous OCR, historical inline-image storage,
and dormant custom-camera code remain separate competing/legacy surfaces.
```

SYSTEM STABILITY ASSESSMENT:
- Stable enough to continue current architecture: **UNPROVEN**

REASON:
The web deployment is healthy and matches main, but worker runtime identity and fresh end-to-end health are not fully verified. Current evidence includes a crop-ownership defect, inconsistent attempt status, unresolved recognition cases, and no frozen fresh acceptance records or physical acceptance of the latest capture release.

## Handoff to ChatGPT

Current production commit: b5d0d51ab35a915292e54355d5c582a22876be11

SYSTEM STABILITY ASSESSMENT: UNPROVEN

Short factual reason: The web deployment is healthy and matches main, but worker runtime identity and fresh end-to-end health are not fully verified. Current evidence includes a crop-ownership defect, inconsistent attempt status, unresolved recognition cases, and no frozen fresh acceptance records or physical acceptance of the latest capture release.

### Current known-broken items

- Capture 2’s production monetary crop ownership can exclude the leading component at the Row 5 boundary.
- Attempt `286fa52f-fc2b-4032-9e08-13b5248941a3` retains a `processing` status despite upload interruption and no processing job.
- A recorded legacy attempt failed at uncertain orientation with HTTP/result status 422.
- Capture 2 remains review-required with unresolved invoice, monetary, total-authority and identity evidence.
- There is no verified automatic worker restoration after reboot/logoff.
- The worker checkout contains unreleased modifications, preventing a clean revision-only description of its runtime inputs.

Unresolved visual fields are not automatically classified as software defects.

### Current unknown/unverified items

- Fresh physical iPhone behavior after `b5d0d51`.
- Actual preview-paint latency and camera-indicator duration.
- Current physical iPhone client/SW state.
- Persisted opening-time capture provenance from a new deployed capture.
- Fresh end-to-end health of both workers today.
- WSL startup/model availability on the next job.
- Exact hashes of already loaded worker modules.
- Complete database migration equivalence.
- Complete production environment/config inventory.
- Complete retention coverage for all evidence-chunk and orphan-object cases.
- Current independent accuracy of every recognizer on fresh unseen documents.
- A frozen five-document Phase 6 acceptance set: the acceptance table is empty.
- Current login-loop reproduction and cause.
- Payment concurrency behavior under simultaneous conflicting requests.
- Complete transactional recovery after every possible partial payment write.
- Whether every non-OCR manual payment surface enforces identical server-side authorization.

No new scans, replays, or mutation tests were used to fill these gaps.

No repairs were made during this audit.
