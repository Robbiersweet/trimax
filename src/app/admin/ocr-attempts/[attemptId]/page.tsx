import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import Card from "../../../components/Card";
import RecentScans from "../../../components/RecentScans";
import OcrDebugMetadata from "../../../components/OcrDebugMetadata";
import { loadDebugAttempt } from "../../../lib/ocrDebugServer";
import {
  attemptPath,
  debugQueuePath,
  diagnosticsAvailable,
} from "../../../lib/ocrDebug";
export const dynamic = "force-dynamic";
export default async function OcrAttemptDetail({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ business?: string }>;
}) {
  const { attemptId } = await params;
  const search = await searchParams;
  const { attempt, business, family, moreFamily } =
    await loadDebugAttempt(attemptId);
  // Derive workspace from the authorized record, never from a guessed URL workspace.
  if (search.business !== business.slug)
    redirect(attemptPath(attempt.id, business.slug));
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <header>
          <p className="text-sm uppercase tracking-widest text-orange-300">
            {business.name} · Owner/admin
          </p>
          <h1 className="text-3xl font-bold">OCR attempt</h1>
          <p className="mt-2 break-all text-sm">{attempt.id}</p>
        </header>
        <Link
          className="inline-block underline"
          href={debugQueuePath(business.slug)}
        >
          OCR Debug Queue
        </Link>
        <Card>
          <OcrDebugMetadata
            key={attempt.id}
            attempt={attempt}
            businessSlug={business.slug}
          />
        </Card>
        <Card>
          <h2 className="font-bold">Original and retries</h2>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              className="underline"
              href={attemptPath(attempt.original_id, business.slug)}
            >
              Original attempt
            </Link>
            {attempt.parent_id && (
              <Link
                className="underline"
                href={attemptPath(attempt.parent_id, business.slug)}
              >
                Previous attempt
              </Link>
            )}
          </div>
          <ol className="mt-3 space-y-2 text-sm">
            {family.map((item, index) => (
              <li key={item.id}>
                <Link
                  className="break-all underline"
                  href={attemptPath(item.id, business.slug)}
                  aria-current={item.id === attempt.id ? "page" : undefined}
                >
                  {item.parent_id ? `Retry ${index}` : "Original Scan"} ·{" "}
                  {item.result} · {item.id}
                  {item.id === attempt.id ? " (this attempt)" : ""}
                </Link>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-slate-400">
            Compare related attempts by opening their links in separate tabs.
            {moreFamily
              ? " Showing the first 100 attempts; Original and Previous links remain available."
              : ""}
          </p>
        </Card>
        {!diagnosticsAvailable(attempt) && (
          <Card>
            <p>
              {attempt.result === "success"
                ? "Successful scan: only the compact summary is retained."
                : "Verbose diagnostics have expired or were not retained. This permanent summary and its investigation metadata remain available."}
            </p>
          </Card>
        )}
        <Card>
          <RecentScans
            key={attempt.id}
            businessId={business.id}
            businessSlug={business.slug}
            role="admin"
            savedStatus=""
            initialAttempt={attempt}
            standalone
          />
        </Card>
      </div>
    </AppShell>
  );
}
