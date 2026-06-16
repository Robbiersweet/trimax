import Link from "next/link";
import AppShell from "../../components/AppShell";
import BackButton from "../../components/BackButton";
import Card from "../../components/Card";
import Button from "../../components/Button";
import StatusBadge from "../../components/StatusBadge";
import DeleteQueueItemButton from "../../components/DeleteQueueItemButton";
import InternalNotes from "../../components/InternalNotes";
import MarkCompletedButton from "../../components/MarkCompletedButton";
import MarkScheduledButton from "../../components/MarkScheduledButton";
import {
  calendarDataUri,
  calendarFileName,
} from "../../lib/calendar";
import { supabase } from "../../lib/supabase";
import {
  canonicalApartmentUnitLabel,
  displayUnitLayout,
  maybeCanonicalApartmentUnitLabel,
} from "../../utils/unitLabels";

type SupabaseQueueItem = {
  id: string;
  business_id: string | null;
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
  primer_requested: boolean | null;
  prior_renovation: boolean | null;
  prior_renovation_details: string | null;
  renovation_needed: boolean | null;
  renovation_needed_details: string | null;
  notes: string | null;
  linked_estimate_id: string | null;
};

type Business = {
  id: string;
  name: string;
  slug: string;
};

type LinkedEstimate = {
  id: string;
  display_id: string | null;
  project_title: string | null;
  status: string | null;
};

type PropertyUnitProfile = {
  id: string;
  building_letter: string | null;
  unit_number: number | null;
  unit_label: string | null;
  floor: string | null;
  floorplan: string | null;
  notes: string | null;
};

type UnitHistoryEntry = {
  id: string;
  event_type: string | null;
  event_date: string | null;
  paint_type: string | null;
  wall_paint_color: string | null;
  flooring: string | null;
  smoker_remediation: boolean | null;
  prior_renovation: boolean | null;
  prior_renovation_details: string | null;
  queue_item_is_renovation: boolean | null;
  notes: string | null;
  created_at: string | null;
};

