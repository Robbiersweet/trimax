import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type ActivityLog = {
  id: string;
  business_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "queue_item.created": "Queue Item Created",
    "queue_item.scheduled": "Queue Item Scheduled",
    "queue_item.completed": "Queue Item Completed",
    "estimate.created": "Estimate Created",
    "estimate.updated": "Estimate Updated",
    "estimate.converted_to_invoice": "Estimate Converted",
    "invoice.created": "Invoice Created",
    "invoice.updated": "Invoice Updated",
    "invoice.status_updated": "Invoice Status Updated",
    "invoice.split_created": "Split Invoices Created",
  };

  return labels[action] ?? action;
}

function entityHref(log: ActivityLog, businessSlug: string) {
  if (!log.entity_id) {
    return null;
  }

  if (log.entity_type === "queue_item") {
    return `/queue/${log.entity_id}?business=${businessSlug}`;
  }

  if (log.entity_type === "estimate") {
    return `/estimates/${log.entity_id}?business=${businessSlug}`;
  }

  if (log.entity_type === "invoice") {
    return `/invoices/${log.entity_id}?business=${businessSlug}`;
  }

  return null;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams?: Promise<{ business?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug =
    resolvedSearchParams.business ?? "rnl-creations";

  const { data: businessData } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  const business = businessData as Business | null;

  let logs: ActivityLog[] = [];
  let setupNeeded = false;

  if (business?.id) {
    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error(error);
      setupNeeded = true;
    } else {
      logs = (data ?? []) as ActivityLog[];
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Operations Memory
          </p>

          <h1 className="mt-3 text-4xl font-bold">Activity Log</h1>

          <p className="mt-3 max-w-3xl text-zinc-400">
            A running history of important queue, estimate, invoice, payment,
            and split-invoice actions for {business?.name ?? "this business"}.
          </p>
        </div>

        {setupNeeded ? (
          <Card className="border-yellow-500/40 bg-yellow-500/10">
            <p className="font-semibold text-yellow-100">
              Activity logging table is not set up yet.
            </p>

            <p className="mt-2 text-sm leading-6 text-yellow-100/80">
              Run the activity_logs SQL in Supabase, then this page will start
              showing future actions.
            </p>
          </Card>
        ) : logs.length === 0 ? (
          <Card>
            <p className="text-zinc-400">
              No activity has been recorded for this business yet.
            </p>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
            {logs.map((log) => {
              const href = entityHref(log, businessSlug);

              return (
                <div
                  key={log.id}
                  className="grid gap-4 border-b border-zinc-800 p-5 last:border-b-0 md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="text-sm uppercase tracking-[0.25em] text-orange-400">
                      {actionLabel(log.action)}
                    </p>

                    <p className="mt-2 text-lg font-semibold">
                      {log.entity_label || log.entity_type}
                    </p>

                    <p className="mt-1 text-sm text-zinc-400">
                      {log.actor_email || "Unknown user"}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 md:items-end">
                    <p className="text-sm text-zinc-400">
                      {formatDateTime(log.created_at)}
                    </p>

                    {href ? (
                      <Link
                        href={href}
                        className="text-sm font-semibold text-orange-400"
                      >
                        Open item
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
