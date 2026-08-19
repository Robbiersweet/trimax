"use client";

import InputField from "./InputField";

type ReverseTotalLineOption = {
  label: string;
  value: string;
};

type ReverseTotalControlProps = {
  desiredTotal: string;
  onDesiredTotalChange: (value: string) => void;
  lineOptions: ReverseTotalLineOption[];
  selectedLineIndex: number;
  onSelectedLineIndexChange: (index: number) => void;
  onApply: () => void;
  message?: string;
};

export default function ReverseTotalControl({
  desiredTotal,
  onDesiredTotalChange,
  lineOptions,
  selectedLineIndex,
  onSelectedLineIndexChange,
  onApply,
  message,
}: ReverseTotalControlProps) {
  return (
    <div className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white">Enter final total</p>
          <p className="text-xs text-sky-100/70">Reverse calculate</p>
        </div>
        <button
          type="button"
          onClick={onApply}
          className="rounded-full border border-sky-300/50 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-sky-50 transition hover:border-sky-200 hover:bg-sky-400/20"
        >
          Apply
        </button>
      </div>

      <div className="mt-3 grid gap-2">
        <InputField
          label="Final total"
          type="number"
          preventWheelChange
          value={desiredTotal}
          onChange={onDesiredTotalChange}
          helperText="Trimax adjusts the selected line so the document total lands exactly here."
        />

        {lineOptions.length > 1 ? (
          <label className="grid gap-2 text-sm text-zinc-400">
            Adjust line
            <select
              value={selectedLineIndex}
              onChange={(event) =>
                onSelectedLineIndexChange(Number(event.target.value))
              }
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-white outline-none transition focus:border-sky-400"
            >
              {lineOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {message ? (
          <p className="rounded-xl border border-sky-400/30 bg-black/20 px-3 py-2 text-xs leading-5 text-sky-50">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
