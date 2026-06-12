"use client";

import type { TaxMode } from "../utils/tax";

type TaxModeSelectProps = {
  value: TaxMode;
  onChange: (value: TaxMode) => void;
};

export default function TaxModeSelect({
  value,
  onChange,
}: TaxModeSelectProps) {
  return (
    <div>
      <label className="app-form-label mb-2 block text-sm text-zinc-400">
        Tax Status
      </label>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TaxMode)}
        className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
      >
        <option value="taxable">Taxable</option>
        <option value="no_tax">No tax</option>
        <option value="tax_exempt">Tax exempt</option>
      </select>
    </div>
  );
}
