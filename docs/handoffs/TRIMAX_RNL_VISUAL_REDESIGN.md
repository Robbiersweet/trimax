# R&L scheduling visual redesign

## Scope and release

Visual-only work on `codex/public-scheduling-foundation`, based on scheduling Preview `9587f24994c127ec94deb5bc695fcaa47483c520`. Design commit: `cce46ae82b56a6640a55c3952337efb574a953a4`. Production remains rc10 `9f8f48b851a249caa75c0dc5bdc632f134c1c1c3`. Only the scheduling branch was pushed. No main merge, production deployment, migration, credential/configuration change, worker action, real submission, notification or payment occurred.

Read the foundation, Phase 2, rc10 Preview and final rc10 rollout handoffs (the last is in the original workspace). Existing Preview isolation is unchanged: synthetic @example.test contacts, temporary filesystem storage, separate component-memory owner fixture, no live privileged credential.

## Exact assets

- Hero: `public/branding/rnl/rnl-original-badge.png`, copied byte-for-byte from selected `public/Brand/rnl-multi-colors.png`. SHA-256 for both: `725a5b5098d2c06295ff8dd1ab973adfd6b6525bcedec0b463304f6b029a339c`. Original 5334 × 4268 proportions and artwork retained, including saw blade, crossed hammers, wordmark and border. Next Image serves responsive renditions without modifying the original. No invented logo.
- Footer uses a plain R&L Creations wordmark. Crossed hammers remain inside the real hero badge; no separate mark redrawn/extracted.
- `public/branding/rnl/workshop-preview.png`: generated replaceable Preview design asset, 1536 × 1024, approximately 2.06 MB. Not a photograph of actual R&L premises. Built-in image generation; no hotlinks. Original retained at `C:/Users/robbi/.codex/generated_images/01a0a3c1-13ac-7d03-8702-3d9ecafd7355/exec-212eee69-97e7-4905-89b3-4035c0c65641.png`.

Generation prompt: “Use case: photorealistic-natural. Asset: temporary local background photograph for R&L contractor scheduling website Preview. Wide landscape 1536x1024. Quiet premium craftsman's workbench, weathered dark walnut wood surface with a well-used hand plane, carpenter's square, chisels and a few curled wood shavings arranged toward the right half. Warm low workshop sidelight, charcoal shadows, natural wood and restrained amber highlights. Left half subdued dark negative space for HTML text. Authentic residential finish carpentry, editorial still life, tactile and approachable, not industrial, no people, no retail aisles, no hard hats, no text, no logos, no watermark. Background photo only, not a webpage mockup.”

## Palette and typography

Charcoal hero #171715; footer #22221f; ivory #f5f1e9; warm-white card #fffdf9; orange CTA #f49a38 with dark text #241b12; darker orange labels #ac470c / #9b400c; body #262521; helpers #68645d. Orange is limited to buttons, line icons, active progression and brand accents.

UI/headings: system Arial/Helvetica sans-serif, heavy headings and tight display spacing. Tagline/micro-tagline: Segoe Print, Bradley Hand, Snell Roundhand, cursive. No remote font requests/dependencies. Script rendering varies by OS; actual iPhone font rendering is not claimed.

## Hero and form

Dark gradient over local workshop image; proportional original badge; exact approved tagline “Your home and its appearance is our reputation.”; heading “Schedule or Request Service Online”; orange Start Your Request anchor; compact Reliable Service / Quality Work / Proudly Local strip with line SVG icons. No license/certification claims added.

Warm content and light card, restrained border/shadow, grouped fields, 48px inputs/buttons, visible focus, skip-to-form link, neutral inactive steps and orange active steps. Progress labels: Your Info / Project Details / Review & Submit. Only labels changed: original work/contact → visit preferences → review state machine, validators, fields, idempotency key, API, pending/errors and receipts are unchanged. Step 1 still includes service/work/contact; no model reordering.

Footer: wordmark, general contracting/home services, “Homes. Projects. People.” Request-not-booking, separate confirmation, no-payment and emergency truth preserved. Internal owner/admin styles unchanged.

## Files changed

1. `src/app/book/[slug]/page.tsx`: public composition/copy/assets; resolution and public prop allowlist preserved.
2. `src/app/book/schedule.css`: public scheduling styles only.
3. `src/app/book/RequestForm.tsx`: three progress labels only.
4. `public/branding/rnl/rnl-original-badge.png`: exact asset copy.
5. `public/branding/rnl/workshop-preview.png`: generated background.
6. This report.

Source-diff allowlist PASS: no changes to API/domain/store/auth/tenant isolation, internal pages, OCR, payments, workers, SQL, service worker, release machinery, package/lockfile or Vercel configuration.

## Tests

