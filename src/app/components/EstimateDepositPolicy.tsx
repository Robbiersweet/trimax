"use client";
import { readEstimatePolicy } from "../lib/documentEmailPolicy";
export default function EstimateDepositPolicy({
  terms,
  onChange,
}: {
  terms: string;
  onChange: (value: string) => void;
}) {
  const policy = readEstimatePolicy(terms);
  function update(kind: string, value = 50) {
    const rest = terms
      .split(/\r?\n/)
      .filter((l) => !/^Deposit:/i.test(l.trim()))
      .join("\n")
      .trim();
    onChange(
      rest +
        "\n" +
        (kind === "none"
          ? "Deposit: none."
          : kind === "fixed"
            ? `Deposit: $${value.toFixed(2)}.`
            : `Deposit: ${value}%.`),
    );
  }
  return (
    <fieldset className="space-y-2 rounded-xl border p-3">
      <legend>Estimate deposit terms</legend>
      <select
        aria-label="Deposit policy"
        value={policy?.kind || "unknown"}
        onChange={(e) => update(e.target.value)}
        className="rounded border bg-white p-2 text-slate-950"
      >
        <option value="unknown" disabled>
          Not recorded — choose explicitly
        </option>
        <option value="percent">Percentage (standard 50%)</option>
        <option value="fixed">Fixed amount</option>
        <option value="none">No deposit</option>
      </select>
      {policy && policy.kind !== "none" && (
        <label className="block">
          {policy.kind === "percent"
            ? "Deposit percentage"
            : "Fixed deposit amount"}
          <input
            aria-label="Deposit value"
            type="number"
            min="0.01"
            max={policy.kind === "percent" ? 100 : undefined}
            step="0.01"
            value={policy.value}
            onChange={(e) => {
              if (Number(e.target.value) > 0)
                update(policy.kind, Number(e.target.value));
            }}
            className="ml-2 rounded border p-2"
          />
        </label>
      )}
      <p className="text-xs">
        Saved in the public estimate terms and used by its PDF and email. Older
        estimates require an explicit choice.
      </p>
    </fieldset>
  );
}
