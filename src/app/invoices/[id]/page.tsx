import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";
import StatusBadge from "../../components/StatusBadge";
import InternalNotes from "../../components/InternalNotes";
import DeleteInvoiceButton from "../../components/DeleteInvoiceButton";
import OutlookDraftPrepCard from "../../components/OutlookDraftPrepCard";
import SplitInvoicePlanner from "../../components/SplitInvoicePlanner";
import UpdateInvoiceStatusButton from "../../components/UpdateInvoiceStatusButton";
import { buildOutlookDraftPreview } from "../../lib/outlookDrafts";
import { supabase } from "../../lib/supabase";
import { formatTaxSummaryLabel } from "../../utils/tax";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ business?: string }>;
};

type Invoice = {
  id: string;
  estimate_id: string | null;
  business_id: string;
  client_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: number | string | null;
  status: string | null;
  display_id: string | null;
  issue_date: string | null;
  due_date: string | null;
  reference: string | null;
  tax_label: string | null;
  tax_rate: number | string | null;
  tax_number: string | null;
  amount_paid: number | string | null;
  split_warning_enabled: boolean | null;
  split_target_amount: number | string | null;
  split_parent_invoice_id: string | null;
  split_sequence: number | null;
  split_count: number | null;
  terms: string | null;
  notes: string | null;
  service_address: string | null;
};

type InvoiceLineItem = {
  id: string;
  description: string;
  quantity: number | string | null;
  unit_price: number | string | null;
  line_total: number | string | null;
  sort_order: number | null;
};

type LinkedEstimate = {
  id: string;
  display_id: string | null;
  project_title: string | null;
};

type SplitRelatedInvoice = {
  id: string;
  display_id: string | null;
  project_title: string | null;
  status: string | null;
  split_sequence: number | null;
  split_count: number | null;
};

type Business = {
  id: string;
  slug: string;
  split_warning_amount: number | string | null;
};

function money(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(safeValue);
}

function numberValue(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? 0).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const normalizedValue = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)
    ? new Date(`${normalizedValue}T00:00:00`)
    : new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  }).format(date);
}

