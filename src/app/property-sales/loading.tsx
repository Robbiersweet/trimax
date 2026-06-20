import AppShell from "../components/AppShell";
import Card from "../components/Card";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl border border-white/10 bg-white/[0.06] ${className}`}
    />
  );
}

export default function PropertySalesLoading() {
  return (
    <AppShell>
      <div className="space-y-6">
        <section className="dark-surface rounded-3xl border border-sky-500/25 bg-gradient-to-br from-zinc-950 via-slate-950 to-cyan-950/30 p-5 shadow-2xl sm:p-7">
          <SkeletonBlock className="h-4 w-56" />
          <SkeletonBlock className="mt-4 h-12 w-full max-w-xl" />
          <SkeletonBlock className="mt-4 h-16 w-full max-w-3xl" />
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-32" />
            ))}
          </div>
        </section>

        <Card className="dark-surface border-sky-500/20 bg-zinc-950">
          <SkeletonBlock className="h-8 w-72" />
          <div className="mt-5 grid gap-3 xl:grid-cols-7">
            {Array.from({ length: 7 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-72" />
            ))}
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
          <Card className="dark-surface border-emerald-500/20 bg-zinc-950">
            <SkeletonBlock className="h-8 w-64" />
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-56" />
              ))}
            </div>
          </Card>
          <Card className="dark-surface border-sky-500/20 bg-zinc-950">
            <SkeletonBlock className="h-8 w-56" />
            <div className="mt-5 grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBlock key={index} className="aspect-[4/3]" />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
