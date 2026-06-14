type ReadinessStep = {
  label: string;
  detail: string;
  status: "ready" | "attention" | "waiting";
};

type DocumentReadinessPanelProps = {
  eyebrow: string;
  title: string;
  totalLabel: string;
  totalValue: string;
  secondaryLabel?: string;
  secondaryValue?: string;
  steps: ReadinessStep[];
};

export default function DocumentReadinessPanel({
  eyebrow,
  title,
  totalLabel,
  totalValue,
  secondaryLabel,
  secondaryValue,
  steps,
}: DocumentReadinessPanelProps) {
  const readyCount = steps.filter((step) => step.status === "ready").length;
  const isReady = readyCount === steps.length;

  return (
    <div className="document-readiness-panel rounded-3xl border border-sky-500/25 bg-gradient-to-br from-sky-500/10 via-zinc-950 to-emerald-500/10 p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <p className="document-readiness-label text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">
            {eyebrow}
          </p>

          <h2 className="mt-2 text-2xl font-black text-white">
            {title}
          </h2>

          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {isReady
              ? "Everything needed is in place. Review the totals, then create the document."
              : "Finish the highlighted items before creating the document."}
          </p>
        </div>

        <div className="document-readiness-total rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            {totalLabel}
          </p>
          <p className="mt-1 text-2xl font-black text-white">
            {totalValue}
          </p>
          {secondaryLabel && secondaryValue ? (
            <p className="mt-2 text-sm text-zinc-400">
              {secondaryLabel}:{" "}
              <span className="font-semibold text-zinc-200">
                {secondaryValue}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {steps.map((step) => (
          <div
            key={step.label}
            data-status={step.status}
            className="document-readiness-step rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">
                {step.label}
              </p>
              <span className="document-readiness-dot h-2.5 w-2.5 rounded-full" />
            </div>

            <p className="mt-2 text-sm font-semibold text-white">
              {step.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
