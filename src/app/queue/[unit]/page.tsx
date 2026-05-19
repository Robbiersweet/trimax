import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";
import StatusBadge from "../../components/StatusBadge";
import { queueItems } from "../../data/queue";

export default async function QueueDetailPage({
  params,
}: {
  params: Promise<{ unit: string }>;
}) {
  const { unit } = await params;

  const item = queueItems.find((queueItem) => queueItem.id === unit);

  if (!item) {
    return (
      <AppShell>
        <p className="text-red-400">Queue item not found.</p>
      </AppShell>
    );
  }

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

          <StatusBadge status={item.status} />
        </div>

        {item.linkedEstimateId && (
          <Card className="border-purple-500/40">
            <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
              Linked Estimate
            </p>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-lg font-semibold">
                {item.linkedEstimateId}
              </p>

              <Link href={`/estimates/${item.linkedEstimateId}`}>
                <Button variant="secondary">
                  Open Estimate
                </Button>
              </Link>
            </div>
          </Card>
        )}

        <Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Info label="Property" value={item.property} />
            <Info label="Priority" value={item.priority} />
            <Info label="Paint Type" value={item.paintType} />
            <Info label="Flooring" value={item.flooring} />
            <Info label="Move Out Date" value={item.moveOutDate} />
            <Info label="Ready Date" value={item.readyDate} />
          </div>

          {item.smokedIn && (
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