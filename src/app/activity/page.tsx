"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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

type ActivityTypeFilter =
  | "all"
  | "queue"
  | "estimate"
  | "invoice"
  | "payment"
  | "split";

const activityFilters: Array<{ label: string; value: ActivityTypeFilter }> = [
  { label: "All", value: "all" },
  { label: "Queue", value: "queue" },
  { label: "Estimates", value: "estimate" },
  { label: "Invoices", value: "invoice" },
  { label: "Payments", value: "payment" },
  { label: "Splits", value: "split" },
];

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
    "estimate.deleted": "Estimate Deleted",
    "invoice.created": "Invoice Created",
    "invoice.updated": "Invoice Updated",
    "invoice.status_updated": "Invoice Status Updated",
    "invoice.batch_payment_applied": "Batch Payment Applied",
    "invoice.recurring_draft_created": "Recurring Draft Created",
    "invoice.split_created": "Split Invoices Created",
    "access_request.created": "Access Request Created",
    "import.clients_csv_completed": "Client CSV Import",
    "import.invoices_csv_completed": "Invoice CSV Import",
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

  if (action.startsWith("access_request")) {
    return "text-orange-300 border-orange-500/30 bg-orange-500/10";
  }

  if (action.startsWith("import")) {
    return "text-green-300 border-green-500/30 bg-green-500/10";
  }

  return "text-zinc-300 border-zinc-700 bg-zinc-950";
}