function propertyKey(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeUnitLabel(value: string | null | undefined) {
  return canonicalApartmentUnitLabel(value);
}

function formatFloor(value: string | null | undefined) {
  if (value === "bottom") {
    return "Bottom";
  }

  if (value === "top") {
    return "Top";
  }

  return "-";
}

function formatHistoryDate(value: string | null) {
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

function latestHistory(
  entries: UnitHistoryEntry[],
  matches: (entry: UnitHistoryEntry) => boolean
) {
  return entries.find(matches) ?? null;
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

function daysBetween(startValue: string | null, endValue: string | null) {
  const start = dateValue(startValue);
  const end = dateValue(endValue);

  if (!start || !end) {
    return null;
  }

  return Math.max(
    Math.round((end.getTime() - start.getTime()) / 86400000),
    0
  );
}

function readyStatus(item: SupabaseQueueItem) {
  const readyDate = dateValue(item.ready_date);
  const isScheduled = Boolean(item.scheduled_date);
  const isCompleted = Boolean(item.completed_date);

  if (isCompleted) {
    return {
      tone: "green",
      label: "Completed",
      detail: "This unit has a completed date recorded.",
    };
  }

  if (!readyDate) {
    return {
      tone: "zinc",
      label: "Paint due date not set",
      detail: "Add the date the property wants painting finished by to make prioritizing easier.",
    };
  }

  if (isScheduled) {
    return {
      tone: "orange",
      label: "Scheduled",
      detail: "This unit has a scheduled date recorded.",
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysUntilReady = Math.round(
    (readyDate.getTime() - today.getTime()) / 86400000
  );

  if (daysUntilReady < 0) {
    return {
      tone: "red",
      label: "Past paint due date",
      detail: "The requested paint finish date has passed and this unit is not scheduled.",
    };
  }

  if (daysUntilReady <= 7) {
    return {
      tone: "yellow",
      label: "Due soon",
      detail: `${daysUntilReady} day${
        daysUntilReady === 1 ? "" : "s"
      } until the requested paint finish date, not scheduled yet.`,
    };
  }

  return {
    tone: "zinc",
    label: "Upcoming",
    detail: `${daysUntilReady} days until the requested paint finish date.`,
  };
}

export default async function QueueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ unit: string }>;
  searchParams?: Promise<{ business?: string }>;
}) {
  const { unit } = await params;
  const resolvedSearchParams = searchParams
    ? await searchParams
    : {};
  const requestedBusinessSlug =
    resolvedSearchParams.business ?? "rnl-creations";

  const { data: selectedBusinessData } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", requestedBusinessSlug)
    .limit(1)
    .maybeSingle();

  const selectedBusiness =
    selectedBusinessData as Business | null;

  if (!selectedBusiness) {
    return (
      <AppShell>
        <Card>
          <p className="text-red-400">
            Selected business was not found.
          </p>
        </Card>
      </AppShell>
    );
  }

  const { data, error } = await supabase
    .from("queue_items")
    .select("*")
    .eq("id", unit)
    .eq("business_id", selectedBusiness.id)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return (
      <AppShell>
        <Card>
          <p className="text-red-400">
            Queue item not found for this workspace.
          </p>
        </Card>
      </AppShell>
    );
  }

  const item = data as SupabaseQueueItem;
  const businessSlug = selectedBusiness.slug;
  const displayUnit = maybeCanonicalApartmentUnitLabel(item.unit);

  let linkedEstimate: LinkedEstimate | null = null;
  let propertyUnitProfile: PropertyUnitProfile | null = null;
  let unitHistory: UnitHistoryEntry[] = [];

  if (item.linked_estimate_id) {
    const { data: estimateData } = await supabase
      .from("estimates")
      .select("id, display_id, project_title, status")
      .eq("id", item.linked_estimate_id)
      .eq("business_id", selectedBusiness.id)
      .limit(1)
      .maybeSingle();

    linkedEstimate = estimateData as LinkedEstimate | null;
  }

  if (
    propertyKey(item.property) === "north-creek-apartments" &&
    normalizeUnitLabel(item.unit)
  ) {
    const { data: propertyData } = await supabase
      .from("properties")
      .select("id")
      .eq("business_id", selectedBusiness.id)
      .eq("name", "North Creek Apartments")
      .limit(1)
      .maybeSingle();

    if (propertyData?.id) {
      const { data: unitData } = await supabase
        .from("property_units")
        .select(
          "id, building_letter, unit_number, unit_label, floor, floorplan, notes"
        )
        .eq("property_id", propertyData.id)
        .eq("unit_label", normalizeUnitLabel(item.unit))
        .limit(1)
        .maybeSingle();

      propertyUnitProfile = unitData as PropertyUnitProfile | null;

      if (propertyUnitProfile?.id) {
        const { data: historyData } = await supabase
          .from("unit_history")
          .select(
            "id, event_type, event_date, paint_type, wall_paint_color, flooring, smoker_remediation, prior_renovation, prior_renovation_details, queue_item_is_renovation, notes, created_at"
          )
          .eq("property_unit_id", propertyUnitProfile.id)
          .order("event_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(12);

        unitHistory = (historyData ?? []) as UnitHistoryEntry[];
      }
    }
  }

  const readiness = readyStatus(item);
  const turnaroundDays = daysBetween(
    item.move_out_date,
    item.completed_date
  );
  const calendarTitle = `${item.property || "Property"}${
    displayUnit ? ` - Unit ${displayUnit}` : ""
  }`;
  const calendarHref = calendarDataUri({
    title: `Trimax: ${calendarTitle}`,
    date: item.scheduled_date,
    location: item.property,
    description: [
      item.paint_type ? `Paint: ${item.paint_type}` : null,
      item.unit_layout ? `Layout: ${item.unit_layout}` : null,
      item.wall_paint_color ? `Wall color: ${item.wall_paint_color}` : null,
      item.flooring ? `Flooring: ${item.flooring}` : null,
      item.priority ? `Priority: ${item.priority}` : null,
      item.ready_date ? `Paint due date: ${item.ready_date}` : null,
      item.prior_renovation_details
        ? `Prior renovation: ${item.prior_renovation_details}`
        : null,
      item.renovation_needed ? "Renovation needed: Yes" : null,
      item.renovation_needed_details
        ? `Current renovation: ${item.renovation_needed_details}`
        : null,
      item.notes ? `Notes: ${item.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  const latestPaintHistory = latestHistory(
    unitHistory,
    (entry) => entry.event_type === "paint" || Boolean(entry.paint_type)
  );
  const latestFlooringHistory = latestHistory(
    unitHistory,
    (entry) => entry.event_type === "flooring" || Boolean(entry.flooring)
  );
  const latestSmokerHistory = latestHistory(
    unitHistory,
    (entry) =>
      entry.event_type === "smoker_remediation" ||
      Boolean(entry.smoker_remediation)
  );
  const latestRenovationHistory = latestHistory(
    unitHistory,
    (entry) =>
      entry.event_type === "renovation" ||
      Boolean(entry.prior_renovation) ||
      Boolean(entry.queue_item_is_renovation)
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <BackButton label="Back" fallbackHref={`/queue?business=${businessSlug}`} />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="queue-unit-plate queue-unit-plate-v2 queue-unit-plate-large">
              <span className="queue-unit-plate-label">Unit</span>
              <span className="queue-unit-plate-value">
                {displayUnit || "-"}
              </span>
            </div>

            <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax Queue
            </p>

              <h1 className="mt-2 text-4xl font-bold">
                {item.property || "Queue Item"}
              </h1>
            </div>
          </div>

          <StatusBadge status={item.status ?? "Pending Estimate"} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <AttentionCard
            tone={readiness.tone}
            label="Readiness"
            value={readiness.label}
            detail={readiness.detail}
          />

          <AttentionCard
            tone={turnaroundDays === null ? "zinc" : "green"}
            label="Turnaround"
            value={
              turnaroundDays === null
                ? "-"
                : `${turnaroundDays} day${
                    turnaroundDays === 1 ? "" : "s"
                  }`
            }
            detail="Move out to completed date."
          />

          <AttentionCard
            tone={item.smoked_in ? "red" : "zinc"}
            label="Remediation"
            value={item.smoked_in ? "Yes" : "No"}
            detail={
              item.smoked_in
                ? item.primer_requested === false
                  ? "Smoke is tracked, but full primer is not requested for estimate creation."
                  : "This is counted in smoker/remediation reporting and can add primer to estimates."
                : "No remediation flag is set."
            }
          />

          <AttentionCard
            tone={item.renovation_needed ? "orange" : "zinc"}
            label="Renovation"
            value={item.renovation_needed ? "Needed" : "Not Flagged"}
            detail={
              item.renovation_needed
                ? item.renovation_needed_details ||
                  "Estimate creation will include renovation and cabinet paint."
                : item.prior_renovation || item.prior_renovation_details
                  ? "Prior renovation history is saved for this unit."
                  : "No renovation flag is set."
            }
          />
        </div>

        {linkedEstimate && (
          <Card className="border-purple-500/40">
            <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
              Linked Estimate
            </p>

            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold">
                  {linkedEstimate.display_id ?? "Estimate"}
                </p>

                <p className="mt-1 text-sm text-zinc-400">
                  {linkedEstimate.project_title ?? "No project title"}
                </p>
              </div>

              <Link
                href={`/estimates/${linkedEstimate.id}?business=${businessSlug}`}
              >
                <Button variant="secondary">Open Estimate</Button>
              </Link>
            </div>
          </Card>
        )}

        {propertyKey(item.property) === "north-creek-apartments" ? (
          <Card className="unit-intelligence-card border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-zinc-950 to-emerald-500/5">
            <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
              Unit Intelligence
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              {propertyUnitProfile?.unit_label || displayUnit || "Unit"} profile
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <Info
                label="Building"
                value={propertyUnitProfile?.building_letter ?? ""}
              />
              <Info
                label="Unit"
                value={propertyUnitProfile?.unit_label ?? displayUnit}
              />
              <Info
                label="Floor"
                value={formatFloor(propertyUnitProfile?.floor)}
              />
              <Info
                label="Layout"
                value={
                  displayUnitLayout(propertyUnitProfile?.floorplan) ||
                  item.unit_layout ||
                  ""
                }
              />
            </div>

            {!propertyUnitProfile ? (
              <p className="unit-intelligence-warning mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                This unit is not in the saved North Creek unit map yet. The
                queue item still works, and the unit can be added to the map
                later.
              </p>
            ) : null}

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <HistorySummary
                label="Latest Paint"
                entry={latestPaintHistory}
                fallback={item.paint_type}
                detail={item.wall_paint_color}
              />
              <HistorySummary
                label="Latest Flooring"
                entry={latestFlooringHistory}
                fallback={item.flooring}
              />
              <HistorySummary
                label="Latest Smoker / Remediation"
                entry={latestSmokerHistory}
                fallback={item.smoked_in ? "Smoker/remediation flagged" : ""}
              />
              <HistorySummary
                label="Latest Renovation"
                entry={latestRenovationHistory}
                fallback={
                  item.renovation_needed_details ||
                  item.prior_renovation_details ||
                  ""
                }
              />
            </div>

            {unitHistory.length > 0 ? (
              <div className="mt-5 space-y-2">
                <p className="text-sm font-semibold text-zinc-200">
                  Recent history
                </p>
                {unitHistory.slice(0, 5).map((entry) => (
                  <div
                    key={entry.id}
                    className="unit-intelligence-history-row rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm"
                  >
                    <p className="font-semibold text-zinc-100">
                      {entry.event_type || "History"} /{" "}
                      {formatHistoryDate(entry.event_date)}
                    </p>
                    <p className="mt-1 text-zinc-400">
                      {[
                        entry.paint_type,
                        entry.wall_paint_color,
                        entry.flooring,
                        entry.smoker_remediation
                          ? "Smoker/remediation"
                          : null,
                        entry.prior_renovation_details,
                        entry.notes,
                      ]
                        .filter(Boolean)
                        .join(" / ") || "No detail saved."}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <LifecycleStep
              label="Move Out"
              value={item.move_out_date}
              active={Boolean(item.move_out_date)}
            />
            <LifecycleStep
              label="Scheduled"
              value={item.scheduled_date}
              active={Boolean(item.scheduled_date)}
            />
            <LifecycleStep
              label="Completed"
              value={item.completed_date}
              active={Boolean(item.completed_date)}
            />
          </div>

          <div className="queue-detail-notice mb-6 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4">
            <p className="text-sm uppercase tracking-[0.25em] text-orange-300">
              Schedule Work
            </p>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-orange-100/80">
              Pick the date you plan to perform the work, then click Schedule.
              The submitted date is saved automatically when the queue item is
              created.
            </p>

            <div className="mt-4">
              <MarkScheduledButton
                queueItemId={item.id}
                businessId={item.business_id}
                businessSlug={businessSlug}
                initialScheduledDate={item.scheduled_date}
                readyDate={item.ready_date}
                label={`${item.property || "Property"} - Unit ${
                  displayUnit || "-"
                }`}
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Info label="Property" value={item.property ?? ""} />
            <Info label="Priority" value={item.priority ?? ""} />
            <Info label="Unit Layout" value={item.unit_layout ?? ""} />
            <Info label="Paint Type" value={item.paint_type ?? ""} />
            <Info
              label="Wall Paint Color"
              value={item.wall_paint_color ?? ""}
            />
            <Info label="Flooring" value={item.flooring ?? ""} />
            <Info
              label="Prior Renovation"
              value={
                item.prior_renovation || item.prior_renovation_details
                  ? "Yes"
                  : "No"
              }
            />
            <Info
              label="Prior Renovation Details"
              value={item.prior_renovation_details ?? ""}
            />
            <Info
              label="Renovation Needed"
              value={item.renovation_needed ? "Yes" : "No"}
            />
            <Info
              label="Current Renovation Style / Scope"
              value={item.renovation_needed_details ?? ""}
            />
            <Info label="Move Out Date" value={item.move_out_date ?? ""} />
            <Info label="Paint Due Date" value={item.ready_date ?? ""} />
            <Info label="Scheduled Date" value={item.scheduled_date ?? ""} />
            <Info label="Completed Date" value={item.completed_date ?? ""} />
            <Info
              label="Full Primer Requested"
              value={
                item.smoked_in
                  ? item.primer_requested === false
                    ? "No"
                    : "Yes"
                  : "No"
              }
            />
          </div>

          {item.smoked_in && (
            <div className="mt-6 inline-flex rounded-full bg-red-500/20 px-3 py-1 text-sm text-red-300">
              {item.primer_requested === false
                ? "Smoker Unit / No Full Primer"
                : "Smoker Unit / Full Primer"}
            </div>
          )}

          <div className="mt-6">
            <p className="text-sm text-zinc-500">Notes</p>
            <p className="mt-2 leading-7 text-zinc-300">
              {item.notes || "No notes added."}
            </p>
          </div>
        </Card>

        <InternalNotes
          businessId={item.business_id}
          entityType="queue_item"
          entityId={item.id}
          title="Queue Item Conversation"
        />

        <div className="flex flex-wrap gap-4">
          <BackButton label="Back" fallbackHref={`/queue?business=${businessSlug}`} />

          {!linkedEstimate && (
            <Link
              href={`/estimates/new?queueId=${item.id}&business=${businessSlug}`}
            >
              <Button>Create Estimate</Button>
            </Link>
          )}

          <Link href={`/queue/${item.id}/edit?business=${businessSlug}`}>
            <Button variant="secondary">Edit Queue Item</Button>
          </Link>

          {calendarHref ? (
            <a
              href={calendarHref}
              download={calendarFileName(calendarTitle, item.scheduled_date)}
              title="Download an .ics calendar file for Outlook, Apple Calendar, Google Calendar, or your phone."
              className="inline-flex items-center justify-center rounded-2xl bg-green-400 px-5 py-3 text-center font-semibold text-black transition hover:opacity-90"
            >
              Add To Calendar
            </a>
          ) : null}

          <MarkCompletedButton
            queueItemId={item.id}
            businessId={item.business_id}
            businessSlug={businessSlug}
            label={`${item.property || "Property"} - Unit ${
              displayUnit || "-"
            }`}
            returnToQueue
          />

          <DeleteQueueItemButton
            queueItemId={item.id}
            returnHref={`/queue?business=${businessSlug}`}
          />
        </div>
      </div>
    </AppShell>
  );
}

function AttentionCard({
  tone,
  label,
  value,
  detail,
}: {
  tone: string;
  label: string;
  value: string;
  detail: string;
}) {
  const toneClasses: Record<string, string> = {
    green: "attention-card attention-card-green border-green-500/40 bg-green-500/10",
    orange: "attention-card attention-card-orange border-orange-500/40 bg-orange-500/10",
    red: "attention-card attention-card-red border-red-500/40 bg-red-500/10",
    yellow: "attention-card attention-card-yellow border-yellow-500/40 bg-yellow-500/10",
    zinc: "attention-card attention-card-zinc border-zinc-800 bg-zinc-900",
  };

  return (
    <Card className={toneClasses[tone] ?? toneClasses.zinc}>
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-2 text-sm text-zinc-300">{detail}</p>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-medium">{value || "-"}</p>
    </div>
  );
}

function HistorySummary({
  label,
  entry,
  fallback,
  detail,
}: {
  label: string;
  entry: UnitHistoryEntry | null;
  fallback?: string | null;
  detail?: string | null;
}) {
  const summary =
    entry?.paint_type ||
    entry?.wall_paint_color ||
    entry?.flooring ||
    entry?.prior_renovation_details ||
    entry?.notes ||
    fallback ||
    "";
  const subDetail =
    entry?.event_date
      ? formatHistoryDate(entry.event_date)
      : detail || "Current queue item only";

  return (
    <div className="unit-intelligence-history-card rounded-2xl border border-sky-500/20 bg-black/25 p-4">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 font-semibold text-zinc-100">
        {summary || "-"}
      </p>
      <p className="mt-1 text-sm text-zinc-400">{subDetail}</p>
    </div>
  );
}

function LifecycleStep({
  label,
  value,
  active,
}: {
  label: string;
  value: string | null;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        active
          ? "queue-lifecycle-step-active border-orange-500/40 bg-orange-500/10"
          : "queue-lifecycle-step-idle border-zinc-800 bg-zinc-950"
      }`}
    >
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-1 font-semibold">{value || "-"}</p>
    </div>
  );
}
