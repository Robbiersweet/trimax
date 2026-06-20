import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import StatusBadge from "../components/StatusBadge";
import RoleVisible from "../components/RoleVisible";
import { supabase } from "../lib/supabase";
import { maybeCanonicalApartmentUnitLabel } from "../utils/unitLabels";

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
  unit_layout: string | null;
  wall_paint_color: string | null;
  flooring: string | null;
  move_out_date: string | null;
  ready_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  smoked_in: boolean | null;
  prior_renovation: boolean | null;
  prior_renovation_details: string | null;
  renovation_needed: boolean | null;
  renovation_needed_details: string | null;
  notes: string | null;
  linked_estimate_id: string | null;
};

type LinkedEstimate = {
  id: string;
  display_id: string | null;
};

type QueueJobSession = {
  id: string;
  queue_item_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  total_minutes: number | null;
};

type QueueJobSessionBreakdown = {
  id: string;
  job_session_id: string;
};

function normalizeStatus(value: string | null) {
  return (value || "Pending Estimate").trim().toLowerCase();
}

function propertyKey(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function isClosedQueueItem(item: QueueItemWithEstimate) {
  const status = normalizeStatus(item.status);

  return (
    status === "completed" ||
    status === "invoiced" ||
    status === "paid" ||
    Boolean(item.completed_date)
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

function minutesBetween(startedAt: string | null, endedAt: string | null) {
  if (!startedAt) {
    return 0;
  }

  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }

  return Math.round((end - start) / 60000);
}

function formatSessionMinutes(minutes: number) {
  if (minutes <= 0) {
    return "0m";
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours <= 0) {
    return `${remainder}m`;
  }

  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function queueHref(
  businessSlug: string,
  options?: {
    property?: string;
    q?: string;
    status?: string;
    view?: string;
  }
) {
  const params = new URLSearchParams({
    business: businessSlug,
  });

  if (options?.property && options.property !== "all") {
    params.set("property", options.property);
  }

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
      title: "R&L Start Soon",
      detail:
        "Unscheduled units with a paint due date in the next 7 days.",
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

  if (view === "history") {
    return {
      title: "All History",
      detail:
        "Active and completed queue records saved for reporting and unit history.",
    };
  }

  return {
    title: "Active Work",
    detail:
      "Open queue items that still need estimate, scheduling, invoice, or completion attention.",
  };
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    property?: string;
    q?: string;
    status?: string;
    view?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const propertyFilter =
    resolvedSearchParams.property?.trim().toLowerCase() ?? "all";
  const searchTerm = resolvedSearchParams.q?.trim() ?? "";
  const statusFilter =
    resolvedSearchParams.status?.trim().toLowerCase() ?? "all";
  const viewFilter =
    resolvedSearchParams.view?.trim().toLowerCase() ?? "all";
  const businessQuery =
    propertyFilter === "all"
      ? `?business=${businessSlug}`
      : `?business=${businessSlug}&property=${propertyFilter}`;
  const activeView = viewCopy(viewFilter);

  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  let queueLoadMessage = businessError
    ? "Workspace details could not be loaded. Try signing in again, then reopen this workspace."
    : null;

  if (businessError) {
    console.warn("Queue workspace lookup failed:", businessError.message);
  }

  const selectedBusiness = businessData as Business | null;

  let queueItems: QueueItemWithEstimate[] = [];
  let jobSessions: QueueJobSession[] = [];
  let jobSessionBreakdowns: QueueJobSessionBreakdown[] = [];

  if (selectedBusiness?.id) {
    const [queueResponse, jobSessionResponse, jobBreakdownResponse] =
      await Promise.all([
        supabase
          .from("queue_items")
          .select(
            "id, property, unit, status, priority, paint_type, unit_layout, wall_paint_color, flooring, move_out_date, ready_date, scheduled_date, completed_date, smoked_in, prior_renovation, prior_renovation_details, renovation_needed, renovation_needed_details, notes, linked_estimate_id"
          )
          .eq("business_id", selectedBusiness.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("job_sessions")
          .select("id, queue_item_id, started_at, ended_at, total_minutes")
          .eq("business_id", selectedBusiness.id),
        supabase
          .from("job_session_breakdowns")
          .select("id, job_session_id")
          .eq("business_id", selectedBusiness.id),
      ]);

    if (queueResponse.error) {
      console.warn("Queue items could not be loaded:", queueResponse.error.message);
      queueLoadMessage =
        "Queue items could not be loaded. Try signing in again; if this stays here, the queue access settings need attention.";
    }

    if (jobSessionResponse.error) {
      console.warn(
        "Queue job sessions could not be loaded:",
        jobSessionResponse.error.message
      );
    }

    if (jobBreakdownResponse.error) {
      console.warn(
        "Queue job session breakdowns could not be loaded:",
        jobBreakdownResponse.error.message
      );
    }

    queueItems = (queueResponse.data ?? []) as QueueItemWithEstimate[];
    jobSessions = (jobSessionResponse.data ?? []) as QueueJobSession[];
    jobSessionBreakdowns =
      (jobBreakdownResponse.data ?? []) as QueueJobSessionBreakdown[];
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
  const breakdownSessionIds = new Set(
    jobSessionBreakdowns.map((breakdown) => breakdown.job_session_id)
  );
  const sessionsByQueueItemId = jobSessions.reduce((map, session) => {
    if (!session.queue_item_id) {
      return map;
    }

    const current = map.get(session.queue_item_id) ?? [];
    current.push(session);
    map.set(session.queue_item_id, current);

    return map;
  }, new Map<string, QueueJobSession[]>());

  const propertyScopedQueueItems = queueItems.filter((item) => {
    if (propertyFilter === "all") {
      return true;
    }

    return propertyKey(item.property) === propertyFilter;
  });
  const activePropertyLabel =
    propertyFilter === "all"
      ? "all properties"
      : propertyScopedQueueItems[0]?.property ?? "selected property";

  const statuses = Array.from(
    new Set(
      propertyScopedQueueItems.map((item) =>
        normalizeStatus(item.status)
      )
    )
  ).sort((first, second) => first.localeCompare(second));

  const statusCounts = propertyScopedQueueItems.reduce(
    (counts, item) => {
      const status = normalizeStatus(item.status);
      counts.set(status, (counts.get(status) ?? 0) + 1);
      return counts;
    },
    new Map<string, number>()
  );

  const readySoonCount = propertyScopedQueueItems.filter(
    isReadySoonUnscheduled
  ).length;
  const remediationCount = propertyScopedQueueItems.filter(
    (item) => !isClosedQueueItem(item) && isRemediationItem(item)
  ).length;
  const needsEstimateCount =
    propertyScopedQueueItems.filter(needsEstimate).length;
  const activeWorkCount = propertyScopedQueueItems.filter(
    (item) => !isClosedQueueItem(item)
  ).length;

  const filteredQueueItems = propertyScopedQueueItems.filter((item) => {
    if (
      viewFilter !== "history" &&
      statusFilter === "all" &&
      isClosedQueueItem(item)
    ) {
      return false;
    }

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
      maybeCanonicalApartmentUnitLabel(item.unit),
      item.status,
      item.priority,
      item.paint_type,
      item.unit_layout,
      item.wall_paint_color,
      item.flooring,
      item.move_out_date,
      item.ready_date,
      item.scheduled_date,
      item.completed_date,
      item.prior_renovation_details,
      item.renovation_needed_details,
      item.renovation_needed ? "renovation needed" : "",
      item.prior_renovation ? "prior renovation" : "",
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
      icon: "A",
      count:
        viewFilter === "history"
          ? propertyScopedQueueItems.length
          : activeWorkCount,
    },
    ...statuses.map((status) => ({
      label: statusLabel(status),
      value: status,
      icon: queueFilterIcon(statusLabel(status)),
      count: statusCounts.get(status) ?? 0,
    })),
  ];

  const specialViewLinks = [
    {
      label: "Active Work",
      value: "all",
      icon: "W",
      count: activeWorkCount,
    },
    {
      label: "Due Soon",
      value: "ready-soon",
      icon: "D",
      count: readySoonCount,
    },
    {
      label: "Needs Estimate",
      value: "needs-estimate",
      icon: "E",
      count: needsEstimateCount,
    },
    {
      label: "Remediation",
      value: "remediation",
      icon: "R",
      count: remediationCount,
    },
    {
      label: "All History",
      value: "history",
      icon: "H",
      count: propertyScopedQueueItems.length,
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
              {selectedBusiness?.name ?? "selected business"}
              {propertyFilter === "all"
                ? "."
                : ` / ${activePropertyLabel}.`}
            </p>
          </div>

          <RoleVisible
            businessSlug={businessSlug}
            allow={["owner", "admin", "property_manager"]}
          >
            <Link href={`/new-request${businessQuery}`}>
              <Button>+ New Queue Item</Button>
            </Link>
          </RoleVisible>
        </div>

        {queueLoadMessage ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <p className="text-sm font-semibold text-amber-200">
              Queue notice
            </p>

            <p className="mt-2 text-sm leading-6 text-amber-100/90">
              {queueLoadMessage}
            </p>
          </Card>
        ) : null}

        <Card>
          <form
            action="/queue"
            className="grid gap-4 md:grid-cols-[1fr_auto]"
          >
            <input type="hidden" name="business" value={businessSlug} />
            {propertyFilter !== "all" ? (
              <input
                type="hidden"
                name="property"
                value={propertyFilter}
              />
            ) : null}

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
                placeholder="Search property, unit, paint color, flooring, date, or notes"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              />
            </div>

            <div className="flex items-end gap-3">
              <Button type="submit">Search</Button>

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

        <div className="queue-filter-bar flex flex-wrap gap-3 rounded-2xl border border-zinc-800 p-2">
          {specialViewLinks.map((filter) => (
            <Link
              key={filter.value}
              href={queueHref(businessSlug, {
                q: searchTerm,
                property: propertyFilter,
                status: statusFilter,
                view: filter.value,
              })}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                viewFilter === filter.value
                  ? "bg-sky-600 text-white shadow-sm shadow-sky-900/10"
                  : "queue-filter-link-inactive text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <span
                className={`filter-tab-icon ${
                  viewFilter === filter.value ? "filter-tab-icon-active" : ""
                }`}
                aria-hidden="true"
              >
                {filter.icon}
              </span>
              <span>{filter.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  viewFilter === filter.value
                    ? "bg-white/20 text-white"
                    : "queue-filter-count-inactive bg-zinc-950 text-zinc-400"
                }`}
              >
                {filter.count}
              </span>
            </Link>
          ))}
        </div>

        <div className="queue-filter-bar flex flex-wrap gap-3 rounded-2xl border border-zinc-800 p-2">
          {statusLinks.map((filter) => (
            <Link
              key={filter.value}
              href={queueHref(businessSlug, {
                q: searchTerm,
                property: propertyFilter,
                status: filter.value,
                view: viewFilter,
              })}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                statusFilter === filter.value
                  ? "bg-sky-600 text-white shadow-sm shadow-sky-900/10"
                  : "queue-filter-link-inactive text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <span
                className={`filter-tab-icon ${
                  statusFilter === filter.value ? "filter-tab-icon-active" : ""
                }`}
                aria-hidden="true"
              >
                {filter.icon}
              </span>
              <span>{filter.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  statusFilter === filter.value
                    ? "bg-white/20 text-white"
                    : "queue-filter-count-inactive bg-zinc-950 text-zinc-400"
                }`}
              >
                {filter.count}
              </span>
            </Link>
          ))}
        </div>

        <Card className="border-sky-200 bg-sky-50/70 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-sky-600">
                Current Queue View
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {activeView.title}
              </h2>
              <p className="mt-2 text-slate-600">{activeView.detail}</p>
            </div>

            <p className="text-sm text-slate-500">
              Showing {filteredQueueItems.length} of{" "}
              {propertyScopedQueueItems.length}{" "}
              queue items.
            </p>
          </div>
        </Card>

        <div className="grid gap-6">
          {propertyScopedQueueItems.length === 0 ? (
            <Card className="border-sky-200 bg-white">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-sky-600">
                    Ready For Intake
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">
                    Start this property queue
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    Add the first unit when a property manager sends a turn,
                    repair request, or scheduling note. Trimax will keep the
                    work tied to this workspace and property.
                  </p>
                </div>

                <RoleVisible
                  businessSlug={businessSlug}
                  allow={["owner", "admin", "property_manager"]}
                >
                  <Link href={`/new-request${businessQuery}`}>
                    <Button>+ New Queue Item</Button>
                  </Link>
                </RoleVisible>
              </div>
            </Card>
          ) : filteredQueueItems.length === 0 ? (
            <Card className="border-sky-200 bg-white">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-sky-600">
                    Nothing In This View
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">
                    No queue items match these filters
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    Try clearing the search or switching back to All Work to
                    see the full property queue.
                  </p>
                </div>

                <Link href={`/queue${businessQuery}`}>
                  <Button variant="secondary">Clear Filters</Button>
                </Link>
              </div>
            </Card>
          ) : (
            filteredQueueItems.map((item) => {
              const displayUnit = maybeCanonicalApartmentUnitLabel(item.unit);
              const linkedEstimate = item.linked_estimate_id
                ? estimateById.get(item.linked_estimate_id)
                : null;
              const readySoon = isReadySoonUnscheduled(item);
              const remediation = isRemediationItem(item);
              const estimateNeeded = needsEstimate(item);
              const readyDays = daysUntil(item.ready_date);
              const itemJobSessions = sessionsByQueueItemId.get(item.id) ?? [];
              const activeJobSessionCount = itemJobSessions.filter(
                (session) => !session.ended_at
              ).length;
              const completedJobSessionCount = itemJobSessions.filter(
                (session) => session.ended_at
              ).length;
              const missingBreakdownCount = itemJobSessions.filter(
                (session) =>
                  Boolean(session.ended_at) &&
                  !breakdownSessionIds.has(session.id)
              ).length;
              const jobSessionMinutes = itemJobSessions.reduce(
                (total, session) =>
                  total +
                  (session.total_minutes ??
                    minutesBetween(session.started_at, session.ended_at)),
                0
              );

              return (
                <Card key={item.id}>
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                        <div className="queue-unit-plate queue-unit-plate-v2">
                          <span className="queue-unit-plate-label">Unit</span>
                          <span className="queue-unit-plate-value">
                            {displayUnit || "-"}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <h2 className="text-2xl font-semibold">
                              {item.property || "Unknown Property"}
                            </h2>

                            <StatusBadge
                              status={item.status ?? "Pending Estimate"}
                            />

                            {item.priority ? (
                              <span className="queue-priority-pill rounded-full bg-zinc-950 px-3 py-1 text-sm font-semibold text-zinc-300">
                                {item.priority} Priority
                              </span>
                            ) : null}

                            {item.smoked_in ? (
                              <span className="queue-remediation-pill rounded-full bg-red-500/20 px-3 py-1 text-sm font-semibold text-red-300">
                                Remediation
                              </span>
                            ) : null}

                            {!item.smoked_in && remediation ? (
                              <span className="queue-remediation-pill rounded-full bg-red-500/20 px-3 py-1 text-sm font-semibold text-red-300">
                                Smoke Note
                              </span>
                            ) : null}

                            {readySoon ? (
                              <span className="queue-ready-soon-pill rounded-full bg-yellow-500/20 px-3 py-1 text-sm font-semibold text-yellow-200">
                                Due Soon
                              </span>
                            ) : null}

                            {estimateNeeded ? (
                              <span className="queue-estimate-needed-pill rounded-full bg-purple-500/20 px-3 py-1 text-sm font-semibold text-purple-200">
                                Needs Estimate
                              </span>
                            ) : null}

                            {item.renovation_needed ? (
                              <span className="queue-current-renovation-pill rounded-full bg-orange-500/20 px-3 py-1 text-sm font-semibold text-orange-200">
                                Current Renovation
                              </span>
                            ) : null}

                            {item.prior_renovation ||
                            item.prior_renovation_details ? (
                              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-semibold text-emerald-200">
                                Prior Renovation
                              </span>
                            ) : null}
                          </div>

                          {item.unit_layout ? (
                            <p className="mt-2 text-zinc-400">
                              Layout {item.unit_layout}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <LifecyclePill
                          label="Move Out"
                          value={item.move_out_date}
                        />
                        <LifecyclePill
                          label="Paint Due"
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
                        <Info
                          label="Unit Layout"
                          value={item.unit_layout}
                        />
                        <Info
                          label="Wall Color"
                          value={item.wall_paint_color}
                        />
                        <Info label="Flooring" value={item.flooring} />
                        <Info
                          label="Renovation"
                          value={
                            item.renovation_needed
                              ? item.renovation_needed_details ||
                                "Needed"
                              : item.prior_renovation_details
                                ? item.prior_renovation_details
                                : item.prior_renovation
                                  ? "Prior renovation"
                                  : null
                          }
                        />
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

                      <RoleVisible
                        businessSlug={businessSlug}
                        allow={["owner", "admin"]}
                      >
                        <LaborCue
                          activeCount={activeJobSessionCount}
                          completedCount={completedJobSessionCount}
                          missingBreakdownCount={missingBreakdownCount}
                          totalMinutes={jobSessionMinutes}
                        />
                      </RoleVisible>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                      <Link href={`/queue/${item.id}${businessQuery}`}>
                        <Button>Open Queue Item</Button>
                      </Link>

                      <RoleVisible
                        businessSlug={businessSlug}
                        allow={["owner", "admin", "accountant", "property_manager"]}
                      >
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
                      </RoleVisible>
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

function LaborCue({
  activeCount,
  completedCount,
  missingBreakdownCount,
  totalMinutes,
}: {
  activeCount: number;
  completedCount: number;
  missingBreakdownCount: number;
  totalMinutes: number;
}) {
  if (activeCount === 0 && completedCount === 0) {
    return (
      <div className="queue-labor-cue mt-4 inline-flex flex-wrap items-center gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sm font-bold text-sky-100">
        <span className="queue-labor-dot" aria-hidden="true" />
        Open this item to start a job session
      </div>
    );
  }

  return (
    <div className="queue-labor-cue mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-100">
      <span className="queue-labor-dot queue-labor-dot-active" aria-hidden="true" />
      <span>
        {activeCount > 0
          ? `${activeCount} session running`
          : `${formatSessionMinutes(totalMinutes)} recorded`}
      </span>
      {completedCount > 0 ? (
        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-xs">
          {completedCount} stopped
        </span>
      ) : null}
      {missingBreakdownCount > 0 ? (
        <span className="rounded-full border border-amber-300/30 bg-amber-300/15 px-2 py-0.5 text-xs text-amber-100">
          {missingBreakdownCount} need breakdown
        </span>
      ) : null}
    </div>
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

function queueFilterIcon(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("completed")) return "C";
  if (normalized.includes("scheduled")) return "S";
  if (normalized.includes("pending") || normalized.includes("estimate")) {
    return "E";
  }
  if (normalized.includes("remediation")) return "R";
  if (normalized.includes("history")) return "H";
  if (normalized.includes("due")) return "D";
  if (normalized.includes("active")) return "W";

  return label.slice(0, 1).toUpperCase();
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
      className={`queue-lifecycle-pill rounded-2xl border px-4 py-3 ${
        alert
          ? "queue-lifecycle-pill-alert border-amber-200 bg-amber-50"
          : value
          ? "queue-lifecycle-pill-filled border-sky-200 bg-sky-50"
          : "queue-lifecycle-pill-empty border-slate-200 bg-white"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-semibold text-slate-950">
        {value || "-"}
      </p>
      {detail ? (
        <p className="mt-1 text-xs font-semibold text-amber-700">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
