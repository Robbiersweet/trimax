export const TBD_VALUE = "To Be Determined";

export type TbdDecision = {
  field: string;
  value: string;
};

export function isTbdValue(value: string | null | undefined) {
  const normalized = (value || "").trim().toLowerCase();

  return normalized === "tbd" || normalized === TBD_VALUE.toLowerCase();
}

export function normalizeTbdValue(value: string | null | undefined) {
  return isTbdValue(value) ? TBD_VALUE : value ?? "";
}

export function tbdDisplay(
  value: string | null | undefined,
  mode: "short" | "long" = "long"
) {
  if (!isTbdValue(value)) {
    return value ?? "";
  }

  return mode === "short" ? "TBD" : TBD_VALUE;
}

export function queueTbdDecisions(item: {
  flooring?: string | null;
  wall_paint_color?: string | null;
}) {
  const decisions: TbdDecision[] = [];

  if (isTbdValue(item.flooring)) {
    decisions.push({
      field: "Flooring",
      value: TBD_VALUE,
    });
  }

  if (isTbdValue(item.wall_paint_color)) {
    decisions.push({
      field: "Paint Color",
      value: TBD_VALUE,
    });
  }

  return decisions;
}
