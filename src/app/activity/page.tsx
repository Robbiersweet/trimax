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

type DetailChip = {
  label: string;
  value: string;
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

function formatDate(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return "";
}

function formatDetailValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return new Intl.NumberFormat("en-US").format(value);
  }

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => String(item))
      .join(", ");
  }

  return String(value);
}

function prettifyKey(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
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
    "invoice.batch_payment_applied": "Batch Payment Applied",
    "invoice.split_created": "Split Invoices Created",
  };

  return labels[action] ?? action;
}

function actionTone(action: string) {
  if (action.includes("payment")) {
    return "text-green-300 border-green-500/30 bg-green-500/10";
  }

  if (action.includes("split")) {
    return "text-orange-300 border-orange-500/30 bg-orange-500/10";
  }

  if (action.startsWith("queue_item")) {
    return "text-sky-300 border-sky-500/30 bg-sky-500/10";
  }

  if (action.startsWith("estimate")) {
    return "text-purple-300 border-purple-500/30 bg-purple-500/10";
  }

  if (action.startsWith("invoice")) {
    return "text-amber-300 border-amber-500/30 bg-amber-500/10";
  }

  return "text-zinc-300 border-zinc-700 bg-zinc-950";
}

function detailChips(log: ActivityLog): DetailChip[] {
  const details = log.details ?? {};

  if (log.action === "invoice.batch_payment_applied") {
    return [
      { label: "Payment Date", value: formatDate(details.paymentDate) },
      { label: "Type", value: formatDetailValue(details.paymentType) },
      { label: "Applied", value: formatMoney(details.amountApplied) },
      {
        label: "Batch Count",
        value: formatDetailValue(details.batchInvoiceCount),
      },
      { label: "Note", value: formatDetailValue(details.internalNote) },
    ].filter((chip) => chip.value.length > 0);
  }

  if (log.action === "invoice.split_created") {
    return [
      { label: "Split Count", value: formatDetailValue(details.splitCount) },
      { label: "Target", value: formatMoney(details.targetAmount) },
      { label: "Subtotal", value: formatMoney(details.subtotalAmount) },
      {
        label: "Created",
        value: formatDetailValue(details.createdInvoiceDisplayIds),
      },
    ].filter((chip) => chip.value.length > 0);
  }

  if (log.action === "queue_item.scheduled") {
    return [
      {
        label: "Work Date",
        value: formatDate(details.scheduledDate),
      },
    ].filter((chip) => chip.value.length > 0);
  }

  if (log.action === "queue_item.completed") {
    return [
      {
        label: "Completed",
        value: formatDate(details.completedDate),
      },
    ].filter((chip) => chip.value.length > 0);
  }

  if (log.action === "estimate.converted_to_invoice") {
    return Object.entries(details)
      .filter((entry) => entry[1] !== null && entry[1] !== undefined)
      .slice(0, 4)
      .map(([key, value]) => ({
        label: prettifyKey(key),
        value: formatDetailValue(value),
      }))
      .filter((chip) => chip.value.length > 0);
  }

  return Object.entries(details)
    .filter((entry) => entry[1] !== null && entry[1] !== undefined)
    .slice(0, 4)
    .map(([key, value]) => ({
      label: prettifyKey(key),
      value:
        key.toLowerCase().includes("date") && typeof value === "string"
          ? formatDate(value)
          : formatDetailValue(value),
    }))
    .filter((chip) => chip.value.length > 0);
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
              const chips = detailChips(log);

              return (
                <div
                  key={log.id}
                  className="grid gap-4 border-b border-zinc-800 p-5 last:border-b-0 md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] ${actionTone(
                        log.action
                      )}`}
                    >
                      {actionLabel(log.action)}
                    </p>

                    <p className="mt-3 text-lg font-semibold">
                      {log.entity_label || log.entity_type}
                    </p>

                    <p className="mt-1 text-sm text-zinc-400">
                      {log.actor_email || "Unknown user"}
                    </p>

                    {chips.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {chips.map((chip) => (
                          <span
                            key={`${log.id}-${chip.label}`}
                            className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300"
                          >
                            <span className="text-zinc-500">
                              {chip.label}:{" "}
                            </span>
                            <span className="font-semibold text-white">
                              {chip.value}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : null}
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
