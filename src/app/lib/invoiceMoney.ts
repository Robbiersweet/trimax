import { formatMoney } from "./money.ts";

export const formatStoredInvoiceAmount = formatMoney;

/** Display the same rounded cents with USD grouping; keep storage serialization stable. */
export function formatInvoiceDisplayAmount(amount: Parameters<typeof formatMoney>[0]): string {
  const [whole, cents] = formatMoney(amount).split(".");
  return `${whole.replace(/\d(?=(\d{3})+(?!\d))/g, "$&,")}.${cents}`;
}
