import { supabase } from "./supabase";

type DocumentTable = "estimates" | "invoices";

type NextDocumentDisplayIdInput = {
  table: DocumentTable;
  prefix: "EST" | "INV";
  businessId: string;
  minimumNumber?: number;
};

function parseDocumentNumber(displayId: string | null) {
  if (!displayId) {
    return 0;
  }

  const match = displayId.match(/-(\d+)$/);

  return match ? Number(match[1]) : 0;
}

export function normalizeDocumentDisplayId(
  value: string,
  prefix: "EST" | "INV"
) {
  const trimmedValue = value.trim().toUpperCase();

  if (!trimmedValue) {
    return "";
  }

  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefixedMatch = trimmedValue.match(
    new RegExp(`^${escapedPrefix}-?(\\d+)$`)
  );
  const numberOnlyMatch = trimmedValue.match(/^(\d+)$/);
  const numberText = prefixedMatch?.[1] ?? numberOnlyMatch?.[1];

  if (!numberText) {
    return "";
  }

  const documentNumber = Number(numberText);

  if (!Number.isInteger(documentNumber) || documentNumber <= 0) {
    return "";
  }

  return `${prefix}-${String(documentNumber).padStart(4, "0")}`;
}

export async function getNextDocumentDisplayId({
  table,
  prefix,
  businessId,
  minimumNumber = 500,
}: NextDocumentDisplayIdInput) {
  const { data, error } = await supabase
    .from(table)
    .select("display_id")
    .eq("business_id", businessId)
    .like("display_id", `${prefix}-%`);

  if (error) {
    throw error;
  }

  const highestExistingNumber = (data ?? []).reduce(
    (highest, row) => Math.max(highest, parseDocumentNumber(row.display_id)),
    0
  );

  const nextNumber = Math.max(highestExistingNumber + 1, minimumNumber);

  return `${prefix}-${String(nextNumber).padStart(4, "0")}`;
}
