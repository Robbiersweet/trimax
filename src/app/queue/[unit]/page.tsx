import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";
import StatusBadge from "../../components/StatusBadge";
import DeleteQueueItemButton from "../../components/DeleteQueueItemButton";
import MarkCompletedButton from "../../components/MarkCompletedButton";
import MarkScheduledButton from "../../components/MarkScheduledButton";
import {
  calendarDataUri,
  calendarFileName,
} from "../../lib/calendar";
import { supabase } from "../../lib/supabase";

type SupabaseQueueItem = {
  id: string;
  business_id: string | null;
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
      label: "Ready date not set",
      detail: "Add a ready date to make this useful in reports.",
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
      label: "Past ready date",
      detail: "Ready date has passed and this unit is not scheduled.",
    };
  }

  if (daysUntilReady <= 7) {
    return {
      tone: "yellow",
      label: "Ready soon",
      detail: `${daysUntilReady} day${
        daysUntilReady === 1 ? "" : "s"
      } until ready date, not scheduled yet.`,
    };
  }

  return {
    tone: "zinc",
    label: "Upcoming",
    detail: `${daysUntilReady} days until ready date.`,
  };
}

export default async function QueueDetailPage({
  params,
}: {
  params: Promise<{ unit: string }>;
}) {
  const { unit } = await params;

  const { data, error } = await supabase
    .from("queue_items")
    .select("*")
    .eq("id", unit)
    .single();

  if (error || !data) {
    return (
      <AppShell>
        <p className="text-red-400">Queue item not found.</p>
      </AppShell>
    );
  }

  const item = data as SupabaseQueueItem;

  let businessSlug = "rnl-creations";

  if (item.business_id) {
    const { data: businessData } = await supabase
      .from("businesses")
      .select("id, name, slug")
      .eq("id", item.business_id)
      .single();

    const business = businessData as Business | null;

    if (business?.slug) {
      businessSlug = business.slug;
    }
  }

  let linkedEstimate: LinkedEstimate | null = null;

  if (item.linked_estimate_id) {
    const { data: estimateData } = await supabase
      .from("estimates")
      .select("id, display_id, project_title, status")
      .eq("id", item.linked_estimate_id)
      .single();

    linkedEstimate = estimateData as LinkedEstimate | null;
  }

  const readiness = readyStatus(item);
  const turnaroundDays = daysBetween(
    item.move_out_date,
    item.completed_date
  );
  const calendarTitle = `${item.property || "Property"}${
    item.unit ? ` - Unit ${item.unit}` : ""
  }`;
  const calendarHref = calendarDataUri({
    title: `Trimax: ${calendarTitle}`,
    date: item.scheduled_date,
    location: item.property,
    description: [
      item.paint_type ? `Paint: ${item.paint_type}` : null,
      item.flooring ? `Flooring: ${item.flooring}` : null,
      item.priority ? `Priority: ${item.priority}` : null,
      item.ready_date ? `Ready date: ${item.ready_date}` : null,
      item.notes ? `Notes: ${item.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href={`/queue?business=${businessSlug}`}
          className="inline-flex text-sm text-orange-400 hover:text-orange-300"
        >
          Back to Queue
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax Queue
            </p>

            <h1 className="mt-2 text-4xl font-bold">Unit {item.unit}</h1>
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
                ? "This is counted in smoker/remediation reporting."
                : "No remediation flag is set."
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

          <div className="mb-6 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4">
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
                initialScheduledDate={item.scheduled_date}
                readyDate={item.ready_date}
                label={`${item.property || "Property"} - Unit ${
                  item.unit || "-"
                }`}
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Info label="Property" value={item.property ?? ""} />
            <Info label="Priority" value={item.priority ?? ""} />
            <Info label="Paint Type" value={item.paint_type ?? ""} />
            <Info label="Flooring" value={item.flooring ?? ""} />
            <Info label="Move Out Date" value={item.move_out_date ?? ""} />
            <Info label="Ready Date" value={item.ready_date ?? ""} />
            <Info label="Scheduled Date" value={item.scheduled_date ?? ""} />
            <Info label="Completed Date" value={item.completed_date ?? ""} />
          </div>

          {item.smoked_in && (
            <div className="mt-6 inline-flex rounded-full bg-red-500/20 px-3 py-1 text-sm text-red-300">
              Smoker Unit
            </div>
          )}

          <div className="mt-6">
            <p className="text-sm text-zinc-500">Notes</p>
            <p className="mt-2 leading-7 text-zinc-300">
              {item.notes || "No notes added."}
            </p>
          </div>
        </Card>

        <div className="flex flex-wrap gap-4">
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
              className="inline-flex items-center justify-center rounded-2xl bg-green-400 px-5 py-3 text-center font-semibold text-black transition hover:opacity-90"
            >
              Add To Calendar
            </a>
          ) : null}

          <MarkCompletedButton
            queueItemId={item.id}
            businessId={item.business_id}
            label={`${item.property || "Property"} - Unit ${
              item.unit || "-"
            }`}
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
    green: "border-green-500/40 bg-green-500/10",
    orange: "border-orange-500/40 bg-orange-500/10",
    red: "border-red-500/40 bg-red-500/10",
    yellow: "border-yellow-500/40 bg-yellow-500/10",
    zinc: "border-zinc-800 bg-zinc-900",
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
          ? "border-orange-500/40 bg-orange-500/10"
          : "border-zinc-800 bg-zinc-950"
      }`}
    >
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-1 font-semibold">{value || "-"}</p>
    </div>
  );
}
