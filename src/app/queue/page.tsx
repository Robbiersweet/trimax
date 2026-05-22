import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import StatusBadge from "../components/StatusBadge";
import { getQueueItems } from "../lib/getQueueItems";
import { supabase } from "../lib/supabase";

type QueueItemWithEstimate = {
  id: string;
  property: string | null;
  unit: string | null;
  status: string | null;
  paint_type: string | null;
  flooring: string | null;
  move_out_date: string | null;
  ready_date: string | null;
  notes: string | null;
  linked_estimate_id: string | null;
};

type LinkedEstimate = {
  id: string;
  display_id: string | null;
};

export default async function QueuePage() {
  const queueItems = (await getQueueItems()) as QueueItemWithEstimate[];

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

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Trimax
          </p>

          <h1 className="mt-3 text-5xl font-bold">Work Queue</h1>
        </div>
      </div>

      <div className="mt-10 grid gap-6">
        {queueItems.map((item) => {
          const linkedEstimate = item.linked_estimate_id
            ? estimateById.get(item.linked_estimate_id)
            : null;

          return (
            <Card key={item.id}>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-semibold">
                      {item.property || "Unknown Property"}
                    </h2>

                    <StatusBadge status={item.status ?? "Pending Estimate"} />
                  </div>

                  <p className="mt-2 text-zinc-400">Unit {item.unit}</p>

                  <div className="mt-5 grid gap-4 text-sm text-zinc-300 md:grid-cols-2">
                    <Info label="Paint Type" value={item.paint_type} />
                    <Info label="Flooring" value={item.flooring} />
                    <Info label="Move Out Date" value={item.move_out_date} />
                    <Info label="Ready Date" value={item.ready_date} />
                  </div>

                  <p className="mt-5 max-w-2xl text-zinc-400">
                    {item.notes || "No notes added."}
                  </p>

                  {linkedEstimate && (
                    <p className="mt-4 text-sm text-purple-300">
                      Linked Estimate: {linkedEstimate.display_id ?? "Estimate"}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <Link href={`/queue/${item.id}`}>
                    <Button>Open Queue Item</Button>
                  </Link>

                  {linkedEstimate ? (
                    <Link href={`/estimates/${linkedEstimate.id}`}>
                      <Button variant="secondary">Open Estimate</Button>
                    </Link>
                  ) : (
                    <Link href={`/estimates/new?queueId=${item.id}`}>
                      <Button variant="secondary">Create Estimate</Button>
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
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
      <p>{value || "—"}</p>
    </div>
  );
}