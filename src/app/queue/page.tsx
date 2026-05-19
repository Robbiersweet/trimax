import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import StatusBadge from "../components/StatusBadge";
import { getQueueItems } from "../lib/getQueueItems";

export default async function QueuePage() {
  const queueItems = await getQueueItems();

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Trimax
          </p>

          <h1 className="mt-3 text-5xl font-bold">
            Work Queue
          </h1>
        </div>
      </div>

      <div className="mt-10 grid gap-6">
        {queueItems.map((item) => (
          <Card key={item.id}>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-semibold">
                    {item.property}
                  </h2>

                  <StatusBadge status={item.status} />
                </div>

                <p className="mt-2 text-zinc-400">
                  Unit {item.unit}
                </p>

                <div className="mt-5 grid gap-4 text-sm text-zinc-300 md:grid-cols-2">
                  <div>
                    <p className="text-zinc-500">
                      Paint Type
                    </p>

                    <p>{item.paint_type}</p>
                  </div>

                  <div>
                    <p className="text-zinc-500">
                      Flooring
                    </p>

                    <p>{item.flooring}</p>
                  </div>

                  <div>
                    <p className="text-zinc-500">
                      Move Out Date
                    </p>

                    <p>{item.move_out_date}</p>
                  </div>

                  <div>
                    <p className="text-zinc-500">
                      Ready Date
                    </p>

                    <p>{item.ready_date}</p>
                  </div>
                </div>

                <p className="mt-5 max-w-2xl text-zinc-400">
                  {item.notes}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Link href={`/queue/${item.id}`}>
                  <Button>
                    Open Queue Item
                  </Button>
                </Link>

                <Link
                  href={`/estimates/new?queueId=${item.id}`}
                >
                  <Button variant="secondary">
                    Create Estimate
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}