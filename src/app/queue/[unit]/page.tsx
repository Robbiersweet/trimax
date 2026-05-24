import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";
import StatusBadge from "../../components/StatusBadge";
import DeleteQueueItemButton from "../../components/DeleteQueueItemButton";
import MarkCompletedButton from "../../components/MarkCompletedButton";
import MarkScheduledButton from "../../components/MarkScheduledButton";
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

          <MarkScheduledButton queueItemId={item.id} />

          <MarkCompletedButton queueItemId={item.id} />

          <DeleteQueueItemButton queueItemId={item.id} />
        </div>
      </div>
    </AppShell>
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
