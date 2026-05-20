import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";
import StatusBadge from "../../components/StatusBadge";
import DeleteQueueItemButton from "../../components/DeleteQueueItemButton";
import { supabase } from "../../lib/supabase";

type SupabaseQueueItem = {
  id: string;
  property: string | null;
  unit: string | null;
  status: string | null;
  priority: string | null;
  paint_type: string | null;
  flooring: string | null;
  move_out_date: string | null;
  ready_date: string | null;
  smoked_in: boolean | null;
  notes: string | null;
  linked_estimate_id: string | null;
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

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href="/queue"
          className="inline-flex text-sm text-orange-400 hover:text-orange-300"
        >
          ← Back to Queue
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax Queue
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Unit {item.unit}
            </h1>
          </div>

          <StatusBadge status={item.status ?? "Pending Estimate"} />
        </div>

        {item.linked_estimate_id && (
          <Card className="border-purple-500/40">
            <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
              Linked Estimate
            </p>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-lg font-semibold">
                {item.linked_estimate_id}
              </p>

              <Link href={`/estimates/${item.linked_estimate_id}`}>
                <Button variant="secondary">
                  Open Estimate
                </Button>
              </Link>
            </div>
          </Card>
        )}

        <Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Info label="Property" value={item.property ?? ""} />
            <Info label="Priority" value={item.priority ?? ""} />
            <Info label="Paint Type" value={item.paint_type ?? ""} />
            <Info label="Flooring" value={item.flooring ?? ""} />
            <Info label="Move Out Date" value={item.move_out_date ?? ""} />
            <Info label="Ready Date" value={item.ready_date ?? ""} />
          </div>

          {item.smoked_in && (
            <div className="mt-6 inline-flex rounded-full bg-red-500/20 px-3 py-1 text-sm text-red-300">
              Smoker Unit
            </div>
          )}

          <div className="mt-6">
            <p className="text-sm text-zinc-500">Notes</p>

            <p className="mt-2 leading-7 text-zinc-300">
              {item.notes}
            </p>
          </div>
        </Card>

        <div className="flex gap-4">
          <Link href={`/estimates/new?queueId=${item.id}`}>
            <Button>Create Estimate</Button>
          </Link>

          <Button variant="secondary">
            Mark Scheduled
          </Button>

          <DeleteQueueItemButton queueItemId={item.id} />
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
  value: string;
}) {
  return (
    <div>
      <p className="text-sm text-zinc-500">{label}</p>

      <p className="mt-1 text-lg font-medium">{value}</p>
    </div>
  );
}