import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import OcrShadowControls from '../../components/OcrShadowControls';
import { loadDebugQueue } from "../../lib/ocrDebugServer";
import {
  attemptPath,
  debugTimestamp,
  debugQueuePath,
  debugFilters,
  parseDebugFilter,
} from "../../lib/ocrDebug";
export const dynamic = "force-dynamic";
export default async function OcrDebugQueue({
  searchParams,
}: {
  searchParams: Promise<{
    business?: string;
    filter?: string;
    before?: string;
    beforeId?: string;
  }>;
}) {
  const params = await searchParams,
    businessSlug = params.business ?? "rnl-creations",
    filter = parseDebugFilter(params.filter);
  const { business, attempts, hasMore } = await loadDebugQueue(
    businessSlug,
    filter,
    params.before,
    params.beforeId,
  );
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <header>
          <p className="text-sm uppercase tracking-widest text-orange-300">
            {business.name} · Owner/admin
          </p>
          <h1 className="text-3xl font-bold">OCR Debug Queue</h1>
          <p className="mt-2 text-sm text-slate-300">
            Saved scan evidence for investigation. No OCR or payment decisions
            are changed here.
          </p>
        </header>
        <OcrShadowControls businessId={business.id}/>
        <Link
          href={`/payments?business=${encodeURIComponent(business.slug)}`}
          className="inline-block underline"
        >
          Payments / Recent Scans
        </Link>
        <nav aria-label="Debug queue filters" className="flex flex-wrap gap-2">
          {debugFilters.map((value) => (
            <Link
              key={value}
              href={debugQueuePath(business.slug, value)}
              aria-current={filter === value ? "page" : undefined}
              className={`rounded-xl border px-3 py-2 text-sm ${filter === value ? "border-orange-300 bg-orange-400/15" : "border-white/20"}`}
            >
              {value}
            </Link>
          ))}
        </nav>
        <p className="text-sm text-slate-400">
          Newest first · summaries only · {filter}
        </p>
        {!attempts.length && (
          <Card>
            <p>No attempts match this filter.</p>
          </Card>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {attempts.map((attempt) => (
            <Card key={attempt.id}>
              <Link
                href={attemptPath(attempt.id, business.slug)}
                className="block space-y-2"
                aria-label={`Inspect ${attempt.result} attempt ${attempt.id}`}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>
                    {attempt.summary.ocrEngine === 'v2-shadow' ? 'V2 shadow · ' : 'Legacy · '}
                    {attempt.result} ·{" "}
                    {attempt.parent_id ? "Retry" : "Original Scan"}
                  </strong>
                  <span>
                    {attempt.debug_status}
                    {attempt.pinned ? " · Pinned" : ""}
                  </span>
                </div>
                <p className="text-sm">{debugTimestamp(attempt.created_at)}</p>
                <p className="break-all text-xs">Attempt {attempt.id}</p>
                <p className="break-all text-xs">
                  Build {attempt.summary.build}
                </p>
                <p className="text-sm">
                  Source: {attempt.summary.inputSource} /{" "}
                  {attempt.summary.selectedSource}
                </p>
                <p className="text-sm">
                  Check {attempt.summary.checkNumber ?? "unknown"} · Total{" "}
                  {attempt.summary.documentTotal == null
                    ? "unknown"
                    : `$${attempt.summary.documentTotal.toFixed(2)}`}
                </p>
                <p className="text-sm">
                  {attempt.summary.invoicesResolved}/
                  {attempt.summary.rowsDetected} invoices resolved ·{" "}
                  {attempt.summary.reconciled
                    ? "Reconciled"
                    : "Needs reconciliation review"}
                </p>
                <p className="text-sm text-amber-200">
                  {attempt.summary.captureState==='image_stored'?'Capture saved — processing pending':attempt.summary.shadowHandoffState==='handoff_pending'?'Capture saved — shadow processing pending':attempt.summary.reasons[0] ?? "No blockers recorded."}
                </p>
              </Link>
            </Card>
          ))}
        </div>
        <div className="flex gap-4">
          {params.before && (
            <Link
              className="underline"
              href={debugQueuePath(business.slug, filter)}
            >
              Newest attempts
            </Link>
          )}
          {hasMore && (
            <Link
              className="underline"
              href={debugQueuePath(business.slug, filter, attempts.at(-1))}
            >
              Older attempts
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}
