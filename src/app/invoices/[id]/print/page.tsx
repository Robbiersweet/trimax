import Image from "next/image";
import type { Metadata } from "next";
import BackButton from "../../../components/BackButton";
import PrintToolbar from "../../../components/PrintToolbar";
import { supabase } from "../../../lib/supabase";
import {
  formatTaxSummaryLabel,
  getEffectiveTaxRate,
} from "../../../utils/tax";
import { getSmartInvoiceDates } from "../../../utils/invoiceDates";
import { maybeCanonicalApartmentUnitLabel } from "../../../utils/unitLabels";

type Invoice = {
  id: string;
  client_id: string | null;
  estimate_id: string | null;
  business_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: number | string | null;
  status: string | null;
  display_id: string | null;
  created_at: string | null;
  issue_date: string | null;
  due_date: string | null;
  reference: string | null;
  tax_mode: string | null;
  tax_label: string | null;
  tax_rate: number | string | null;
  tax_number: string | null;
  amount_paid: number | string | null;
  deposit_requested_amount?: number | string | null;
  deposit_requested_at?: string | null;
  deposit_status?: string | null;
  deposit_note?: string | null;
  service_address: string | null;
  split_parent_invoice_id: string | null;
  split_sequence: number | null;
  split_count: number | null;
  terms: string | null;
  notes: string | null;
};

type InvoiceLineItem = {
  id: string;
  description: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  line_total: number | string | null;
  sort_order: number | null;
};

type Business = {
  id: string;
  name: string | null;
  slug: string | null;
};

type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { data } = await supabase
    .from("invoices")
    .select("display_id")
    .eq("id", id)
    .maybeSingle();
  const displayId = data?.display_id || "Invoice";

  return {
    title: displayId,
  };
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCurrency(value: number | string | null | undefined) {
  return toNumber(value);
}

function formatCurrency(amount: number) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(safeAmount);
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const normalizedValue = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)
    ? new Date(`${normalizedValue}T00:00:00`)
    : new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

