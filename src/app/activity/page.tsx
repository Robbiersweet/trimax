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
    "invoice.email_sent": "Invoice Emailed",
    "invoice.payment_reminder_sent": "Payment Reminder Sent",
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

  const activityPulse = useMemo(() => {
    const latestTimestamp = logs.reduce((latest, log) => {
      if (!log.created_at) {
        return latest;
      }

      const timestamp = new Date(log.created_at).getTime();

      return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
    }, 0);
    const sevenDaysAgo = latestTimestamp - 7 * 24 * 60 * 60 * 1000;
    const recentCount = logs.filter((log) => {
      if (!log.created_at || latestTimestamp === 0) {
        return false;
      }

      const timestamp = new Date(log.created_at).getTime();

      return Number.isFinite(timestamp) && timestamp >= sevenDaysAgo;
    }).length;
    const paymentCount = logs.filter((log) => activityMatchesType(log, "payment")).length;
    const reminderCount = logs.filter((log) =>
      log.action.includes("reminder") || log.action.includes("email_sent")
    ).length;
    const latestLog = logs[0];

    return [
      {
        label: "Total Trail",
        value: String(logs.length),
        detail: "All recorded workspace actions",
        href: activityFilterHref({ businessSlug, filter: "all", searchTerm: "" }),
      },
      {
        label: "Last 7 Days",
        value: String(recentCount),
        detail: "Recent changes and sends",
        href: activityFilterHref({ businessSlug, filter: "all", searchTerm: "" }),
      },
      {
        label: "Payment Proof",
        value: String(paymentCount),
        detail: "Checks and payment actions",
        href: activityFilterHref({ businessSlug, filter: "payment", searchTerm: "" }),
      },
      {
        label: "Send History",
        value: String(reminderCount),
        detail: latestLog
          ? `Latest: ${actionLabel(latestLog.action)}`
          : "Invoice emails and reminders",
        href: activityFilterHref({ businessSlug, filter: "invoice", searchTerm: "" }),
      },
    ];
  }, [businessSlug, logs]);

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

        <Card className="activity-command-card border-sky-500/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-slate-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
                Proof Center
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                Find the paper trail fast
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                Every sent invoice, reminder, payment, split, estimate, and
                queue move should leave a clean trail here for follow-up and
                accountability.
              </p>
            </div>

            <Link
              href={`/reports?business=${businessSlug}`}
              className="app-button-primary inline-flex rounded-2xl px-5 py-3 text-sm font-black"
            >
              Open Reports
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {activityPulse.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="activity-pulse-card rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:-translate-y-0.5 hover:border-sky-300/60"
              >
                <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-200">
                  {item.label}
                </p>

                <p className="mt-3 text-3xl font-black text-white">
                  {item.value}
                </p>

                <p className="mt-2 text-sm leading-5 text-zinc-400">
                  {item.detail}
                </p>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <form action="/activity" className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input type="hidden" name="business" value={businessSlug} />
              {typeFilter !== "all" ? (
                <input type="hidden" name="type" value={typeFilter} />
              ) : null}

              <label className="block">
                <span className="app-form-label mb-2 block text-sm text-zinc-400">
                  Search activity
                </span>
                <input
                  name="q"
                  defaultValue={searchTerm}
                  placeholder="Search invoice number, client, check #, user, notes..."
                  className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-orange-500"
                />
              </label>

              <button
                type="submit"
                className="app-button-primary rounded-2xl px-6 py-3 font-bold md:self-end"
              >
                Search
              </button>
            </form>

            <div className="app-soft-panel rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-400">
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
                      ? "app-chip-active bg-orange-500 text-black"
                      : "app-chip bg-zinc-950 text-zinc-200 hover:bg-zinc-800"
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
          <Card className="app-empty-state border-sky-200 bg-sky-50">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-700">
                  Clean Slate
                </p>

                <h2 className="mt-2 text-2xl font-black text-slate-950">
                  Activity will appear here automatically
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  New queue, estimate, invoice, payment, email, and split
                  actions will build a searchable workspace trail as you work.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`/queue?business=${businessSlug}`}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-black text-slate-800 shadow-sm transition hover:border-sky-300 hover:bg-sky-50"
                >
                  Open Queue
                </Link>
                <Link
                  href={`/invoices?business=${businessSlug}`}
                  className="app-button-primary rounded-2xl px-5 py-3 text-center text-sm font-black"
                >
                  Open Invoices
                </Link>
              </div>
            </div>
          </Card>
        ) : filteredLogs.length === 0 ? (
          <Card className="app-empty-state border-dashed border-slate-300 bg-white">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">
                  Search Check
                </p>

                <h2 className="mt-2 text-2xl font-black text-slate-950">
                  No activity matches this view
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Try a broader search or return to the full activity trail to
                  verify the latest invoices, reminders, payments, and queue
                  updates.
                </p>
              </div>

              <Link
                href={activityFilterHref({
                  businessSlug,
                  filter: "all",
                  searchTerm: "",
                })}
                className="app-button-primary inline-flex rounded-2xl px-5 py-3 text-center text-sm font-black"
              >
                Show All Activity
              </Link>
            </div>
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
