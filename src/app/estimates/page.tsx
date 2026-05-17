import Navigation from "../components/Navigation";
const estimates = [
  {
    id: "#227",
    client: "North Creek",
    reference: "Fence Replacement",
    amount: "$22,000",
    status: "Approved",
  },

  {
    id: "#228",
    client: "Holy Cross Church",
    reference: "Coffee Bar",
    amount: "$7,500",
    status: "Sent",
  },
];
export default function EstimatesPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <Navigation />
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>
            <h1 className="mt-1 text-4xl font-bold">Estimates</h1>
          </div>

          <button className="rounded-2xl bg-orange-500 px-5 py-3 font-semibold text-black">
            + New Estimate
          </button>
        </header>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <input
              className="w-80 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
              placeholder="Search estimates..."
            />

            <div className="flex gap-2">
              <button className="rounded-xl bg-zinc-800 px-4 py-2 text-sm">All</button>
              <button className="rounded-xl bg-zinc-800 px-4 py-2 text-sm">Draft</button>
              <button className="rounded-xl bg-zinc-800 px-4 py-2 text-sm">Sent</button>
              <button className="rounded-xl bg-zinc-800 px-4 py-2 text-sm">Approved</button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-800">
            <table className="w-full">
              <thead className="bg-zinc-800/50 text-left text-sm text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Estimate #</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>

              <tbody>
{estimates.map((estimate) => (
  <tr key={estimate.id} className="border-t border-zinc-800">
    <td className="px-4 py-4 font-medium">{estimate.id}</td>

    <td className="px-4 py-4">
      {estimate.client}
    </td>

    <td className="px-4 py-4">
      {estimate.reference}
    </td>

    <td className="px-4 py-4 font-semibold">
      {estimate.amount}
    </td>

    <td className="px-4 py-4">
      <span
        className={
          estimate.status === "Approved"
            ? "rounded-full bg-sky-500/20 px-3 py-1 text-xs text-sky-300"
            : "rounded-full bg-orange-500/20 px-3 py-1 text-xs text-orange-300"
        }
      >
        {estimate.status}
      </span>
    </td>
  </tr>
))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}