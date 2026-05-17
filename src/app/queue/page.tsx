import Navigation from "../components/Navigation";

const queueItems = [
  {
    unit: "U6",
    client: "North Creek",
    type: "Reno Paint",
    notes: "Move-out 6/30 • Keep existing carpet",
    status: "Submitted",
  },
  {
    unit: "J8",
    client: "North Creek",
    type: "Smoker Unit",
    notes: "Full primer • Color change",
    status: "Ready for Paint",
  },
  {
    unit: "K4",
    client: "North Creek",
    type: "Classic Paint",
    notes: "Roman Column • Keep existing vinyl",
    status: "Scheduled",
  },
  {
    unit: "B2",
    client: "North Creek",
    type: "Classic Paint",
    notes: "Completed • Ready to invoice",
    status: "Completed",
  },
];

const columns = ["Submitted", "Ready for Paint", "Scheduled", "Completed"];

export default function QueuePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <Navigation />

        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>
            <h1 className="mt-1 text-4xl font-bold">Work Queue</h1>
          </div>

          <button className="rounded-2xl bg-orange-500 px-5 py-3 font-semibold text-black">
            + New Request
          </button>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {columns.map((column) => (
            <div
              key={column}
              className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-bold">{column}</h2>

                <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
                  {
                    queueItems.filter((item) => item.status === column)
                      .length
                  }
                </span>
              </div>

              <div className="space-y-3">
                {queueItems
                  .filter((item) => item.status === column)
                  .map((item) => (
                    <div
                      key={item.unit}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                    >
                      <p className="text-sm text-zinc-400">{item.client}</p>
                      <h3 className="mt-1 text-xl font-bold">
                        Unit {item.unit}
                      </h3>
                      <p className="mt-2 font-medium text-orange-300">
                        {item.type}
                      </p>
                      <p className="mt-2 text-sm text-zinc-400">
                        {item.notes}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}