import { supabase } from "../../../../lib/supabase";

type Invoice = {
  id: string;
  business_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | null;
  display_id: string | null;
  issue_date: string | null;
  reference: string | null;
  service_address: string | null;
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
  slug: string | null;
};

function toNumber(value: number | string | null) {
  return Number(value) || 0;
}

function parseCurrency(value: string | null) {
  return Number(value?.replace(/[^0-9.]/g, "") ?? 0) || 0;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatShortDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${String(
    date.getFullYear()
  ).slice(-2)}`;
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

function formatDate(value: string | null) {
  if (!value) {
    return formatShortDate(new Date());
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return formatShortDate(date);
}

function formatPlainMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
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

function cleanFiveStarsAccountName(description: string) {
  return description
    .replace(/\s*[-|]\s*(\d+\/w|[0-9]\s*(x|times)?\s*(per\s*)?week).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRows(
  invoice: Invoice,
  lineItems: InvoiceLineItem[],
  servicePeriod: {
    from: string;
    to: string;
  }
) {
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

function looksLikeFiveStarsBoaInvoice(
  invoice: Invoice,
  lineItems: InvoiceLineItem[]
) {
  const combinedText = [
    invoice.customer_name,
    invoice.project_title,
    invoice.reference,
    invoice.service_address,
    invoice.notes,
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

function spreadsheetHtml(invoice: Invoice, lineItems: InvoiceLineItem[]) {
  const servicePeriod = getServicePeriod(invoice.issue_date);
  const rows = buildRows(invoice, lineItems, servicePeriod);
  const total = rows.reduce(
    (sum, row) => sum + row.amountThisMonth,
    0
  );
  const blankRows = Array.from({
    length: Math.max(10, 16 - rows.length),
  });

  const lineRows = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.accountName)}</td>
          <td class="right">${escapeHtml(row.serviceDateFrom)}</td>
          <td class="right">${escapeHtml(row.serviceDateTo)}</td>
          <td class="right number">${escapeHtml(formatPlainMoney(row.monthlyBilling))}</td>
          <td class="right number">${escapeHtml(formatPlainMoney(row.amountThisMonth))}</td>
          <td class="center">${escapeHtml(row.scheduledServices)}</td>
        </tr>`
    )
    .join("");

  const emptyRows = blankRows
    .map(
      () => `
        <tr>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #ffffff; }
    table { border-collapse: collapse; table-layout: fixed; }
    .sheet { width: 760px; }
    td, th { border: 1px solid #000000; padding: 4px; font-size: 11px; vertical-align: middle; }
    .no-border { border: 0; }
    .purple { background: #c08cff; font-weight: 800; }
    .blue { background: #24227c; color: #ffffff; font-weight: 800; }
    .yellow { background: #ffd51a; font-weight: 800; }
    .cyan { background: #cdfcff; font-weight: 800; text-align: center; }
    .invoice-title { font-size: 26px; font-weight: 900; }
    .small-label { font-style: italic; font-weight: 800; }
    .right { text-align: right; }
    .center { text-align: center; }
    .number { mso-number-format: "#,##0.00"; }
    .thick-top { border-top: 3px solid #000000; }
    .thick-bottom { border-bottom: 3px solid #000000; }
    .thanks { font-weight: 800; text-align: center; }
  </style>
</head>
<body>
  <table class="sheet">
    <colgroup>
      <col style="width: 230px" />
      <col style="width: 95px" />
      <col style="width: 100px" />
      <col style="width: 105px" />
      <col style="width: 110px" />
      <col style="width: 120px" />
    </colgroup>
    <tr>
      <td colspan="3" class="purple invoice-title">INVOICE</td>
      <td class="purple center">-</td>
      <td class="purple center small-label">INVOICE #</td>
      <td class="purple center">${escapeHtml(invoice.display_id || "")}</td>
    </tr>
    <tr>
      <td colspan="6" class="no-border">&nbsp;</td>
    </tr>
    <tr>
      <td colspan="4" class="blue">BILL FROM:</td>
      <td colspan="2" class="yellow">BILL TO:</td>
    </tr>
    <tr>
      <td class="small-label">COMPANY NAME:</td>
      <td colspan="3">JUST KLEEN</td>
      <td colspan="2" class="yellow center">5STARS, INC.</td>
    </tr>
    <tr>
      <td class="small-label">CONTACT NAME:</td>
      <td colspan="3">LYUBOV SWEET</td>
      <td colspan="2" class="yellow center">P.O BOX 2574</td>
    </tr>
    <tr>
      <td class="small-label">ADDRESS:</td>
      <td colspan="3">1011 90TH ST SW UNIT B</td>
      <td colspan="2" class="yellow center">REDMOND, WA 98073</td>
    </tr>
    <tr>
      <td class="small-label">CITY/STATE/ZIP:</td>
      <td colspan="3">EVERETT WA 98204</td>
      <td colspan="2">&nbsp;</td>
    </tr>
    <tr>
      <td colspan="2" class="right small-label thick-top">DATE:</td>
      <td colspan="4" class="right thick-top">${escapeHtml(formatDate(invoice.issue_date))}</td>
    </tr>
    <tr>
      <th class="cyan">ACCOUNT NAME</th>
      <th class="cyan">SERVICE DATE FROM</th>
      <th class="cyan">SERVICE DATE TO</th>
      <th class="cyan">MONTHLY BILLING</th>
      <th class="cyan">AMOUNT THIS MONTH</th>
      <th class="cyan">SCHEDULED SERVICES</th>
    </tr>
    ${lineRows}
    ${emptyRows}
    <tr>
      <td class="right small-label">TOTAL</td>
      <td colspan="3">&nbsp;</td>
      <td class="right number">${escapeHtml(formatPlainMoney(total))}</td>
      <td class="right small-label">NOTES:</td>
    </tr>
    <tr>
      <td class="right small-label">SIGNATURE:</td>
      <td colspan="2">SL</td>
      <td colspan="3">${escapeHtml(invoice.notes)}</td>
    </tr>
    <tr>
      <td colspan="3" class="thanks">THANK YOU FOR YOUR BUSINESS</td>
      <td colspan="3">&nbsp;</td>
    </tr>
  </table>
</body>
</html>`;
}

function safeFileName(value: string) {
  return value
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const businessSlug =
    url.searchParams.get("business") || "rnl-creations";

  const { data: businessData } = await supabase
    .from("businesses")
    .select("id, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  const business = businessData as Business | null;

  if (!business || business.slug !== "just-kleen") {
    return new Response(
      "This export is only available in the Just Kleen workspace.",
      {
        status: 404,
      }
    );
  }

  const { data: invoiceData, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("business_id", business.id)
    .limit(1)
    .maybeSingle();

  if (error || !invoiceData) {
    return new Response("Invoice not found.", {
      status: 404,
    });
  }

  const invoice = invoiceData as Invoice;

  const { data: lineItemData } = await supabase
    .from("invoice_line_items")
    .select("*")
    .eq("invoice_id", invoice.id)
    .eq("business_id", business.id)
    .order("sort_order", {
      ascending: true,
    });

  const lineItems =
    (lineItemData ?? []) as InvoiceLineItem[];

  if (!looksLikeFiveStarsBoaInvoice(invoice, lineItems)) {
    return new Response("This export is only available for Just Kleen 5Stars BOA invoices.", {
      status: 404,
    });
  }

  const fileName = safeFileName(
    `${invoice.display_id || "invoice"}-5stars-boa`
  );

  return new Response(spreadsheetHtml(invoice, lineItems), {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}.xls"`,
      "Cache-Control": "no-store",
    },
  });
}