export default async function InvoicePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ business?: string; template?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams
    ? await searchParams
    : {};
  const businessSlug =
    resolvedSearchParams.business ?? "rnl-creations";
  const requestedTemplate =
    resolvedSearchParams.template ?? "";

  const { data: selectedBusinessData } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  const business = selectedBusinessData as Business | null;

  if (!business) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <p>Selected business was not found.</p>
      </main>
    );
  }

  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("business_id", business.id)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <p>Invoice not found.</p>
      </main>
    );
  }

  const invoice = data as Invoice;
  const suggestedFileName = invoice.display_id || "Invoice";

  const { data: clientData } = invoice.client_id
    ? await supabase
        .from("clients")
        .select("*")
        .eq("id", invoice.client_id)
        .eq("business_id", business.id)
        .single()
    : { data: null };

  const client = clientData as Client | null;

  const { data: lineItemData } = await supabase
    .from("invoice_line_items")
    .select("*")
    .eq("invoice_id", invoice.id)
    .order("sort_order", {
      ascending: true,
    });

  const lineItems =
    (lineItemData ?? []) as InvoiceLineItem[];

  const subtotalFromLineItems = lineItems.reduce(
    (total, item) =>
      total + toNumber(item.line_total),
    0
  );

  const subtotal =
    subtotalFromLineItems > 0
      ? subtotalFromLineItems
      : parseCurrency(invoice.invoice_amount);

  const taxRate = getEffectiveTaxRate({
    taxMode: invoice.tax_mode,
    taxRate: invoice.tax_rate,
  });
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  const amountPaid = toNumber(invoice.amount_paid);
  const amountDue = Math.max(total - amountPaid, 0);
  const depositRequestedAmount = toNumber(
    invoice.deposit_requested_amount
  );
  const depositStatus = String(invoice.deposit_status ?? "none").toLowerCase();
  const hasDepositRequest =
    depositStatus === "requested" && depositRequestedAmount > 0;
  const depositDueNow = hasDepositRequest
    ? Math.max(depositRequestedAmount - amountPaid, 0)
    : 0;
  const customerFacingAmountDue = hasDepositRequest
    ? depositDueNow
    : amountDue;
  const customerFacingDueLabel = hasDepositRequest
    ? "Deposit Due (USD)"
    : "Amount Due (USD)";
  const balanceAfterDepositRequest = Math.max(
    total - depositRequestedAmount,
    0
  );
  const displayReference = maybeCanonicalApartmentUnitLabel(invoice.reference);
  const smartInvoiceDates = getSmartInvoiceDates({
    customerName: invoice.customer_name ?? client?.name ?? "",
    projectTitle: invoice.project_title ?? "",
    serviceAddress: invoice.service_address ?? "",
    reference: displayReference,
    notes: invoice.notes ?? "",
    terms:
      invoice.terms ??
      "Payment due upon invoice. Thank you for your business.",
    lineItems: lineItems.map((item) => ({
      description: item.description ?? "",
    })),
    issueDate: invoice.issue_date ?? invoice.created_at,
  });
  const printIssueDate =
    invoice.issue_date ?? smartInvoiceDates.issueDate;
  const printDueDate =
    invoice.due_date ?? smartInvoiceDates.dueDate;

  const companyName =
    business?.name || "R&L Creations";

  const billedToName =
    client?.name || invoice.customer_name || "Customer";

  const billedToAddress =
    client?.billing_address || "";

  const serviceAddress =
    invoice.service_address || "";

  const documentTitle =
    invoice.project_title || invoice.customer_name || "Invoice";
  const projectTitle = invoice.project_title?.trim() ?? "";
  const firstLineDescription =
    lineItems[0]?.description || "";
  const shouldShowProjectTitle =
    Boolean(projectTitle) &&
    projectTitle !== invoice.display_id &&
    projectTitle !== invoice.customer_name &&
    projectTitle.toLowerCase() !==
      firstLineDescription.trim().toLowerCase();

  const splitLabel =
    invoice.split_parent_invoice_id &&
    invoice.split_sequence &&
    invoice.split_count
      ? `Split ${invoice.split_sequence} of ${invoice.split_count}`
      : "";

  const specialTemplateHref = `/invoices/${invoice.id}/print?business=${businessSlug}&template=5stars-boa`;
  const standardTemplateHref = `/invoices/${invoice.id}/print?business=${businessSlug}&template=standard`;
  const shouldOfferFiveStarsTemplate =
    business?.slug === "just-kleen" &&
    looksLikeFiveStarsBoaInvoice(invoice, client, lineItems);
  const shouldUseFiveStarsTemplate =
    requestedTemplate === "5stars-boa" ||
    (requestedTemplate !== "standard" && shouldOfferFiveStarsTemplate);

  if (shouldUseFiveStarsTemplate) {
    return (
      <FiveStarsBoaPrintPage
        invoice={invoice}
        lineItems={lineItems}
        issueDate={printIssueDate}
        suggestedFileName={suggestedFileName}
        businessSlug={businessSlug}
        backHref={`/invoices/${invoice.id}?business=${businessSlug}`}
        standardTemplateHref={standardTemplateHref}
        excelHref={`/invoices/${invoice.id}/exports/5stars-boa?business=${businessSlug}`}
      />
    );
  }

  return (
    <main className="min-h-screen bg-white px-8 py-8 text-black print:p-0">
      <PrintToolbar
        backHref={`/invoices/${invoice.id}?business=${businessSlug}`}
        backLabel="Back to Invoice"
        documentLabel="Customer Invoice"
        documentTitle={invoice.display_id || documentTitle}
        alternateHref={
          shouldOfferFiveStarsTemplate
            ? specialTemplateHref
            : undefined
        }
        alternateLabel={
          shouldOfferFiveStarsTemplate
            ? "Use 5Stars BOA Format"
            : undefined
        }
        suggestedFileName={suggestedFileName}
      />

      <div className="standard-invoice-print mx-auto max-w-5xl bg-white print:max-w-none print:px-4 print:py-3">
        <section className="grid grid-cols-2 gap-8 print:gap-4">
          <div>
            <Image
              src="/Brand/rnl-multi-colors.png"
              alt={companyName}
              width={128}
              height={128}
              className="h-32 w-32 object-contain print:h-20 print:w-20"
              priority
            />
          </div>

          <div className="text-right text-base leading-6 print:text-sm print:leading-5">
            <p className="font-semibold">
              {companyName}
            </p>

            <p>(425) 350-4898</p>
            <p>1011 90th St SW #B</p>
            <p>Everett, WA 98204</p>
          </div>
        </section>

        <section className="mt-6 border-y border-gray-200 py-4 print:mt-2 print:py-2">
          <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-[#d9aa2f] print:text-[10px]">
                Invoice
              </p>

              <h1 className="mt-2 text-2xl font-semibold leading-tight print:mt-0.5 print:text-lg">
                {invoice.display_id || "Invoice"}
              </h1>

              {splitLabel ? (
                <p className="mt-1 text-sm text-gray-600 print:text-xs">
                  {splitLabel}
                </p>
              ) : null}
            </div>

            <div className="text-right">
              <PrintLabel>{customerFacingDueLabel}</PrintLabel>

              <p className="mt-2 text-4xl font-light tracking-wide print:mt-1 print:text-2xl">
                {formatCurrency(customerFacingAmountDue)}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-7 grid grid-cols-[1.5fr_1fr_1fr_1.25fr] gap-7 print:mt-3 print:gap-4">
          <div>
            <PrintLabel>Billed To</PrintLabel>

            <p className="mt-2 text-base leading-6 print:mt-1 print:text-sm print:leading-5">
              {billedToName}
            </p>

            {billedToAddress && (
              <p className="whitespace-pre-line text-base leading-6 print:text-sm print:leading-5">
                {billedToAddress}
              </p>
            )}

            {serviceAddress ? (
              <div className="mt-5 print:mt-2">
                <PrintLabel>Service Address</PrintLabel>

                <p className="mt-2 whitespace-pre-line text-base leading-6 print:mt-1 print:text-sm print:leading-5">
                  {serviceAddress}
                </p>
              </div>
            ) : null}
          </div>

          <div>
            <PrintLabel>Date of Issue</PrintLabel>

            <p className="mt-2 text-base print:mt-1 print:text-sm">
              {formatDate(printIssueDate)}
            </p>

            <div className="mt-5 print:mt-2">
              <PrintLabel>Due Date</PrintLabel>

              <p className="mt-2 text-base print:mt-1 print:text-sm">
                {formatDate(printDueDate)}
              </p>
            </div>
          </div>

          <div>
            <PrintLabel>Invoice Number</PrintLabel>

            <p className="mt-2 text-base print:mt-1 print:text-sm">
              {invoice.display_id || "Invoice"}
            </p>

            <div className="mt-5 print:mt-2">
              <PrintLabel>Reference</PrintLabel>

              <p className="mt-2 whitespace-pre-line text-base leading-6 print:mt-1 print:text-sm print:leading-5">
                {displayReference || "-"}
              </p>
            </div>
          </div>

          <div>
            {shouldShowProjectTitle ? (
              <>
                <PrintLabel>Project</PrintLabel>

                <p className="mt-2 whitespace-pre-line text-base leading-6 print:mt-1 print:text-sm print:leading-5">
                  {documentTitle}
                </p>
              </>
            ) : null}
          </div>
        </section>

        <section className="print-break-auto mt-7 print:mt-3">
          <table className="standard-print-table w-full border-collapse text-base print:text-[9.5pt]">
            <thead>
              <tr className="border-t-4 border-[#e8bd3f] text-[#d9aa2f]">
                <th className="py-3 pr-4 text-left font-normal print:py-1.5">
                  Description
                </th>
                <th className="w-32 px-3 py-3 text-right font-normal print:w-24 print:py-1.5">
                  Rate
                </th>
                <th className="w-20 px-3 py-3 text-right font-normal print:w-14 print:py-1.5">
                  Qty
                </th>
                <th className="w-36 py-3 pl-3 text-right font-normal print:w-28 print:py-1.5">
                  Line Total
                </th>
              </tr>
            </thead>

            <tbody>
              {lineItems.length === 0 ? (
                <PrintLineItemRow
                  description={invoice.project_title || "Service"}
                  rate={formatCurrency(subtotal)}
                  quantity="1"
                  total={formatCurrency(subtotal)}
                />
              ) : (
                lineItems.map((item) => (
                  <PrintLineItemRow
                    key={item.id}
                    description={item.description || "Line item"}
                    rate={formatCurrency(toNumber(item.unit_price))}
                    quantity={String(toNumber(item.quantity))}
                    total={formatCurrency(toNumber(item.line_total))}
                  />
                ))
              )}
            </tbody>
          </table>

          <div className="ml-auto mt-8 w-full max-w-md print:mt-3 print:max-w-sm">
            <PrintSummaryRow
              label="Subtotal"
              value={formatCurrency(subtotal)}
            />

            <PrintSummaryRow
              label={formatTaxSummaryLabel({
                label: invoice.tax_label,
                rate: taxRate,
                taxNumber: invoice.tax_number,
                taxMode: invoice.tax_mode,
              })}
              value={formatCurrency(taxAmount)}
            />

            <div className="mt-4 border-t border-gray-300 pt-4 print:mt-2 print:pt-2">
              <PrintSummaryRow
                label="Total"
                value={formatCurrency(total)}
              />

              {hasDepositRequest ? (
                <>
                  <PrintSummaryRow
                    label="Deposit Requested"
                    value={formatCurrency(depositRequestedAmount)}
                  />

                  <PrintSummaryRow
                    label="Remaining After Deposit"
                    value={formatCurrency(balanceAfterDepositRequest)}
                  />
                </>
              ) : null}

              <PrintSummaryRow
                label="Amount Paid"
                value={formatCurrency(amountPaid)}
              />
            </div>

            <div className="mt-3 border-t-4 border-double border-gray-300 pt-5 print:mt-2 print:pt-2">
              <div className="flex items-center justify-between gap-6">
                <p className="text-xl text-[#d9aa2f] print:text-base">
                  {customerFacingDueLabel}
                </p>

                <p className="text-xl font-semibold print:text-base">
                  {formatCurrency(customerFacingAmountDue)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {hasDepositRequest && invoice.deposit_note ? (
          <section className="mt-5 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 print:mt-2 print:px-3 print:py-2">
            <PrintLabel>Deposit Note</PrintLabel>

            <p className="mt-2 max-w-4xl whitespace-pre-line text-base leading-6 print:mt-1 print:text-sm print:leading-5">
              {invoice.deposit_note}
            </p>
          </section>
        ) : null}

        <section className="mt-8 print:mt-3">
          <PrintLabel>Terms</PrintLabel>

          <p className="mt-3 max-w-4xl text-base leading-6 print:mt-1 print:text-sm print:leading-5">
            {invoice.terms ||
              "Payment due upon invoice. Thank you for your business."}
          </p>
        </section>

        {invoice.notes && (
          <section className="mt-5 print:mt-2">
            <PrintLabel>Notes</PrintLabel>

            <p className="mt-3 max-w-4xl whitespace-pre-line text-base leading-6 print:mt-1 print:text-sm print:leading-5">
              {invoice.notes}
            </p>
          </section>
        )}

        <div className="mt-12 print:hidden">
          <BackButton
            label="Back"
            fallbackHref={`/invoices/${invoice.id}?business=${businessSlug}`}
            className="border-zinc-300 bg-white text-zinc-700 hover:border-blue-500 hover:text-blue-700"
          />
        </div>
      </div>
    </main>
  );
}

function PrintLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="text-lg text-[#d9aa2f] print:text-sm">
      {children}
    </p>
  );
}

function PrintSummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-1 text-lg print:gap-4 print:py-0.5 print:text-sm">
      <p>{label}</p>

      <p>{value}</p>
    </div>
  );
}

function PrintLineItemRow({
  description,
  rate,
  quantity,
  total,
}: {
  description: string;
  rate: string;
  quantity: string;
  total: string;
}) {
  return (
    <tr className="border-b border-gray-200 align-top">
      <td className="whitespace-pre-line py-2.5 pr-4 leading-6 print:py-1.5 print:leading-4">
        {description}
      </td>
      <td className="px-3 py-2.5 text-right print:py-1.5">
        {rate}
      </td>
      <td className="px-3 py-2.5 text-right print:py-1.5">
        {quantity}
      </td>
      <td className="py-2.5 pl-3 text-right print:py-1.5">
        {total}
      </td>
    </tr>
  );
}

function looksLikeFiveStarsBoaInvoice(
  invoice: Invoice,
  client: Client | null,
  lineItems: InvoiceLineItem[]
) {
  const combinedText = [
    invoice.customer_name,
    invoice.project_title,
    invoice.reference,
    invoice.service_address,
    invoice.notes,
    client?.name,
    client?.billing_address,
    ...lineItems.map((item) => item.description),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasFiveStars =
    combinedText.includes("5stars") ||
    combinedText.includes("5 stars") ||
    combinedText.includes("5star") ||
    combinedText.includes("5 star");
  const hasBankOfAmerica =
    combinedText.includes("bank of america") ||
    combinedText.includes("boa");

  return hasFiveStars || hasBankOfAmerica;
}

function FiveStarsBoaPrintPage({
  invoice,
  lineItems,
  issueDate,
  suggestedFileName,
  businessSlug,
  backHref,
  standardTemplateHref,
  excelHref,
}: {
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
  issueDate: string | null;
  suggestedFileName: string;
  businessSlug: string;
  backHref: string;
  standardTemplateHref: string;
  excelHref: string;
}) {
  const servicePeriod =
    getServicePeriod(issueDate);
  const rows = buildFiveStarsRows(
    invoice,
    lineItems,
    servicePeriod
  );
  const total = rows.reduce(
    (sum, row) => sum + row.amountThisMonth,
    0
  );
  const blankRowCount = Math.max(10, 16 - rows.length);

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-black print:p-0">
      <PrintToolbar
        backHref={backHref}
        backLabel="Back to Invoice"
        documentLabel="Special Invoice Format"
        documentTitle={invoice.display_id || "Invoice"}
        alternateHref={standardTemplateHref}
        alternateLabel="Use Standard Format"
        downloadHref={excelHref}
        downloadLabel="Download Excel"
        suggestedFileName={suggestedFileName}
      />

      <div className="mx-auto w-[760px] bg-white print:mx-0 print:w-[7.4in] print:p-0">
        <div className="mb-3 rounded border border-purple-300 bg-purple-50 px-3 py-2 text-xs text-purple-950 print:hidden">
          This is the special Just Kleen / 5Stars Bank of America invoice
          format. Other invoices can still use the standard print format.
        </div>

        <div className="grid grid-cols-[1fr_210px] border border-black text-[11px] leading-tight">
          <div className="border-r border-black">
            <div className="grid grid-cols-[1fr_90px] border-b border-black bg-purple-300">
              <div className="px-2 py-1 text-2xl font-black uppercase">
                Invoice
              </div>
              <div className="border-l border-black px-2 py-2 text-center text-xs font-black italic">
                INVOICE #
              </div>
            </div>

            <div className="grid grid-cols-[230px_1fr] border-b border-black">
              <div className="border-r border-black px-2 py-1 text-center">
                -
              </div>
              <div className="px-2 py-1 text-center">
                -
              </div>
            </div>
          </div>

          <div>
            <div className="border-b border-black bg-purple-300 px-2 py-2 text-center text-sm font-black">
              {invoice.display_id || "INVOICE"}
            </div>

            <div className="border-b border-black px-2 py-1 text-center">
              -
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_215px] gap-2 text-[10px] leading-tight">
          <div className="border border-black">
            <div className="border-b border-black bg-indigo-900 px-1 py-1 text-xs font-bold uppercase text-white">
              Bill From:
            </div>

            <InfoTableRow label="Company Name:" value="JUST KLEEN" />
            <InfoTableRow label="Contact Name:" value="LYUBOV SWEET" />
            <InfoTableRow
              label="Address:"
              value="1011 90TH ST SW UNIT B"
            />
            <InfoTableRow
              label="City/State/Zip:"
              value="EVERETT WA 98204"
            />
          </div>

          <div className="border border-black">
            <div className="border-b border-black bg-yellow-400 px-1 py-1 text-xs font-bold uppercase">
              Bill To:
            </div>

            <div className="bg-yellow-300 px-2 py-1 text-center font-black">
              5STARS, INC.
            </div>
            <div className="border-t border-black bg-yellow-300 px-2 py-1 text-center font-black">
              P.O BOX 2574
            </div>
            <div className="border-t border-black bg-yellow-300 px-2 py-1 text-center font-black">
              REDMOND, WA 98073
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[220px_1fr] border border-black text-[11px]">
          <div className="border-r border-black px-2 py-1 text-right font-black italic">
            DATE:
          </div>
          <div className="px-2 py-1 text-right">
            {formatDate(issueDate)}
          </div>
        </div>

        <table className="mt-4 w-full border-collapse text-[11px] leading-tight">
          <thead>
            <tr className="bg-cyan-100">
              <FiveStarsHeader>Account Name</FiveStarsHeader>
              <FiveStarsHeader>Service Date From</FiveStarsHeader>
              <FiveStarsHeader>Service Date To</FiveStarsHeader>
              <FiveStarsHeader>Monthly Billing</FiveStarsHeader>
              <FiveStarsHeader>Amount This Month</FiveStarsHeader>
              <FiveStarsHeader>Scheduled Services</FiveStarsHeader>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.accountName}-${index}`}>
                <FiveStarsCell>{row.accountName}</FiveStarsCell>
                <FiveStarsCell align="right">
                  {row.serviceDateFrom}
                </FiveStarsCell>
                <FiveStarsCell align="right">
                  {row.serviceDateTo}
                </FiveStarsCell>
                <FiveStarsCell align="right">
                  {formatPlainMoney(row.monthlyBilling)}
                </FiveStarsCell>
                <FiveStarsCell align="right">
                  {formatPlainMoney(row.amountThisMonth)}
                </FiveStarsCell>
                <FiveStarsCell align="center">
                  {row.scheduledServices}
                </FiveStarsCell>
              </tr>
            ))}

            {Array.from({ length: blankRowCount }).map((_, index) => (
              <tr key={`blank-${index}`}>
                <FiveStarsCell>&nbsp;</FiveStarsCell>
                <FiveStarsCell>&nbsp;</FiveStarsCell>
                <FiveStarsCell>&nbsp;</FiveStarsCell>
                <FiveStarsCell>&nbsp;</FiveStarsCell>
                <FiveStarsCell>&nbsp;</FiveStarsCell>
                <FiveStarsCell>&nbsp;</FiveStarsCell>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-[1fr_185px_110px_220px] border-x border-b border-black text-[11px] font-black">
          <div className="border-r border-black px-2 py-1 text-right">
            TOTAL
          </div>
          <div className="border-r border-black px-2 py-1 text-right">
            {formatPlainMoney(total)}
          </div>
          <div className="border-r border-black px-2 py-1 text-right italic">
            NOTES:
          </div>
          <div className="px-2 py-1">&nbsp;</div>
        </div>

        <div className="grid grid-cols-[220px_190px_1fr] border-x border-b border-black text-[11px]">
          <div className="border-r border-black px-2 py-2 text-right font-black">
            SIGNATURE:
          </div>
          <div className="border-r border-black px-2 py-2">
            SL
          </div>
          <div className="px-2 py-2">
            {invoice.notes || ""}
          </div>
        </div>

        <div className="grid grid-cols-[320px_1fr] border-x border-b border-black text-[11px]">
          <div className="border-r border-black px-2 py-2 text-center font-black">
            THANK YOU FOR YOUR BUSINESS
          </div>
          <div className="px-2 py-2">&nbsp;</div>
        </div>

        <div className="mt-10 print:hidden">
          <BackButton
            label="Back"
            fallbackHref={`/invoices/${invoice.id}?business=${businessSlug}`}
            className="border-zinc-300 bg-white text-zinc-700 hover:border-blue-500 hover:text-blue-700"
          />
        </div>
      </div>
    </main>
  );
}

function InfoTableRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] border-b border-black last:border-b-0">
      <div className="border-r border-black px-1 py-1 font-black italic">
        {label}
      </div>
      <div className="px-1 py-1">{value}</div>
    </div>
  );
}

function FiveStarsHeader({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th className="border border-black px-2 py-2 text-center text-[10px] font-black uppercase">
      {children}
    </th>
  );
}

function FiveStarsCell({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  const alignClass =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";

  return (
    <td
      className={`h-8 border border-black px-2 py-1 align-middle ${alignClass}`}
    >
      {children}
    </td>
  );
}

type FiveStarsRow = {
  accountName: string;
  serviceDateFrom: string;
  serviceDateTo: string;
  monthlyBilling: number;
  amountThisMonth: number;
  scheduledServices: string;
};

function buildFiveStarsRows(
  invoice: Invoice,
  lineItems: InvoiceLineItem[],
  servicePeriod: {
    from: string;
    to: string;
  }
): FiveStarsRow[] {
  const sourceRows =
    lineItems.length > 0
      ? lineItems
      : [
          {
            id: invoice.id,
            description:
              invoice.project_title ||
              invoice.customer_name ||
              "BOA Cleaning",
            quantity: 1,
            unit_price: parseCurrency(invoice.invoice_amount),
            line_total: parseCurrency(invoice.invoice_amount),
            sort_order: 0,
          },
        ];

  return sourceRows.map((item) => {
    const description =
      item.description ||
      invoice.project_title ||
      "BOA Cleaning";
    const amount =
      toNumber(item.line_total) ||
      toNumber(item.quantity) * toNumber(item.unit_price) ||
      toNumber(item.unit_price);

    return {
      accountName: cleanFiveStarsAccountName(description),
      serviceDateFrom: servicePeriod.from,
      serviceDateTo: servicePeriod.to,
      monthlyBilling: amount,
      amountThisMonth: amount,
      scheduledServices: inferScheduledServices(description),
    };
  });
}

function cleanFiveStarsAccountName(description: string) {
  return description
    .replace(/\s*[-|]\s*(\d+\/w|[0-9]\s*(x|times)?\s*(per\s*)?week).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferScheduledServices(description: string) {
  const text = description.toLowerCase();
  const explicitMatch = text.match(/([1-7])\s*\/\s*w/);

  if (explicitMatch?.[1]) {
    return `${explicitMatch[1]}/W`;
  }

  const perWeekMatch = text.match(/([1-7])\s*(x|times)?\s*(per\s*)?week/);

  if (perWeekMatch?.[1]) {
    return `${perWeekMatch[1]}/W`;
  }

  return "";
}

function getServicePeriod(issueDate: string | null) {
  const fallbackDate = new Date();
  const date = issueDate
    ? /^\d{4}-\d{2}-\d{2}$/.test(issueDate)
      ? new Date(`${issueDate}T00:00:00`)
      : new Date(issueDate)
    : fallbackDate;
  const safeDate = Number.isNaN(date.getTime()) ? fallbackDate : date;
  const firstDay = new Date(
    safeDate.getFullYear(),
    safeDate.getMonth(),
    1
  );
  const lastDay = new Date(
    safeDate.getFullYear(),
    safeDate.getMonth() + 1,
    0
  );

  return {
    from: formatShortDate(firstDay),
    to: formatShortDate(lastDay),
  };
}

function formatShortDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${String(
    date.getFullYear()
  ).slice(-2)}`;
}

function formatPlainMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
