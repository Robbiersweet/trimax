# OCR diagnostic display cleanup

Candidate starts from verified production dce3fdf. Physical-iPhone acceptance remains
pending; no automated result or diagnostic display change establishes device acceptance.

Three confirmed causes, from targeted read-only metadata and existing SQL source:

- Worker-created diagnostic summaries can omit timestamp/build. Cards/detail rendered
  those fields unconditionally, producing Invalid Date/blank Build despite valid record
  creation times and retained worker provenance.
- Legacy terminal summaries retain their own release object; shadow worker provenance
  is retained at diagnostic payload.result.release, not copied to summary.build.
- Direct shadow enqueue/terminal completion can leave the legacy handoff_pending flag
  intact. The old banner checked only that flag, ignoring its completed paired attempt.
  Null fields on completed shadow summaries were also labeled Pending.

Presentation only: prefer recorded capture timestamp/build; fall back to the record's
saved time (labeled Saved) and that attempt's recorded worker release/source. Missing,
expired or unavailable metadata stays explicit, never replaced with the current build
or current time. New reads use existing RLS and business/attempt scope; only date/release
metadata is projected, not OCR payloads/images or financial records. No migration,
grant, backfill, recognition change or historical summary rewrite.

Only a matching paired shadow ID, legacy lineage, engine and source SHA with a terminal
result can suppress stale handoff controls. Unverified/processing pairs retain the
existing recovery path; legacy processing recovery remains available. Read/display
never triggers handoff or OCR. Shadow fields missing after terminal review say Unknown.

Added actual component/read-adapter regression coverage for these paths, date/build
fallbacks, historical provenance, request races, read denial, parent scope and zero
automatic writes. Existing history/debug and capture-recovery regressions passed;
TypeScript, targeted lint and diff checks passed. Recognition/payment/worker/SQL source
is independently compared against dce3fdf. Full mandatory release checks still required.

Private cause evidence and release checkpoint: C:/Users/robbi/trimax-ocr-diagnostic-display-ops.
Leave check2797 unposted. Financial reconciliation/workbook are complete and untouched.
