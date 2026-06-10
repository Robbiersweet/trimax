import Link from "next/link";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import Card from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import {
  calendarDataUri,
  calendarFileName,
} from "../lib/calendar";
import { supabase } from "../lib/supabase";
import { maybeCanonicalApartmentUnitLabel } from "../utils/unitLabels";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type QueueScheduleItem = {
  id: string;
  property: string | null;
  unit: string | null;
  status: string | null;
  priority: string | null;
  paint_type: string | null;
  unit_layout?: string | null;
  flooring: string | null;
  ready_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  notes: string | null;
};

type ScheduleView = "scheduled" | "today" | "week" | "ready";

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

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  const date = dateValue(value);

  if (!date) {
    return "-";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysFromToday(value: string | null) {
  const date = dateValue(value);

  if (!date) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function jobTitle(item: QueueScheduleItem) {
  const property = item.property || "Property";
  const displayUnit = maybeCanonicalApartmentUnitLabel(item.unit);
  const unit = displayUnit ? ` - Unit ${displayUnit}` : "";

  return `${property}${unit}`;
}

function jobDescription(item: QueueScheduleItem) {
  const details = [
    item.paint_type ? `Paint: ${item.paint_type}` : null,
    item.unit_layout ? `Layout: ${item.unit_layout}` : null,
    item.flooring ? `Flooring: ${item.flooring}` : null,
    item.priority ? `Priority: ${item.priority}` : null,
    item.ready_date ? `Paint due date: ${item.ready_date}` : null,
    item.notes ? `Notes: ${item.notes}` : null,
  ].filter(Boolean);

  return details.join("\n");
}

function scheduleHref(
  businessSlug: string,
  view: ScheduleView,
  property?: string
) {
  const params = new URLSearchParams({
    business: businessSlug,
    view,
  });

  if (property && property !== "all") {
    params.set("property", property);
  }

  return `/schedule?${params.toString()}`;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    view?: ScheduleView;
    property?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const activeView =
    resolvedSearchParams.view === "today" ||
    resolvedSearchParams.view === "week" ||
    resolvedSearchParams.view === "ready"
      ? resolvedSearchParams.view
      : "scheduled";
  const propertyFilter = resolvedSearchParams.property ?? "all";
  const businessQuery = `?business=${businessSlug}`;

  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  const selectedBusiness = businessData as Business | null;
  let scheduleLoadMessage = "";
  let queueItems: QueueScheduleItem[] = [];

  if (businessError) {
    scheduleLoadMessage =
      "Workspace details could not be loaded. Try signing in again, then reopen this workspace.";
  }

  if (selectedBusiness?.id) {
    const { data, error } = await supabase
      .from("queue_items")
      .select("*")
      .eq("business_id", selectedBusiness.id)
      .order("scheduled_date", { ascending: true, nullsFirst: false })
      .order("ready_date", { ascending: true, nullsFirst: false });

    if (error) {
      console.warn("Schedule queue lookup failed:", error.message);
      scheduleLoadMessage =
        "Schedule data could not be loaded. Try signing in again; if this stays here, queue access settings need attention.";
    } else {
      queueItems = (data ?? []) as QueueScheduleItem[];
    }
  }

  const propertyOptions = Array.from(
    new Set(
      queueItems
        .map((item) => item.property?.trim())
        .filter((property): property is string => Boolean(property))
    )
  ).sort((a, b) => a.localeCompare(b));

  const propertyScopedItems =
    propertyFilter === "all"
      ? queueItems
      : queueItems.filter((item) => item.property === propertyFilter);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const scheduledItems = propertyScopedItems.filter(
    (item) => item.scheduled_date && !item.completed_date
  );
  const todayItems = scheduledItems.filter(
    (item) => item.scheduled_date?.slice(0, 10) === todayKey
  );
  const weekItems = scheduledItems.filter((item) => {
    const scheduled = dateValue(item.scheduled_date);

    return scheduled && scheduled >= today && scheduled <= weekEnd;
  });
  const readyUnscheduledItems = propertyScopedItems.filter((item) => {
    const ready = dateValue(item.ready_date);

    return ready && ready <= weekEnd && !item.scheduled_date && !item.completed_date;
  });

  const visibleItems =
    activeView === "today"
      ? todayItems
      : activeView === "week"
        ? weekItems
        : activeView === "ready"
          ? readyUnscheduledItems
          : scheduledItems;

  const viewCards: {
    view: ScheduleView;
    label: string;
    count: number;
    detail: string;
  }[] = [
    {
      view: "scheduled",
      label: "Scheduled",
      count: scheduledItems.length,
      detail: "All open jobs with a work date.",
    },
    {
      view: "today",
      label: "Today",
      count: todayItems.length,
      detail: "Jobs planned for today.",
    },
    {
      view: "week",
      label: "Next 7 Days",
      count: weekItems.length,
      detail: "Upcoming work for this week.",
    },
    {
      view: "ready",
      label: "Ready, Not Scheduled",
      count: readyUnscheduledItems.length,
      detail: "Units needing a work date.",
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
            <h1 className="mt-3 text-5xl font-bold">Schedule</h1>
            <p className="mt-3 text-zinc-400">
              Plan queue work for {selectedBusiness?.name ?? "this workspace"}.
            </p>
          </div>

          <Link href={`/new-request${businessQuery}`}>
            <Button>+ New Queue Item</Button>
          </Link>
        </div>

        {scheduleLoadMessage ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <p className="font-semibold">Schedule notice</p>
            <p className="mt-2 text-sm leading-6">{scheduleLoadMessage}</p>
          </Card>
        ) : null}

        <Card className="schedule-hero-card border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-zinc-900 to-orange-500/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
                Work Calendar
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                Schedule from the same queue workflow
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                Use this page to see today, this week, and units that are ready
                but still need a scheduled date. Calendar buttons create a
                phone-friendly event file for the selected job.
              </p>

              <p className="schedule-hero-tip mt-3 max-w-3xl rounded-2xl border border-sky-400/25 bg-sky-400/10 px-4 py-3 text-sm leading-6 text-zinc-300">
                Tip: Add To Calendar downloads an .ics file. Open that file to
                add the job to Outlook, Apple Calendar, Google Calendar, or
                your phone calendar.
              </p>
            </div>

            <div className="schedule-hero-count rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
              {scheduledItems.length} open scheduled jobs
            </div>
          </div>
        </Card>

        <div className="grid gap-3 md:grid-cols-4">
          {viewCards.map((card) => (
            <Link
              key={card.view}
              href={scheduleHref(businessSlug, card.view, propertyFilter)}
              className={`rounded-3xl border p-5 transition hover:-translate-y-0.5 ${
                activeView === card.view
                  ? "border-orange-500 bg-orange-500 text-black shadow-lg shadow-orange-950/20"
                  : "border-zinc-800 bg-zinc-900 hover:border-orange-500/50"
              }`}
            >
              <p className="text-sm font-semibold">{card.label}</p>
              <p className="mt-3 text-4xl font-black">{card.count}</p>
              <p
                className={`mt-2 text-sm ${
                  activeView === card.view ? "text-black/75" : "text-zinc-400"
                }`}
              >
                {card.detail}
              </p>
            </Link>
          ))}
        </div>

        {propertyOptions.length > 1 ? (
          <Card className="p-4">
            <div className="flex flex-wrap gap-2">
              <Link
                href={scheduleHref(businessSlug, activeView, "all")}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  propertyFilter === "all"
                    ? "bg-orange-500 text-black"
                    : "bg-zinc-950 text-zinc-300 hover:text-orange-300"
                }`}
              >
                All Properties
              </Link>
              {propertyOptions.map((property) => (
                <Link
                  key={property}
                  href={scheduleHref(businessSlug, activeView, property)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    propertyFilter === property
                      ? "bg-orange-500 text-black"
                      : "bg-zinc-950 text-zinc-300 hover:text-orange-300"
                  }`}
                >
                  {property}
                </Link>
              ))}
            </div>
          </Card>
        ) : null}

        <div className="grid gap-4">
          {visibleItems.length === 0 ? (
            <Card>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Clear View
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                No jobs need attention in this schedule view.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Switch views above, open the queue, or add a new request when a
                property manager sends the next unit.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/queue${businessQuery}`}>
                  <Button variant="secondary">Open Queue</Button>
                </Link>
                <Link href={`/new-request${businessQuery}`}>
                  <Button>+ New Queue Item</Button>
                </Link>
              </div>
            </Card>
          ) : (
            visibleItems.map((item) => {
              const title = jobTitle(item);
              const eventDate =
                item.scheduled_date || item.ready_date || null;
              const calendarHref = calendarDataUri({
                title: `Trimax: ${title}`,
                date: eventDate,
                location: item.property,
                description: jobDescription(item),
              });
              const daysAway = daysFromToday(eventDate);

              return (
                <Card key={item.id}>
                  <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-bold">{title}</h2>
                        <StatusBadge status={item.status ?? "Pending Estimate"} />
                        {item.priority ? (
                          <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-sm font-semibold text-orange-300">
                            {item.priority} Priority
                          </span>
                        ) : null}
                        {item.unit_layout ? (
                          <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-sm font-semibold text-sky-300">
                            Layout {item.unit_layout}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-2 text-sm text-zinc-400">
                        {item.paint_type || "No paint type"} /{" "}
                        {item.flooring || "No flooring note"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3 lg:justify-end">
                      <Link href={`/queue/${item.id}${businessQuery}`}>
                        <Button variant="secondary">Open Job</Button>
                      </Link>
                      {calendarHref ? (
                        <a
                          href={calendarHref}
                          download={calendarFileName(title, eventDate)}
                          title="Download an .ics calendar file for Outlook, Apple Calendar, Google Calendar, or your phone."
                          className="inline-flex items-center justify-center rounded-2xl bg-green-400 px-5 py-3 text-center font-semibold text-black transition hover:opacity-90"
                        >
                          Add To Calendar
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <ScheduleFact
                      label="Scheduled"
                      value={formatDate(item.scheduled_date)}
                      tone={item.scheduled_date ? "green" : "zinc"}
                    />
                    <ScheduleFact
                      label="Paint Due"
                      value={formatDate(item.ready_date)}
                      tone="orange"
                    />
                    <ScheduleFact
                      label="Timing"
                      value={
                        daysAway === null
                          ? "No date"
                          : daysAway === 0
                            ? "Today"
                            : daysAway > 0
                              ? `${daysAway} days out`
                              : `${Math.abs(daysAway)} days ago`
                      }
                      tone={daysAway === 0 ? "green" : "zinc"}
                    />
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

function ScheduleFact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "orange" | "zinc";
}) {
  const toneClasses = {
    green: "border-green-500/30 bg-green-500/10 text-green-200",
    orange: "border-orange-500/30 bg-orange-500/10 text-orange-200",
    zinc: "border-zinc-800 bg-zinc-950 text-zinc-300",
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <p className="text-xs uppercase tracking-[0.25em] opacity-75">{label}</p>
      <p className="mt-2 text-lg font-bold">{value}</p>
    </div>
  );
}
