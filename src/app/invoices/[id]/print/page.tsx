import Link from "next/link";
import Image from "next/image";
import PrintToolbar from "../../../components/PrintToolbar";
import { supabase } from "../../../lib/supabase";

type Invoice = {
  id: string;
  client_id: string | null;
  estimate_id: string | null;
  business_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | null;
  status: string | null;
  display_id: string | null;
  issue_date: string | null;
  due_date: string | null;
  reference: string | null;
  tax_label: string | null;
  tax_rate: number | string | null;
  amount_paid: number | string | null;
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

function toNumber(value: number | string | null) {
  return Number(value) || 0;
}

function parseCurrency(value: string | null) {
  return Number(value?.replace(/[^0-9.]/g, "") ?? 0) || 0;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value}T00:00:00`);

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

  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <p>Invoice not found.</p>
      </main>
    );
  }

  const invoice = data as Invoice;

  const { data: businessData } = invoice.business_id
    ? await supabase
        .from("businesses")
        .select("id, name, slug")
        .eq("id", invoice.business_id)
        .single()
    : { data: null };

  const business = businessData as Business | null;

  const { data: clientData } = invoice.client_id
    ? await supabase
        .from("clients")
        .select("*")
        .eq("id", invoice.client_id)
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

  const taxRate = toNumber(invoice.tax_rate);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  const amountPaid = toNumber(invoice.amount_paid);
  const amountDue = Math.max(total - amountPaid, 0);

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
      />

      <div className="mx-auto max-w-5xl bg-white print:max-w-none print:px-6 print:py-4">
        <section className="grid grid-cols-2 gap-8">
          <div>
            <Image
              src="/Brand/rnl-multi-colors.png"
              alt={companyName}
              width={128}
              height={128}
              className="h-32 w-32 object-contain print:h-28 print:w-28"
              priority
            />
          </div>

          <div className="text-right text-base leading-6">
            <p className="font-semibold">
              {companyName}
            </p>

            <p>(425) 350-4898</p>
            <p>1011 90th St SW #B</p>
            <p>Everett, WA 98204</p>
          </div>
        </section>

        <section className="mt-10 border-y border-gray-200 py-6 print:mt-8 print:py-5">
          <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-[#d9aa2f]">
                Invoice
              </p>

              <h1 className="mt-3 text-4xl font-semibold leading-tight print:text-3xl">
                {documentTitle}
              </h1>

              {splitLabel ? (
                <p className="mt-2 text-lg text-gray-600">
                  {splitLabel}
                </p>
              ) : null}
            </div>

            <div className="text-right">
              <PrintLabel>Amount Due (USD)</PrintLabel>

              <p className="mt-2 text-5xl font-light tracking-wide print:text-4xl">
                {formatCurrency(amountDue)}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10 grid grid-cols-[1.5fr_1fr_1fr_1.4fr] gap-8 print:mt-8">
          <div>
            <PrintLabel>Billed To</PrintLabel>

            <p className="mt-2 text-base leading-6">
              {billedToName}
            </p>

            {billedToAddress && (
              <p className="whitespace-pre-line text-base leading-6">
                {billedToAddress}
              </p>
            )}

            {serviceAddress ? (
              <div className="mt-5">
                <PrintLabel>Service Address</PrintLabel>

                <p className="mt-2 whitespace-pre-line text-base leading-6">
                  {serviceAddress}
                </p>
              </div>
            ) : null}
          </div>

          <div>
            <PrintLabel>Date of Issue</PrintLabel>

            <p className="mt-2 text-base">
              {formatDate(invoice.issue_date)}
            </p>

            <div className="mt-5">
              <PrintLabel>Due Date</PrintLabel>

              <p className="mt-2 text-base">
                {formatDate(invoice.due_date)}
              </p>
            </div>
          </div>

          <div>
            <PrintLabel>Invoice Number</PrintLabel>

            <p className="mt-2 text-base">
              {invoice.display_id || "Invoice"}
            </p>

            <div className="mt-5">
              <PrintLabel>Reference</PrintLabel>

              <p className="mt-2 whitespace-pre-line text-base leading-6">
                {invoice.reference || "-"}
              </p>
            </div>
          </div>

          <div />
        </section>

        <section className="mt-10 print:mt-8">
          <div className="border-t-4 border-[#e8bd3f] pt-4">
            <div className="grid grid-cols-[1fr_160px_90px_150px] gap-6 text-[#d9aa2f]">
              <p>Description</p>
              <p className="text-right">Rate</p>
              <p className="text-right">Qty</p>
              <p className="text-right">Line Total</p>
            </div>
          </div>

          <div className="mt-5 border-b border-gray-300 pb-5">
            {lineItems.length === 0 ? (
              <div className="grid grid-cols-[1fr_160px_90px_150px] gap-6">
                <p>{invoice.project_title || "Service"}</p>
                <p className="text-right">
                  {formatCurrency(subtotal)}
                </p>
                <p className="text-right">1</p>
                <p className="text-right">
                  {formatCurrency(subtotal)}
                </p>
              </div>
            ) : (
              <div className="grid gap-5">
                {lineItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_160px_90px_150px] gap-6"
                  >
                    <p className="whitespace-pre-line leading-7">
                      {item.description || "Line item"}
                    </p>

                    <p className="text-right">
                      {formatCurrency(
                        toNumber(item.unit_price)
                      )}
                    </p>

                    <p className="text-right">
                      {toNumber(item.quantity)}
                    </p>

                    <p className="text-right">
                      {formatCurrency(
                        toNumber(item.line_total)
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto mt-8 w-full max-w-md">
            <PrintSummaryRow
              label="Subtotal"
              value={formatCurrency(subtotal)}
            />

            <PrintSummaryRow
              label={`${invoice.tax_label || "Tax"} (${taxRate}%)`}
              value={formatCurrency(taxAmount)}
            />

            <div className="mt-4 border-t border-gray-300 pt-4">
              <PrintSummaryRow
                label="Total"
                value={formatCurrency(total)}
              />

              <PrintSummaryRow
                label="Amount Paid"
                value={formatCurrency(amountPaid)}
              />
            </div>

            <div className="mt-3 border-t-4 border-double border-gray-300 pt-5">
              <div className="flex items-center justify-between gap-6">
                <p className="text-xl text-[#d9aa2f]">
                  Amount Due (USD)
                </p>

                <p className="text-xl font-semibold">
                  {formatCurrency(amountDue)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12 print:mt-10">
          <PrintLabel>Terms</PrintLabel>

          <p className="mt-3 max-w-4xl text-base leading-6">
            {invoice.terms ||
              "Payment due upon invoice. Thank you for your business."}
          </p>
        </section>

        {invoice.notes && (
          <section className="mt-8">
            <PrintLabel>Notes</PrintLabel>

            <p className="mt-3 max-w-4xl whitespace-pre-line text-base leading-6">
              {invoice.notes}
            </p>
          </section>
        )}

        <div className="mt-12 print:hidden">
          <Link
            href={`/invoices/${invoice.id}?business=${businessSlug}`}
            className="text-orange-600 underline"
          >
            Back to Invoice
          </Link>
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
    <p className="text-lg text-[#d9aa2f]">
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
    <div className="flex items-center justify-between gap-6 py-1 text-lg">
      <p>{label}</p>

      <p>{value}</p>
    </div>
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
  businessSlug,
  backHref,
  standardTemplateHref,
  excelHref,
}: {
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
  businessSlug: string;
  backHref: string;
  standardTemplateHref: string;
  excelHref: string;
}) {
  const servicePeriod =
    getServicePeriod(invoice.issue_date);
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
        alternateHref={standardTemplateHref}
        alternateLabel="Use Standard Format"
        downloadHref={excelHref}
        downloadLabel="Download Excel"
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
            {formatDate(invoice.issue_date)}
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
          <Link
            href={`/invoices/${invoice.id}?business=${businessSlug}`}
            className="text-orange-600 underline"
          >
            Back to Invoice
          </Link>
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
    ? new Date(`${issueDate}T00:00:00`)
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
