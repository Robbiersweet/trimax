// Persist the same decimal rounding used by customer-facing currency rendering.
// Number.toFixed rounds the binary value of 324.205 down to 324.20, while
// Intl currency rendering correctly shows the decimal half-cent as 324.21.
const storedInvoiceCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  useGrouping: false,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatStoredInvoiceAmount(amount: number): string {
  if (!Number.isFinite(amount)) throw new Error("Invoice amount must be finite.");
  return storedInvoiceCurrency.format(amount);
}