- Public scheduling: PASS all six groups (domain/storage, boundaries, authorization, owner/settings, Phase 2, Preview isolation).
- Phase 1 and Phase 2 disposable SQL: PASS with existing external PGlite; no live database.
- 45 rc10 checks: PASS including auth, capture/lifecycle/durability, object/evidence persistence, legacy/shadow jobs, canonical, OCR phases/fields/fusion/resolver, money/identity/total, dataset, duplicates/reconciliation/payment, split/correction, tenant/business isolation and stabilization. Logs: `C:/Users/robbi/AppData/Local/Trimax/scheduling-rc10-preview/visual-rc10-regressions.log` and `visual-rc10-results.json`. Evidence-persistence initially received the wrong PGlite argument; corrected invocation passed.
- Release upgrade-state, Queue compact toolbar, Job Session crew/integrity: PASS.
- Broad npm test stopped at unchanged Queue test's literal-LF assertion on Windows CRLF. Working Queue content equals HEAD after newline normalization; exact unchanged test passed against committed LF bytes in an external directory. No Queue/test edits. This invocation is not claimed as uninterrupted aggregate npm-test PASS.
- Lint PASS; TypeScript PASS; optimized Next build PASS, 48 pages. Initial local build lacked public Supabase variables; rerun used inert placeholders and passed. No placeholders deployed.
- Diff whitespace and original badge SHA equality: PASS.

## Visual verification and Preview

Local desktop 1280 and mobile 390 × 844 / 430 × 932 screenshots inspected. Mobile content widths 380/420, no overflow. CTA before fold; badge/tagline separated. Inputs minimum 48px and 16px mobile text. Final deployed results recorded below.

Customer: https://trimax-git-codex-public-scheduling-foundation-trimax-s-projects.vercel.app/book/rnl-creations

Owner fixture: https://trimax-git-codex-public-scheduling-foundation-trimax-s-projects.vercel.app/book/demo

Application deployment: https://vercel.com/trimax-s-projects/trimax/Fp8xDwnCZF2mj6JSJzUycUpQqvLh

Immutable Preview: https://trimax-kqajhrdv4-trimax-s-projects.vercel.app/book/rnl-creations

## Limitations and production activation

Vercel Preview protection remains enabled. Synthetic public temporary storage and owner memory fixture are separate/resettable datasets. No production persistence/messaging. Browser viewport review does not claim installed-iPhone acceptance. Generated workshop image is replaceable; PNG payload is about 2 MB. System script fonts vary. Original logo retains original spacing/artwork.

Production prerequisites remain those in TRIMAX_PUBLIC_SCHEDULING_RC10_PREVIEW.md: approved migrations/restricted intake credential, tenant/slug configuration, durable rate/challenge protection, trusted identity, retention/privacy, real owner authorization acceptance, notifications/outbox/providers if enabled, status capabilities, monitoring/rollback, explicit approved production release. None activated here.

## Final deployed verification — October 11, 2026

Vercel Preview `Fp8xDwnCZF2mj6JSJzUycUpQqvLh` reached Ready at 4:51:02 PM PDT, duration 1m42s. Source `cce46ae82b56a6640a55c3952337efb574a953a4`. Remote Preview build runs scheduling tests, lint, TypeScript and optimized Next build; all completed. Production/main remained rc10.

| Check | Deployed evidence |
|---|---|
| Desktop | PASS, 1280 × 900; content width 1270; hero, original badge, script, trust strip, two-column content/form and footer inspected. Input heights 48px. |
| Mobile 390 × 844 | PASS, content width 380, CTA bottom 676px including Preview notice; no horizontal overflow. Logo/tagline clear, single-column card, stepper and review text wrap without collision. All three steps exercised. |
| Mobile 430 × 932 | PASS, content width 420, CTA bottom 639px; no overflow. Wider mobile hero/content/footer composition inspected. |
| Three-step form | PASS. Service, description, name, phone/email/contact preference, address, native date, window, flexibility, urgency, notes, consent, review and back/edit preserved. Back/edit retained entered details. |
| Desktop synthetic submission | PASS, `REQ-64C4DFC9A6B7`, fictional Jamie Visual Preview / @example.test, Carpentry, October 16 morning. |
| Mobile synthetic submission | PASS, `REQ-36D72DA3302C`, fictional Alex Mobile Preview / @example.test, Painting, October 19 afternoon. |
| Success | PASS, explicit no-real-request/no-notification Preview message, reference, appointment not confirmed, start-another link. |
| /book | PASS, redirects to /book/rnl-creations. |
| Unknown slug | PASS, 404/not-found UI; no request form. |
| Protected internal routes | PASS, /schedule and /admin/service-requests redirect to Trimax Login without displaying data. No new authenticated internal sign-in is claimed. |
| Owner fixture | PASS, two synthetic inbox entries; Jamie details, note, More information needed transition and demo-owner timestamped activity. Conversion remains disabled. Settings remain internal Trimax style, approval required, production disabled. |
| Idempotency / isolation | Existing deterministic domain, storage, authorization, SQL and Preview-isolation tests PASS. UI submission contract unchanged. No claim that public temp-store records populate the separate owner memory fixture. |

Screenshots were visually inspected in the browser at all three requested viewport sizes; this table records their layout measurements and observations. No screenshot or test is presented as actual installed-iPhone acceptance. Viewport overrides were reset after testing.

Scheduling logic changed: NO. Production changed: NO. Production scheduling enabled: NO. Real SMS/email: NO. Ready for Robbie visual review: YES.

Next action: WAIT FOR CHATGPT REVIEW. No further phase or production activation started.
