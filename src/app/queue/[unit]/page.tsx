type Props = {
  params: Promise<{
    unit: string;
  }>;
};

export default async function UnitPage({ params }: Props) {
  const { unit } = await params;

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-white">

      <div className="mx-auto max-w-3xl">

        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Trimax Queue
        </p>

        <h1 className="mt-3 text-5xl font-bold">
          Unit {unit.toUpperCase()}
        </h1>

        <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">

          <div className="grid gap-6 md:grid-cols-2">

            <div>
              <p className="text-sm text-zinc-500">
                Property
              </p>

              <p className="mt-2 text-xl font-semibold">
                North Creek
              </p>
            </div>

            <div>
              <p className="text-sm text-zinc-500">
                Status
              </p>

              <p className="mt-2 inline-block rounded-full bg-orange-500/20 px-3 py-1 text-sm font-medium text-orange-300">
                Ready For Paint
              </p>
            </div>

            <div>
              <p className="text-sm text-zinc-500">
                Scope
              </p>

              <p className="mt-2 text-xl font-semibold">
                Smoker Unit
              </p>
            </div>

            <div>
              <p className="text-sm text-zinc-500">
                Scheduled Date
              </p>

              <p className="mt-2 text-xl font-semibold">
                May 20, 2026
              </p>
            </div>

          </div>

          <div className="mt-8">

            <p className="text-sm text-zinc-500">
              Notes
            </p>

            <p className="mt-3 leading-7 text-zinc-300">
              Full primer required. Heavy smoke remediation.
              Replace damaged outlet covers and patch dining room wall.
            </p>

          </div>

        </div>

      </div>

    </main>
  );
}