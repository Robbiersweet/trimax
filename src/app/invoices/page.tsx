import Navigation from "../components/Navigation";
const invoices = [
  {
    id: "#228",
    client: "North Creek",
    amount: "$11,000",
    status: "Pending",
    date: "05/16/2026",
  },

  {
    id: "#227",
    client: "North Creek",
    amount: "$22,000",
    status: "Paid Deposit",
    date: "04/23/2026",
  },
 
  {
  id: "#229",
  client: "Sunset Apartments",
  amount: "$4,800",
  status: "Pending",
  date: "05/18/2026",
},
];
export default function InvoicesPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <Navigation />

        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-1 text-4xl font-bold">
              Invoices
            </h1>
          </div>

          <button className="rounded-2xl bg-orange-500 px-5 py-3 font-semibold text-black">
            + New Invoice
          </button>
        </header>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">

          <div className="mb-4 flex items-center justify-between">
            <input
              className="w-80 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none"
              placeholder="Search invoices..."
            />

            <div className="flex gap-2">
              <button className="rounded-xl bg-zinc-800 px-4 py-2 text-sm">
                All
              </button>

              <button className="rounded-xl bg-zinc-800 px-4 py-2 text-sm">
                Pending
              </button>

              <button className="rounded-xl bg-zinc-800 px-4 py-2 text-sm">
                Paid
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-800">

            <table className="w-full">
              <thead className="bg-zinc-800/50 text-left text-sm text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>

              <tbody>
{invoices.map((invoice) => (
  <tr key={invoice.id} className="border-t border-zinc-800">
    <td className="px-4 py-4 font-medium">{invoice.id}</td>
    <td className="px-4 py-4">{invoice.client}</td>
    <td className="px-4 py-4">{invoice.amount}</td>
    <td className="px-4 py-4">
      <span
        className={
          invoice.status === "Pending"
            ? "rounded-full bg-orange-500/20 px-3 py-1 text-xs text-orange-300"
            : "rounded-full bg-sky-500/20 px-3 py-1 text-xs text-sky-300"
        }
      >
        {invoice.status}
      </span>
    </td>
    <td className="px-4 py-4 text-zinc-400">{invoice.date}</td>
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