function detailChips(log: ActivityLog): DetailChip[] {
  const details = log.details ?? {};

  if (log.action === "invoice.batch_payment_applied") {
    return [
      { label: "Payment Date", value: formatDate(details.paymentDate) },
      { label: "Type", value: formatDetailValue(details.paymentType) },
      {
        label: "Reference",
        value: formatDetailValue(details.paymentReference),
      },
      { label: "Check Amount", value: formatMoney(details.checkAmount) },
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

function normalizeActivityFilter(value: string | undefined): ActivityTypeFilter {
  if (
    value === "queue" ||
    value === "estimate" ||
    value === "invoice" ||
    value === "payment" ||
    value === "split"
  ) {
    return value;
  }

  return "all";
}

function activityMatchesType(log: ActivityLog, filter: ActivityTypeFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "payment") {
    return log.action.includes("payment");
  }

  if (filter === "split") {
    return log.action.includes("split");
  }

  if (filter === "queue") {
    return log.action.startsWith("queue_item") || log.entity_type === "queue_item";
  }

  return log.action.startsWith(filter) || log.entity_type === filter;
}

function searchableActivityText(log: ActivityLog) {
  return [
    actionLabel(log.action),
    log.action,
    log.entity_type,
    log.entity_label,
    log.actor_email,
    JSON.stringify(log.details ?? {}),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function activityFilterHref({
  businessSlug,
  filter,
  searchTerm,
}: {
  businessSlug: string;
  filter: ActivityTypeFilter;
  searchTerm: string;
}) {
  const params = new URLSearchParams({ business: businessSlug });

  if (filter !== "all") {
    params.set("type", filter);
  }

  if (searchTerm.length > 0) {
    params.set("q", searchTerm);
  }

  return `/activity?${params.toString()}`;
}

function ActivityPageContent() {
  const searchParams = useSearchParams();
  const businessSlug = searchParams.get("business") ?? "rnl-creations";
  const searchTerm = (searchParams.get("q") ?? "").trim();
  const typeFilter = normalizeActivityFilter(
    searchParams.get("type") ?? undefined
  );
  const [business, setBusiness] = useState<Business | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadActivity() {
      setLoading(true);
      setSetupNeeded(false);

      const { data: businessData, error: businessError } = await supabase
        .from("businesses")
        .select("id, name, slug")
        .eq("slug", businessSlug)
        .limit(1)
        .maybeSingle();

      if (!active) {
        return;
      }

      if (businessError) {
        console.warn("Activity workspace lookup failed:", businessError.message);
        setBusiness(null);
        setLogs([]);
        setSetupNeeded(true);
        setLoading(false);
        return;
      }

      const selectedBusiness = businessData as Business | null;
      setBusiness(selectedBusiness);

      if (!selectedBusiness?.id) {
        setLogs([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("business_id", selectedBusiness.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!active) {
        return;
      }

      if (error) {
        console.warn("Activity logs could not be loaded:", error.message);
        setLogs([]);
        setSetupNeeded(true);
      } else {
        setLogs((data ?? []) as ActivityLog[]);
      }

      setLoading(false);
    }

    loadActivity();

    return () => {
      active = false;
    };
  }, [businessSlug]);

  const filteredLogs = useMemo(() => logs.filter((log) => {
    if (!activityMatchesType(log, typeFilter)) {
      return false;
    }

    if (searchTerm.length === 0) {
      return true;
    }

    return searchableActivityText(log).includes(searchTerm.toLowerCase());
  }), [logs, searchTerm, typeFilter]);

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

        <Card>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <form action="/activity" className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input type="hidden" name="business" value={businessSlug} />
              {typeFilter !== "all" ? (
                <input type="hidden" name="type" value={typeFilter} />
              ) : null}

              <label className="block">
                <span className="mb-2 block text-sm text-zinc-400">
                  Search activity
                </span>
                <input
                  name="q"
                  defaultValue={searchTerm}
                  placeholder="Search invoice number, client, check #, user, notes..."
                  className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-orange-500"
                />
              </label>

              <button
                type="submit"
                className="rounded-2xl bg-orange-500 px-6 py-3 font-bold text-black hover:bg-orange-400 md:self-end"
              >
                Search
              </button>
            </form>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-400">
              Showing{" "}
              <span className="font-bold text-white">{filteredLogs.length}</span>{" "}
              of <span className="font-bold text-white">{logs.length}</span>{" "}
              records
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {activityFilters.map((filter) => {
              const active = filter.value === typeFilter;

              return (
                <Link
                  key={filter.value}
                  href={activityFilterHref({
                    businessSlug,
                    filter: filter.value,
                    searchTerm,
                  })}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    active
                      ? "bg-orange-500 text-black"
                      : "bg-zinc-950 text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  {filter.label}
                </Link>
              );
            })}

            {searchTerm.length > 0 ? (
              <Link
                href={activityFilterHref({
                  businessSlug,
                  filter: typeFilter,
                  searchTerm: "",
                })}
                className="app-chip rounded-full border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-300 hover:border-orange-500 hover:text-orange-300"
              >
                Clear search
              </Link>
            ) : null}
          </div>
        </Card>

        {loading ? (
          <Card>
            <p className="font-semibold text-white">Loading activity...</p>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Checking the latest history for this workspace.
            </p>
          </Card>
        ) : setupNeeded ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <p className="font-semibold text-amber-200">
              Activity tracking setup needs one more step.
            </p>

            <p className="mt-2 text-sm leading-6 text-amber-100/90">
              Once the activity setup is finished, this page will start
              showing new queue, estimate, invoice, payment, and split
              actions.
            </p>
          </Card>
        ) : logs.length === 0 ? (
          <Card>
            <p className="font-semibold text-white">
              No activity has been recorded for this workspace yet.
            </p>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              New queue, estimate, invoice, payment, and split actions will
              appear here as they are created in this workspace.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/queue?business=${businessSlug}`}
                className="rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-orange-400"
              >
                Open Queue
              </Link>
              <Link
                href={`/invoices?business=${businessSlug}`}
                className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:border-orange-400 hover:text-orange-300"
              >
                Open Invoices
              </Link>
            </div>
          </Card>
        ) : filteredLogs.length === 0 ? (
          <Card>
            <p className="font-semibold text-white">No matching activity found.</p>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Try a different search term or switch back to All.
            </p>

            <Link
              href={activityFilterHref({
                businessSlug,
                filter: "all",
                searchTerm: "",
              })}
              className="mt-5 inline-flex rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-orange-400"
            >
              Show All Activity
            </Link>
          </Card>
        ) : (
          <div className="app-data-table overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            {filteredLogs.map((log) => {
              const href = entityHref(log, businessSlug);
              const chips = detailChips(log);

              return (
                <div
                  key={log.id}
                  className="app-data-table-row grid gap-4 border-b border-zinc-800 p-5 last:border-b-0 md:grid-cols-[1fr_auto]"
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
                            className="app-chip rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300"
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

export default function ActivityPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <Card>
            <p className="text-zinc-400">Loading activity...</p>
          </Card>
        </AppShell>
      }
    >
      <ActivityPageContent />
    </Suspense>
  );
}