function getSplitPreview(subtotalAmount: number, targetAmount: number) {
  if (subtotalAmount <= targetAmount || targetAmount <= 0) {
    return null;
  }

  const invoiceCount = Math.ceil(subtotalAmount / targetAmount);

  return {
    invoiceCount,
    averageAmount: subtotalAmount / invoiceCount,
  };
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

function Info({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-sm text-zinc-400">{label}</p>
      <p
        className={`mt-2 ${
          strong ? "text-lg font-bold text-orange-400" : "text-lg text-white"
        }`}
      >
        {value || "-"}
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        strong ? "text-lg font-bold text-orange-400" : ""
      }`}
    >
      <span className="text-zinc-400">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function ProblemCard({
  title,
  message,
  businessQuery,
}: {
  title: string;
  message: string;
  businessQuery: string;
}) {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <Link
          href={`/invoices${businessQuery}`}
          className="text-sm font-semibold text-orange-400 hover:text-orange-300"
        >
          Back to Invoices
        </Link>

        <Card className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-orange-400">
            Invoice Details
          </p>
          <h1 className="mt-3 text-3xl font-black text-white">{title}</h1>
          <p className="mt-3 leading-7 text-zinc-400">{message}</p>
        </Card>
      </main>
    </AppShell>
  );
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const businessQuery = `?business=${businessSlug}`;

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, slug, split_warning_amount")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle<Business>();

  if (businessError) {
    console.error("Business lookup failed:", businessError);
  }

  if (!business) {
    return (
      <ProblemCard
        title="Business Not Found"
        message={`Trimax could not find a business for "${businessSlug}".`}
        businessQuery={businessQuery}
      />
    );
  }

  const { data: invoiceData, error: invoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .limit(1)
    .maybeSingle();

  if (invoiceError) {
    console.error("Invoice lookup failed:", invoiceError);
  }

  const invoice = invoiceData as Invoice | null;

  if (!invoice) {
    return (
      <ProblemCard
        title="Invoice Not Found"
        message="Trimax could not find this invoice record. It may have been deleted, or the link may be old."
        businessQuery={businessQuery}
      />
    );
  }

  if (String(invoice.business_id) !== String(business.id)) {
    return (
      <ProblemCard
        title="Wrong Business Context"
        message="This invoice exists, but it does not belong to the selected business. Go back to invoices and choose the correct business."
        businessQuery={businessQuery}
      />
    );
  }

  const { data: lineItems, error: lineItemsError } = await supabase
    .from("invoice_line_items")
    .select("id, description, quantity, unit_price, line_total, sort_order")
    .eq("invoice_id", invoice.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<InvoiceLineItem[]>();

  if (lineItemsError) {
    console.error("Invoice line items lookup failed:", lineItemsError);
  }

  let linkedEstimate: LinkedEstimate | null = null;
  let splitParentInvoice: SplitRelatedInvoice | null = null;
  let splitRelatedInvoices: SplitRelatedInvoice[] = [];

  if (invoice.estimate_id) {
    const { data, error } = await supabase
      .from("estimates")
      .select("id, display_id, project_title")
      .eq("id", invoice.estimate_id)
      .limit(1)
      .maybeSingle<LinkedEstimate>();

    if (error) {
      console.error("Linked estimate lookup failed:", error);
    }

    linkedEstimate = data ?? null;
  }

  if (invoice.split_parent_invoice_id) {
    const { data: parentData, error: parentError } = await supabase
      .from("invoices")
      .select(
        "id, display_id, project_title, status, split_sequence, split_count"
      )
      .eq("id", invoice.split_parent_invoice_id)
      .eq("business_id", business.id)
      .limit(1)
      .maybeSingle<SplitRelatedInvoice>();

    if (parentError) {
      console.error("Split parent lookup failed:", parentError);
    }

    splitParentInvoice = parentData ?? null;

    const { data: siblingData, error: siblingError } = await supabase
      .from("invoices")
      .select(
        "id, display_id, project_title, status, split_sequence, split_count"
      )
      .eq("split_parent_invoice_id", invoice.split_parent_invoice_id)
      .eq("business_id", business.id)
      .order("split_sequence", { ascending: true })
      .returns<SplitRelatedInvoice[]>();

    if (siblingError) {
      console.error("Split sibling lookup failed:", siblingError);
    }

    splitRelatedInvoices = siblingData ?? [];
  } else {
    const { data: childData, error: childError } = await supabase
      .from("invoices")
      .select(
        "id, display_id, project_title, status, split_sequence, split_count"
      )
      .eq("split_parent_invoice_id", invoice.id)
      .eq("business_id", business.id)
      .order("split_sequence", { ascending: true })
      .returns<SplitRelatedInvoice[]>();

    if (childError) {
      console.error("Split child lookup failed:", childError);
    }

    splitRelatedInvoices = childData ?? [];
  }

  const items = lineItems ?? [];

  const subtotalFromLines = items.reduce((sum, item) => {
    const quantity = numberValue(item.quantity);
    const unitPrice = numberValue(item.unit_price);
    const savedLineTotal = numberValue(item.line_total);
    const calculatedLineTotal = quantity * unitPrice;

    return sum + (savedLineTotal || calculatedLineTotal);
  }, 0);

  const fallbackSubtotal = numberValue(invoice.invoice_amount);
  const subtotal = items.length > 0 ? subtotalFromLines : fallbackSubtotal;
  const taxRate = numberValue(invoice.tax_rate);
  const taxAmount = subtotal * (taxRate / 100);
  const invoiceTotal = subtotal + taxAmount;
  const amountPaid = numberValue(invoice.amount_paid);
  const amountDue = Math.max(invoiceTotal - amountPaid, 0);
  const customerName = invoice.customer_name || "Customer";
  const projectTitle = invoice.project_title || customerName || "Invoice";
  const status = invoice.status || "Draft";
  const normalizedStatus = status.toLowerCase();
  const showFiveStarsBoaPrintButton =
    business.slug === "just-kleen" &&
    looksLikeFiveStarsBoaInvoice(invoice, items);
  const outlookDraftPreview = buildOutlookDraftPreview("invoice", {
    businessSlug,
    customerName,
    documentNumber: invoice.display_id,
    projectTitle,
    amountDue: money(amountDue),
    dueDate: invoice.due_date ? formatDate(invoice.due_date) : null,
    serviceAddress: invoice.service_address,
    reference: invoice.reference,
  });

  const splitWarningAmount =
    numberValue(invoice.split_target_amount) ||
    numberValue(business.split_warning_amount);
  const showSplitWarning =
    Boolean(invoice.split_warning_enabled) &&
    splitWarningAmount > 0 &&
    subtotal > splitWarningAmount;
  const splitPreview = invoice.split_warning_enabled
    ? getSplitPreview(subtotal, splitWarningAmount)
    : null;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="mb-10">
          <Link
            href={`/invoices${businessQuery}`}
            className="text-sm font-semibold text-orange-400 hover:text-orange-300"
          >
            Back to Invoices
          </Link>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-orange-400">
                Invoice Details
              </p>
              <h1 className="mt-3 text-4xl font-black text-white">
                {projectTitle}
              </h1>
              <p className="mt-3 text-lg text-zinc-400">
                {invoice.display_id || "Invoice"}
              </p>
            </div>

            <StatusBadge status={status} />
          </div>
        </div>

        <div className="space-y-6">
          {showSplitWarning ? (
            <Card className="border-yellow-500/60 bg-yellow-500/10">
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-yellow-300">
                Split Warning
              </p>
              <p className="mt-3 text-lg font-bold text-yellow-100">
                This invoice subtotal is over {money(splitWarningAmount)}.
              </p>
              <p className="mt-3 text-sm leading-6 text-yellow-100/80">
                Consider splitting this apartment work into smaller invoices
                before sending.
              </p>
            </Card>
          ) : null}

          {splitPreview ? (
            <SplitInvoicePlanner
              subtotalAmount={subtotal}
              targetAmount={splitWarningAmount}
              taxLabel={invoice.tax_label || "Tax"}
              taxRate={taxRate}
              taxNumber={invoice.tax_number}
              sourceInvoice={{
                id: invoice.id,
                displayId: invoice.display_id,
                businessId: invoice.business_id,
                businessSlug,
                clientId: invoice.client_id,
                customerName,
                projectTitle,
                issueDate: invoice.issue_date,
                dueDate: invoice.due_date,
                reference: invoice.reference,
                serviceAddress: invoice.service_address,
                terms: invoice.terms,
                notes: invoice.notes,
              }}
            />
          ) : null}

          {splitParentInvoice || splitRelatedInvoices.length > 0 ? (
            <Card className="border-green-500/40 bg-green-500/10">
              <div className="flex flex-col gap-6">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.35em] text-green-300">
                    Split Invoice Group
                  </p>

                  <p className="mt-3 text-lg font-bold text-green-100">
                    {invoice.split_parent_invoice_id
                      ? `Split ${
                          invoice.split_sequence ?? "-"
                        } of ${invoice.split_count ?? "-"} from ${
                          splitParentInvoice?.display_id ||
                          "the original invoice"
                        }`
                      : `This invoice has ${splitRelatedInvoices.length} split invoice${
                          splitRelatedInvoices.length === 1 ? "" : "s"
                        }.`}
                  </p>

                  <p className="mt-2 text-sm leading-6 text-green-100/70">
                    {invoice.split_parent_invoice_id
                      ? "This invoice is one part of a larger invoice split."
                      : "These invoices were created from this original invoice."}
                  </p>
                </div>

                {splitParentInvoice ? (
                  <div className="rounded-2xl border border-green-500/30 bg-black/20 p-4">
                    <p className="text-sm text-green-100/70">
                      Original Invoice
                    </p>

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-white">
                          {splitParentInvoice.display_id || "Invoice"}
                        </p>

                        <p className="mt-1 text-sm text-green-100/70">
                          {splitParentInvoice.project_title ||
                            "Untitled invoice"}
                        </p>
                      </div>

                      <Link
                        href={`/invoices/${splitParentInvoice.id}${businessQuery}`}
                      >
                        <Button variant="secondary">Open Original</Button>
                      </Link>
                    </div>
                  </div>
                ) : null}

                {splitRelatedInvoices.length > 0 ? (
                  <div className="overflow-hidden rounded-2xl border border-green-500/30">
                    <div className="grid grid-cols-[1fr_120px_150px] gap-4 bg-black/30 px-5 py-3 text-sm font-bold text-green-100/80">
                      <span>Related Invoice</span>
                      <span>Status</span>
                      <span className="text-right">Action</span>
                    </div>

                    {splitRelatedInvoices.map((relatedInvoice) => (
                      <div
                        key={relatedInvoice.id}
                        className="grid grid-cols-[1fr_120px_150px] gap-4 border-t border-green-500/20 px-5 py-4 text-green-50"
                      >
                        <div>
                          <p className="font-semibold">
                            {relatedInvoice.display_id || "Invoice"}
                          </p>

                          <p className="mt-1 text-sm text-green-100/70">
                            {relatedInvoice.project_title ||
                              "Untitled invoice"}
                          </p>
                        </div>

                        <span className="text-sm text-green-100/80">
                          {relatedInvoice.status || "Draft"}
                        </span>

                        <Link
                          href={`/invoices/${relatedInvoice.id}${businessQuery}`}
                          className="text-right text-sm font-semibold text-orange-300 hover:text-orange-200"
                        >
                          Open
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {linkedEstimate ? (
            <Card>
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.35em] text-purple-300">
                    Linked Estimate
                  </p>
                  <p className="mt-4 text-lg font-bold text-white">
                    {linkedEstimate.display_id || "Estimate"}
                  </p>
                  <p className="mt-2 text-zinc-400">
                    {linkedEstimate.project_title || "Untitled estimate"}
                  </p>
                </div>

                <Link href={`/estimates/${linkedEstimate.id}${businessQuery}`}>
                  <Button variant="secondary">Open Estimate</Button>
                </Link>
              </div>
            </Card>
          ) : null}

          <OutlookDraftPrepCard
            documentLabel="Invoice"
            preview={outlookDraftPreview}
            printHref={`/invoices/${invoice.id}/print${businessQuery}`}
          />

          <Card>
            <div className="grid gap-8 md:grid-cols-2">
              <Info label="Customer" value={customerName} />
              <Info label="Amount Due" value={money(amountDue)} strong />
              <Info
                label="Split Target"
                value={
                  invoice.split_warning_enabled && splitWarningAmount > 0
                    ? money(splitWarningAmount)
                    : "-"
                }
              />
              <Info label="Issue Date" value={formatDate(invoice.issue_date)} />
              <Info label="Due Date" value={formatDate(invoice.due_date)} />
              <Info
                label="Invoice Number"
                value={invoice.display_id || "Invoice"}
              />
              <Info label="Reference" value={invoice.reference || "-"} />
              <Info
                label="Service Address"
                value={invoice.service_address || "-"}
              />
            </div>
          </Card>

          <Card>
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-bold text-white">Line Items</h2>
              <p className="text-2xl font-black text-orange-400">
                {money(amountDue)}
              </p>
            </div>

            {items.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-zinc-800">
                <div className="grid grid-cols-[1fr_90px_130px_130px] gap-4 bg-black/50 px-5 py-4 text-sm font-bold text-zinc-400">
                  <div>Description</div>
                  <div className="text-right">Qty</div>
                  <div className="text-right">Unit</div>
                  <div className="text-right">Total</div>
                </div>

                {items.map((item) => {
                  const quantity = numberValue(item.quantity);
                  const unitPrice = numberValue(item.unit_price);
                  const savedLineTotal = numberValue(item.line_total);
                  const lineTotal = savedLineTotal || quantity * unitPrice;

                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[1fr_90px_130px_130px] gap-4 border-t border-zinc-800 px-5 py-4 text-white"
                    >
                      <div>{item.description}</div>
                      <div className="text-right">{quantity}</div>
                      <div className="text-right">{money(unitPrice)}</div>
                      <div className="text-right font-bold text-orange-400">
                        {money(lineTotal)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-zinc-400">No line items added.</p>
            )}

            <div className="ml-auto mt-8 max-w-sm space-y-4">
              <SummaryRow label="Subtotal" value={money(subtotal)} />
              <SummaryRow
                label={formatTaxSummaryLabel({
                  label: invoice.tax_label,
                  rate: taxRate,
                  taxNumber: invoice.tax_number,
                })}
                value={money(taxAmount)}
              />
              <SummaryRow label="Total" value={money(invoiceTotal)} />
              <SummaryRow label="Amount Paid" value={money(amountPaid)} />

              <div className="border-t border-zinc-700 pt-4">
                <SummaryRow
                  label="Amount Due"
                  value={money(amountDue)}
                  strong
                />
              </div>
            </div>
          </Card>

          <Card>
            <Info label="Notes" value={invoice.notes || "No notes added."} />
          </Card>

          <InternalNotes
            businessId={business.id}
            entityType="invoice"
            entityId={invoice.id}
            title="Invoice Conversation"
          />

          {invoice.terms ? (
            <Card>
              <Info label="Terms" value={invoice.terms} />
            </Card>
          ) : null}

          <div className="flex flex-wrap gap-4">
            {normalizedStatus === "draft" ? (
              <UpdateInvoiceStatusButton
                invoiceId={invoice.id}
                newStatus="sent"
                label="Mark Sent"
                businessId={invoice.business_id}
                invoiceLabel={
                  invoice.display_id ||
                  projectTitle
                }
              />
            ) : null}

            {normalizedStatus !== "paid" ? (
              <UpdateInvoiceStatusButton
                invoiceId={invoice.id}
                newStatus="paid"
                label="Mark Paid"
                businessId={invoice.business_id}
                invoiceLabel={
                  invoice.display_id ||
                  projectTitle
                }
              />
            ) : null}

            <Button variant="secondary">Send Reminder</Button>

            {showFiveStarsBoaPrintButton ? (
              <Link
                href={`/invoices/${invoice.id}/print${businessQuery}&template=5stars-boa`}
              >
                <Button variant="secondary">
                  Print 5Stars BOA Format
                </Button>
              </Link>
            ) : null}

            {showFiveStarsBoaPrintButton ? (
              <a
                href={`/invoices/${invoice.id}/exports/5stars-boa${businessQuery}`}
              >
                <Button variant="secondary">
                  Download 5Stars Excel
                </Button>
              </a>
            ) : null}

            <Link href={`/invoices/${invoice.id}/print${businessQuery}`}>
              <Button variant="secondary">Print Invoice</Button>
            </Link>

            <Link href={`/invoices/${invoice.id}/edit${businessQuery}`}>
              <Button variant="secondary">Edit Invoice</Button>
            </Link>

            <DeleteInvoiceButton
              invoiceId={invoice.id}
              returnHref={`/invoices${businessQuery}`}
            />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
