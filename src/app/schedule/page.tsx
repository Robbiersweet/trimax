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
type ScheduleStateTone = "set" | "today" | "soon" | "needs" | "overdue";

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

function scheduleState(item: QueueScheduleItem): {
  label: string;
  tone: ScheduleStateTone;
} {
  const scheduledDays = daysFromToday(item.scheduled_date);
  const readyDays = daysFromToday(item.ready_date);

  if (scheduledDays !== null) {
    if (scheduledDays < 0) {
      return { label: "Overdue scheduled job", tone: "overdue" };
    }

    if (scheduledDays === 0) {
      return { label: "Today", tone: "today" };
    }

    if (scheduledDays <= 7) {
      return { label: `${scheduledDays} days out`, tone: "soon" };
    }

    return { label: "Calendar set", tone: "set" };
  }

  if (readyDays !== null && readyDays <= 7) {
    return { label: "Needs a date", tone: "needs" };
  }

  return { label: "Needs review", tone: "needs" };
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

  return `/schedule?${params.toString()}#schedule-results`;
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
  const needsDateItems = propertyScopedItems.filter(
    (item) => !item.scheduled_date && !item.completed_date
  );
  const overdueScheduledItems = scheduledItems.filter((item) => {
    const scheduled = dateValue(item.scheduled_date);

    return scheduled && scheduled < today;
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
    cue: string;
  }[] = [
    {
      view: "scheduled",
      label: "Scheduled",
      count: scheduledItems.length,
      detail: "All open jobs with a work date.",
      cue: "Calendar set",
    },
    {
      view: "today",
      label: "Today",
      count: todayItems.length,
      detail: "Jobs planned for today.",
      cue: "Dispatch focus",
    },
    {
      view: "week",
      label: "Next 7 Days",
      count: weekItems.length,
      detail: "Upcoming work for this week.",
      cue: "Near-term plan",
    },
    {
      view: "ready",
      label: "Ready, Not Scheduled",
      count: readyUnscheduledItems.length,
      detail: "Units needing a work date.",
      cue: "Needs date",
    },
  ];

  return (
    <AppShell>
      <div className="schedule-page space-y-6">
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

        <Card className="schedule-planning-strip border-cyan-500/20 bg-zinc-950/70 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.22em]">
                Schedule Compass
              </p>
              <h2 className="mt-1 text-xl font-black text-white">
                Dispatch view for {selectedBusiness?.name ?? "this workspace"}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-300">
                See what is set, what is due today, what is coming up, and what
                still needs a date without digging through the queue.
              </p>
            </div>

            <Link
              href={scheduleHref(businessSlug, "ready", propertyFilter)}
              className="schedule-planning-action rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm font-black text-amber-100 transition hover:-translate-y-0.5 hover:border-amber-200"
            >
              Review unscheduled work
            </Link>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Today",
                value: todayItems.length,
                detail: "Jobs planned now",
                href: scheduleHref(businessSlug, "today", propertyFilter),
                tone: "sky",
              },
              {
                label: "Next 7 Days",
                value: weekItems.length,
                detail: "Near-term work",
                href: scheduleHref(businessSlug, "week", propertyFilter),
                tone: "emerald",
              },
              {
                label: "Needs Date",
                value: needsDateItems.length,
                detail: "Open unscheduled",
                href: scheduleHref(businessSlug, "ready", propertyFilter),
                tone: "amber",
              },
              {
                label: "Overdue",
                value: overdueScheduledItems.length,
                detail: "Schedule review",
                href: scheduleHref(businessSlug, "scheduled", propertyFilter),
                tone: "rose",
              },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                data-tone={item.tone}
                className="schedule-planning-card rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/60"
              >
                <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">
                  {item.label}
                </p>
                <p className="mt-2 text-3xl font-black text-white">
                  {item.value}
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-300">
                  {item.detail}
                </p>
              </Link>
            ))}
          </div>
        </Card>

        {scheduleLoadMessage ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <p className="font-semibold">Schedule notice</p>
            <p className="mt-2 text-sm leading-6">{scheduleLoadMessage}</p>
          </Card>
        ) : null}

        <Card className="schedule-hero-card border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-zinc-900 to-orange-500/5">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)] xl:items-end">
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

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <ScheduleMetric
                label="Calendar Set"
                value={scheduledItems.length}
                detail="Open jobs with scheduled work dates"
              />
              <ScheduleMetric
                label="Needs A Date"
                value={needsDateItems.length}
                detail="Open queue items missing a scheduled date"
              />
              <ScheduleMetric
                label="Schedule Health"
                value={
                  overdueScheduledItems.length > 0
                    ? `${overdueScheduledItems.length} late`
                    : "Clear"
                }
                detail="Overdue scheduled jobs needing review"
              />
            </div>
          </div>
        </Card>

        <div className="grid gap-3 md:grid-cols-4">
          {viewCards.map((card) => (
            <Link
              key={card.view}
              href={scheduleHref(businessSlug, card.view, propertyFilter)}
              scroll={false}
              className={`schedule-view-card rounded-2xl border p-5 transition hover:-translate-y-0.5 ${
                activeView === card.view
                  ? "schedule-view-card-active border-sky-500/55 bg-sky-500/15 text-white shadow-lg shadow-sky-950/20"
                  : "border-zinc-800 bg-zinc-900/80 text-zinc-100 hover:border-sky-500/45 hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold">{card.label}</p>
                <span className="schedule-view-cue rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-zinc-300">
                  {card.cue}
                </span>
              </div>
              <p className="mt-3 text-4xl font-black">{card.count}</p>
              <p
                className={`mt-2 text-sm ${
                  activeView === card.view ? "text-white/80" : "text-zinc-400"
                }`}
              >
                {card.detail}
              </p>
            </Link>
          ))}
        </div>

        {propertyOptions.length > 1 ? (
          <Card className="schedule-property-filter p-4">
            <div className="flex flex-wrap gap-2">
              <Link
                href={scheduleHref(businessSlug, activeView, "all")}
                scroll={false}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  propertyFilter === "all"
                    ? "bg-sky-600 text-white"
                    : "border border-zinc-700 bg-zinc-950/50 text-zinc-300 hover:border-sky-500/45 hover:bg-zinc-900"
                }`}
              >
                All Properties
              </Link>
              {propertyOptions.map((property) => (
                <Link
                  key={property}
                  href={scheduleHref(businessSlug, activeView, property)}
                  scroll={false}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    propertyFilter === property
                      ? "bg-sky-600 text-white"
                      : "border border-zinc-700 bg-zinc-950/50 text-zinc-300 hover:border-sky-500/45 hover:bg-zinc-900"
                  }`}
                >
                  {property}
                </Link>
              ))}
            </div>
          </Card>
        ) : null}

        <div id="schedule-results" className="grid scroll-mt-6 gap-4">
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
              const state = scheduleState(item);

              return (
                <Card key={item.id} className="schedule-job-card">
                  <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-bold">{title}</h2>
                        <StatusBadge status={item.status ?? "Pending Estimate"} />
                        <ScheduleStatePill state={state} />
                        {item.priority ? (
                          <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-sm font-semibold text-orange-300">
                            {item.priority} Priority
                          </span>
                        ) : null}
                        {item.unit_layout ? (
                          <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-sm font-semibold text-sky-100">
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
    green: "schedule-fact-card schedule-fact-green border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
    orange: "schedule-fact-card schedule-fact-orange border-amber-500/30 bg-amber-500/10 text-amber-100",
    zinc: "schedule-fact-card schedule-fact-zinc border-zinc-700 bg-zinc-950/50 text-zinc-200",
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <p className="text-xs uppercase tracking-[0.25em] opacity-75">{label}</p>
      <p className="mt-2 text-lg font-bold">{value}</p>
    </div>
  );
}

function ScheduleMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail: string;
}) {
  return (
    <div className="schedule-hero-count rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-300">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 leading-5">{detail}</p>
    </div>
  );
}

function ScheduleStatePill({
  state,
}: {
  state: { label: string; tone: ScheduleStateTone };
}) {
  const toneClasses = {
    set: "border-sky-500/30 bg-sky-500/10 text-sky-100",
    today: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    soon: "border-cyan-500/30 bg-cyan-500/10 text-cyan-100",
    needs: "border-amber-500/35 bg-amber-500/10 text-amber-200",
    overdue: "border-rose-500/35 bg-rose-500/10 text-rose-200",
  };

  return (
    <span
      className={`schedule-state-pill rounded-full border px-3 py-1 text-sm font-semibold ${toneClasses[state.tone]}`}
    >
      {state.label}
    </span>
  );
}
