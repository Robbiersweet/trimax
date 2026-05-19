import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import StatusBadge from "../components/StatusBadge";
import { queueItems } from "../data/queue";

export default function QueuePage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>
            <h1 className="mt-2 text-4xl font-bold">Work Queue</h1>
          </div>

          <Link href="/new-request">
            <Button>+ New Queue Item</Button>
          </Link>
        </div>

        <div className="grid gap-4">
          {queueItems.map((item) => (
            <Link key={item.id} href={`/queue/${item.id}`}>
              <Card className="transition hover:border-orange-500/60 hover:bg-zinc-800">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className="text-sm text-orange-400">{item.property}</p>

                    <h2 className="mt-1 text-2xl font-semibold">
                      Unit {item.unit}
                    </h2>

                    <p className="mt-2 text-zinc-400">{item.paintType}</p>
                    <p className="mt-1 text-zinc-500">{item.flooring}</p>

                    <div className="mt-4 flex gap-2">
                      <StatusBadge status={item.status} />

                      {item.smokedIn && (
                        <span className="rounded-full bg-red-500/20 px-3 py-1 text-sm text-red-300">
                          Smoker Unit
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right text-sm">
                    <p className="text-zinc-400">Move Out</p>
                    <p className="font-medium text-white">{item.moveOutDate}</p>

                    <p className="mt-3 text-zinc-400">Ready Date</p>
                    <p className="font-medium text-white">{item.readyDate}</p>

                    <p className="mt-3 text-zinc-400">Priority</p>
                    <p className="font-medium text-orange-400">
                      {item.priority}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}