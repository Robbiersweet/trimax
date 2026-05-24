import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import StatusBadge from "../components/StatusBadge";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type QueueItemWithEstimate = {
  id: string;
  property: string | null;
  unit: string | null;
  status: string | null;
  priority: string | null;
  paint_type: string | null;
  flooring: string | null;
  move_out_date: string | null;
  ready_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  smoked_in: boolean | null;
  notes: string | null;
  linked_estimate_id: string | null;
};

type LinkedEstimate = {
  id: string;
  display_id: string | null;
};

function normalizeStatus(value: string | null) {
  return (value || "Pending Estimate").trim().toLowerCase();
}

function statusLabel(value: string) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function dateValue(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function isReadySoonUnscheduled(item: QueueItemWithEstimate) {
  const readyDate = dateValue(item.ready_date);

  if (!readyDate) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(today.getDate() + 7);

  const status = normalizeStatus(item.status);

  return (
    readyDate >= today &&
    readyDate <= sevenDaysFromNow &&
    !item.scheduled_date &&
    status !== "scheduled" &&
    status !== "completed"
  );
}

function isRemediationItem(item: QueueItemWithEstimate) {
  return (
    Boolean(item.smoked_in) ||
    (item.notes || "").toLowerCase().includes("smok")
  );
}

function needsEstimate(item: QueueItemWithEstimate) {
  const status = normalizeStatus(item.status);

  return (
    !item.linked_estimate_id &&
    !["completed", "invoiced", "paid"].includes(status)
  );
}

function daysUntil(value: string | null) {
  const date = dateValue(value);

  if (!date) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function queueHref(
  businessSlug: string,
  options?: {
    q?: string;
    status?: string;
    view?: string;
  }
) {
  const params = new URLSearchParams({
    business: businessSlug,
  });

  if (options?.q) {
    params.set("q", options.q);
  }

  if (options?.status && options.status !== "all") {
    params.set("status", options.status);
  }

  if (options?.view && options.view !== "all") {
    params.set("view", options.view);
  }

  return `/queue?${params.toString()}`;
}

function viewCopy(view: string) {
  if (view === "ready-soon") {
    return {
      title: "Ready Soon",
      detail:
        "Unscheduled units with ready dates in the next 7 days.",
    };
  }

  if (view === "needs-estimate") {
    return {
      title: "Needs Estimate",
      detail:
        "Queue items without linked estimates that still need review.",
    };
  }

  if (view === "remediation") {
    return {
      title: "Remediation",
      detail:
        "Items flagged for smoker/remediation work or smoke notes.",
    };
  }

  return {
    title: "All Work",
    detail: "All queue items matching the current search and status filters.",
  };
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    q?: string;
    status?: string;
    view?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const searchTerm = resolvedSearchParams.q?.trim() ?? "";
  const statusFilter =
    resolvedSearchParams.status?.trim().toLowerCase() ?? "all";
  const viewFilter =
    resolvedSearchParams.view?.trim().toLowerCase() ?? "all";
  const businessQuery = `?business=${businessSlug}`;
  const activeView = viewCopy(viewFilter);

  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  if (businessError) {
    console.error(businessError);
  }

  const selectedBusiness = businessData as Business | null;

  let queueItems: QueueItemWithEstimate[] = [];

  if (selectedBusiness?.id) {
    const { data, error } = await supabase
      .from("queue_items")
      .select("*")
      .eq("business_id", selectedBusiness.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
    }

    queueItems = (data ?? []) as QueueItemWithEstimate[];
  }

  const linkedEstimateIds = queueItems
    .map((item) => item.linked_estimate_id)
    .filter((id): id is string => Boolean(id));

  let linkedEstimates: LinkedEstimate[] = [];

  if (linkedEstimateIds.length > 0) {
    const { data } = await supabase
      .from("estimates")
      .select("id, display_id")
      .in("id", linkedEstimateIds);

    linkedEstimates = data ?? [];
  }

  const estimateById = new Map(
    linkedEstimates.map((estimate) => [estimate.id, estimate])
  );

  const statuses = Array.from(
    new Set(queueItems.map((item) => normalizeStatus(item.status)))
  ).sort((first, second) => first.localeCompare(second));

  const statusCounts = queueItems.reduce(
    (counts, item) => {
      const status = normalizeStatus(item.status);
      counts.set(status, (counts.get(status) ?? 0) + 1);
      return counts;
    },
    new Map<string, number>()
  );

  const readySoonCount = queueItems.filter(isReadySoonUnscheduled).length;
  const remediationCount = queueItems.filter(isRemediationItem).length;
  const needsEstimateCount = queueItems.filter(needsEstimate).length;

  const filteredQueueItems = queueItems.filter((item) => {
    if (
      statusFilter !== "all" &&
      normalizeStatus(item.status) !== statusFilter
    ) {
      return false;
    }

    if (viewFilter === "ready-soon" && !isReadySoonUnscheduled(item)) {
      return false;
    }

    if (viewFilter === "remediation" && !isRemediationItem(item)) {
      return false;
    }

    if (viewFilter === "needs-estimate" && !needsEstimate(item)) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    const searchableText = [
      item.property,
      item.unit,
      item.status,
      item.priority,
      item.paint_type,
      item.flooring,
      item.move_out_date,
      item.ready_date,
      item.scheduled_date,
      item.completed_date,
      item.notes,
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(searchTerm.toLowerCase());
  });

  const statusLinks = [
    {
      label: "All",
      value: "all",
      count: queueItems.length,
    },
    ...statuses.map((status) => ({
      label: statusLabel(status),
      value: status,
      count: statusCounts.get(status) ?? 0,
    })),
  ];

  const specialViewLinks = [
    {
      label: "All Work",
      value: "all",
      count: queueItems.length,
    },
    {
      label: "Ready Soon",
      value: "ready-soon",
      count: readySoonCount,
    },
    {
      label: "Needs Estimate",
      value: "needs-estimate",
      count: needsEstimateCount,
    },
    {
      label: "Remediation",
      value: "remediation",
      count: remediationCount,
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-3 text-5xl font-bold">Work Queue</h1>

            <p className="mt-3 text-zinc-400">
              Showing queue items for{" "}
              {selectedBusiness?.name ?? "selected business"}.
            </p>
          </div>

          <Link href={`/new-request${businessQuery}`}>
            <Button>+ New Queue Item</Button>
          </Link>
        </div>

        <Card>
          <form
            action="/queue"
            className="grid gap-4 md:grid-cols-[1fr_auto]"
          >
            <input type="hidden" name="business" value={businessSlug} />

            {statusFilter !== "all" ? (
              <input type="hidden" name="status" value={statusFilter} />
            ) : null}

            {viewFilter !== "all" ? (
              <input type="hidden" name="view" value={viewFilter} />
            ) : null}

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Search Queue
              </label>

              <input
                name="q"
                defaultValue={searchTerm}
                placeholder="Search property, unit, paint, flooring, date, or notes"
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div className="flex items-end gap-3">
              <Button>Search</Button>

              {(searchTerm ||
                statusFilter !== "all" ||
                viewFilter !== "all") && (
                <Link href={`/queue${businessQuery}`}>
                  <Button variant="secondary">Clear</Button>
                </Link>
              )}
            </div>
          </form>
        </Card>

        <div className="flex flex-wrap gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-2">
          {specialViewLinks.map((filter) => (
            <Link
              key={filter.value}
              href={queueHref(businessSlug, {
                q: searchTerm,
                status: statusFilter,
                view: filter.value,
              })}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                viewFilter === filter.value
                  ? "bg-orange-500 text-black"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <span>{filter.label}</span>
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  viewFilter === filter.value
                    ? "bg-black/15 text-black"
                    : "bg-zinc-950 text-zinc-400"
                }`}
              >
                {filter.count}
              </span>
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-2">
          {statusLinks.map((filter) => (
            <Link
              key={filter.value}
              href={queueHref(businessSlug, {
                q: searchTerm,
                status: filter.value,
                view: viewFilter,
              })}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                statusFilter === filter.value
                  ? "bg-orange-500 text-black"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <span>{filter.label}</span>
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  statusFilter === filter.value
                    ? "bg-black/15 text-black"
                    : "bg-zinc-950 text-zinc-400"
                }`}
              >
                {filter.count}
              </span>
            </Link>
          ))}
        </div>

        <Card className="border-orange-500/30 bg-orange-500/5 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Current Queue View
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {activeView.title}
              </h2>
              <p className="mt-2 text-zinc-400">{activeView.detail}</p>
            </div>

            <p className="text-sm text-zinc-400">
              Showing {filteredQueueItems.length} of {queueItems.length}{" "}
              queue items.
            </p>
          </div>
        </Card>

        <div className="grid gap-6">
          {queueItems.length === 0 ? (
            <Card>
              <p className="text-zinc-400">
                No queue items for this business yet.
              </p>
            </Card>
          ) : filteredQueueItems.length === 0 ? (
            <Card>
              <p className="text-zinc-400">
                No queue items match those filters.
              </p>
            </Card>
          ) : (
            filteredQueueItems.map((item) => {
              const linkedEstimate = item.linked_estimate_id
                ? estimateById.get(item.linked_estimate_id)
                : null;
              const readySoon = isReadySoonUnscheduled(item);
              const remediation = isRemediationItem(item);
              const estimateNeeded = needsEstimate(item);
              const readyDays = daysUntil(item.ready_date);

              return (
                <Card key={item.id}>
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-semibold">
                          {item.property || "Unknown Property"}
                        </h2>

                        <StatusBadge
                          status={item.status ?? "Pending Estimate"}
                        />

                        {item.priority ? (
                          <span className="rounded-full bg-zinc-950 px-3 py-1 text-sm font-semibold text-zinc-300">
                            {item.priority} Priority
                          </span>
                        ) : null}

                        {item.smoked_in ? (
                          <span className="rounded-full bg-red-500/20 px-3 py-1 text-sm font-semibold text-red-300">
                            Remediation
                          </span>
                        ) : null}

                        {!item.smoked_in && remediation ? (
                          <span className="rounded-full bg-red-500/20 px-3 py-1 text-sm font-semibold text-red-300">
                            Smoke Note
                          </span>
                        ) : null}

                        {readySoon ? (
                          <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-sm font-semibold text-yellow-200">
                            Ready Soon
                          </span>
                        ) : null}

                        {estimateNeeded ? (
                          <span className="rounded-full bg-purple-500/20 px-3 py-1 text-sm font-semibold text-purple-200">
                            Needs Estimate
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-2 text-zinc-400">
                        Unit {item.unit || "-"}
                      </p>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <LifecyclePill
                          label="Move Out"
                          value={item.move_out_date}
                        />
                        <LifecyclePill
                          label="Ready"
                          value={item.ready_date}
                          detail={
                            readySoon && readyDays !== null
                              ? `${readyDays} day${
                                  readyDays === 1 ? "" : "s"
                                } out`
                              : undefined
                          }
                          alert={readySoon}
                        />
                        <LifecyclePill
                          label="Scheduled"
                          value={item.scheduled_date}
                        />
                      </div>

                      <div className="mt-5 grid gap-4 text-sm text-zinc-300 md:grid-cols-2">
                        <Info label="Paint Type" value={item.paint_type} />
                        <Info label="Flooring" value={item.flooring} />
                        <Info
                          label="Completed Date"
                          value={item.completed_date}
                        />
                        <Info
                          label="Linked Estimate"
                          value={linkedEstimate?.display_id ?? null}
                        />
                      </div>

                      <p className="mt-5 max-w-2xl text-zinc-400">
                        {item.notes || "No notes added."}
                      </p>

                      {linkedEstimate ? (
                        <p className="mt-4 text-sm text-purple-300">
                          Linked Estimate:{" "}
                          {linkedEstimate.display_id ?? "Estimate"}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                      <Link href={`/queue/${item.id}${businessQuery}`}>
                        <Button>Open Queue Item</Button>
                      </Link>

                      {linkedEstimate ? (
                        <Link
                          href={`/estimates/${linkedEstimate.id}${businessQuery}`}
                        >
                          <Button variant="secondary">Open Estimate</Button>
                        </Link>
                      ) : (
                        <Link
                          href={`/estimates/new?queueId=${item.id}&business=${businessSlug}`}
                        >
                          <Button variant="secondary">Create Estimate</Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <p className="text-zinc-500">{label}</p>
      <p>{value || "-"}</p>
    </div>
  );
}

function LifecyclePill({
  label,
  value,
  detail,
  alert = false,
}: {
  label: string;
  value: string | null;
  detail?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        alert
          ? "border-yellow-500/40 bg-yellow-500/10"
          : value
          ? "border-orange-500/30 bg-orange-500/10"
          : "border-zinc-800 bg-zinc-950"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 font-semibold text-zinc-100">
        {value || "-"}
      </p>
      {detail ? (
        <p className="mt-1 text-xs font-semibold text-yellow-200">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
