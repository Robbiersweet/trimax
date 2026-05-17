import Navigation from "./components/Navigation";
export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6x1 flex-col px-4 py-5">
        <Navigation />
        <header className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-orange-400">
              Trimax
            </p>
            <button className="mt-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-left text-sm font-semibold">
              R&L Creations ▾
            </button>
          </div>

          <button className="relative flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-xl">
            🔔
            <span className="absolute right-1 top-1 h-3 w-3 rounded-full bg-orange-500" />
          </button>
        </header>

        <section className="rounded-3xl bg-gradient-to-br from-orange-500 to-orange-700 p-6 shadow-2xl">
          <p className="text-sm font-medium text-orange-100">Outstanding Revenue</p>
          <h1 className="mt-2 text-5xl font-black tracking-tight">$18,450</h1>

          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-black/20 p-3">
              <p className="text-xs text-orange-100">Overdue</p>
              <p className="mt-1 font-bold">$3.2k</p>
            </div>
            <div className="rounded-2xl bg-black/20 p-3">
              <p className="text-xs text-orange-100">Invoices</p>
              <p className="mt-1 font-bold">12</p>
            </div>
            <div className="rounded-2xl bg-black/20 p-3">
              <p className="text-xs text-orange-100">Estimates</p>
              <p className="mt-1 font-bold">4</p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm text-zinc-400">This Month</p>
            <p className="mt-1 text-2xl font-bold">$7,850</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm text-zinc-400">Year to Date</p>
            <p className="mt-1 text-2xl font-bold">$39.5k</p>
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-orange-500/30 bg-zinc-900 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm uppercase tracking-widest text-orange-400">
                Work Queue
              </p>
              <h2 className="mt-1 text-xl font-bold">3 units need review</h2>
              <p className="mt-1 text-sm text-zinc-400">
                North Creek added new turnover items.
              </p>
            </div>

            <span className="rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-black">
              New
            </span>
          </div>

          <button className="mt-4 w-full rounded-2xl bg-orange-500 py-3 font-bold text-black">
            Review Queue
          </button>
        </section>

        <section className="mt-6">
          <h3 className="mb-3 text-lg font-bold">Quick Actions</h3>

          <div className="grid grid-cols-2 gap-3">
            <button className="rounded-2xl bg-zinc-900 p-4 text-left">
              <p className="text-2xl">📄</p>
              <p className="mt-2 font-semibold">New Invoice</p>
            </button>

            <button className="rounded-2xl bg-zinc-900 p-4 text-left">
              <p className="text-2xl">🧾</p>
              <p className="mt-2 font-semibold">New Estimate</p>
            </button>

            <button className="rounded-2xl bg-zinc-900 p-4 text-left">
              <p className="text-2xl">💵</p>
              <p className="mt-2 font-semibold">Add Payment</p>
            </button>

            <button className="rounded-2xl bg-zinc-900 p-4 text-left">
              <p className="text-2xl">📷</p>
              <p className="mt-2 font-semibold">Upload Photo</p>
            </button>
          </div>
        </section>

        <section className="mt-6 flex-1">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold">Upcoming Units</h3>
            <button className="text-sm font-semibold text-orange-400">View all</button>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex justify-between">
                <div>
                  <p className="font-bold">North Creek — U6</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Move-out 6/30 • Reno Paint
                  </p>
                </div>
                <span className="h-fit rounded-full bg-sky-500/20 px-3 py-1 text-xs text-sky-300">
                  Coming
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex justify-between">
                <div>
                  <p className="font-bold">North Creek — J8</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Smoker Unit • Full Primer
                  </p>
                </div>
                <span className="h-fit rounded-full bg-orange-500/20 px-3 py-1 text-xs text-orange-300">
                  Ready
                </span>
              </div>
            </div>
          </div>
        </section>

        <nav className="sticky bottom-4 mt-6 grid grid-cols-5 items-center rounded-3xl border border-zinc-800 bg-zinc-900/95 p-3 text-center text-xs shadow-2xl backdrop-blur">
          <button className="text-orange-400">Home</button>
          <button className="text-zinc-400">Estimates</button>

          <button className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 text-3xl font-bold text-black shadow-lg">
            +
          </button>

          <button className="text-zinc-400">Invoices</button>
          <button className="text-zinc-400">More</button>
        </nav>
      </div>
    </main>
  );
}