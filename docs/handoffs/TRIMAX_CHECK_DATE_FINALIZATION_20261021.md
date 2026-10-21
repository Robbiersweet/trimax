# Check-date finalization — 2026-10-21

Latest physical source and failure evidence are recorded in the active checkpoint. The first verified date loss is the boundary from retained OCR word observations to authoritative header extraction. Gray (confidence 90) and binary (80) full-document passes both read DATE:10/01/2026, above the invoice body. Their flattened combined header was removed by withoutMicrBandText because it also contained many financial digits. Header selection consumed sanitized text only. The old saved summary already held a null date; this is not evidence of a database dropping a non-null value.

The repair selects a date only when at least two distinct full-document passes corroborate a labeled high-confidence header word observation above the invoice body. Conflicting dates, one pass, cropped row evidence, weak words, and invoice body dates remain unknown. Existing invoice/client/money rules are unchanged. Review loading also unconditionally replaces the date to prevent stale previous review state.

The targeted regression uses the actual retained date observations and production sanitizer, then exercises evidence construction, resolution, saved scan state, JSON summary, terminal compaction, and resumed resolution. It preserves the three Glen invoice IDs and exact 4286.10 reconciliation. Full npm test passed before sealing. Full release and production verification are pending; no payment has been applied.

Full PREDEPLOYMENT gate 2026-10-21T12-45-06-647Z: READY_FOR_CONTROLLED_DEPLOYMENT. All eight frozen documents passed both engines; all code regressions, lint, TypeScript, production build, source integrity, runtime and database checks passed. Physical acceptance remains pending.
