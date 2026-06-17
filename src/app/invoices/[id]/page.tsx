import Link from "next/link";
import AppShell from "../../components/AppShell";
import BackButton from "../../components/BackButton";
import Card from "../../components/Card";
import Button from "../../components/Button";
import StatusBadge from "../../components/StatusBadge";
import InternalNotes from "../../components/InternalNotes";
import DeleteInvoiceButton from "../../components/DeleteInvoiceButton";
import InvoiceEmailSendPanel from "../../components/InvoiceEmailSendPanel";
import RequestDepositButton from "../../components/RequestDepositButton";
import SplitInvoicePlanner from "../../components/SplitInvoicePlanner";
import UpdateInvoiceStatusButton from "../../components/UpdateInvoiceStatusButton";
import { buildSplitInvoicePlan } from "../../lib/splitInvoices";
import { supabase } from "../../lib/supabase";
import { getSmartInvoiceDates } from "../../utils/invoiceDates";
import {
  formatTaxSummaryLabel,
  getEffectiveTaxRate,
} from "../../utils/tax";
import { maybeCanonicalApartmentUnitLabel } from "../../utils/unitLabels";

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
  name: string | null;
  split_warning_amount: number | string | null;
};

type ClientContact = {
  name: string | null;
  contact_name: string | null;
  email: string | null;
  cc_email: string | null;
};

type ActivityLog = {
  id: string;
  actor_email: string | null;
  action: string;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
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

function formatDateTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function daysPastDue(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.floor((today.getTime() - date.getTime()) / 86_400_000);
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

function detailText(
  details: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = details?.[key];

  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function detailMoney(
  details: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = details?.[key];
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? numberValue(value)
        : 0;

  return parsed > 0 ? money(parsed) : null;
}

function formatPdfSource(source: string | null) {
  if (!source) return null;
  if (source === "print-page") return "Customer PDF matched print page";
  if (source === "fallback") return "Backup PDF used";
  return source;
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    "invoice.email_sent": "Invoice sent",
    "invoice.payment_reminder_sent": "Payment reminder sent",
    "invoice.deposit_requested": "Deposit requested",
    "invoice.deposit_cleared": "Deposit cleared",
    "invoice.batch_payment_applied": "Payment recorded",
    "invoice.status_updated": "Status changed",
    "invoice.split_created": "Split invoice created",
    "invoice.recurring_draft_created": "Recurring draft created",
  };

  return labels[action] ?? action.replaceAll("_", " ");
}

function evidenceFields(log: ActivityLog) {
  const details = log.details ?? {};
  const fields: { label: string; value: string | null }[] = [];
  const push = (label: string, value: string | null) => {
    if (value) fields.push({ label, value });
  };

  if (
    log.action === "invoice.email_sent" ||
    log.action === "invoice.payment_reminder_sent"
  ) {
    push("To", detailText(details, "recipient_email"));
    push("CC", detailText(details, "cc_email"));
    push("Private copy", detailText(details, "bcc_email"));
    push("Subject", detailText(details, "subject"));
    push(
      "PDF",
      detailText(details, "pdf_attached") === "true"
        ? formatPdfSource(detailText(details, "pdf_attachment_source")) ??
            "Attached"
        : "Not attached"
    );
    push("Sender", detailText(details, "sender_email"));
    return fields;
  }

  if (log.action === "invoice.batch_payment_applied") {
    push("Amount applied", detailMoney(details, "amountApplied"));
    push("Check amount", detailMoney(details, "checkAmount"));
    push("Reference", detailText(details, "paymentReference"));
    push("Payment date", detailText(details, "paymentDate"));
    push("Outcome", detailText(details, "paymentOutcome"));
    push("Stub image", detailText(details, "paymentImageFileName"));
    push("Internal note", detailText(details, "internalNote"));
    return fields;
  }

  if (log.action === "invoice.deposit_requested") {
    push("Deposit amount", detailMoney(details, "depositAmount"));
    push("Note", detailText(details, "note"));
    return fields;
  }

  if (log.action === "invoice.deposit_cleared") {
    push("Result", "Deposit request cleared");
    return fields;
  }

  Object.entries(details)
    .slice(0, 6)
    .forEach(([key, value]) => {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        push(
          key
            .replace(/_/g, " ")
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/^./, (letter) => letter.toUpperCase()),
          String(value)
        );
      }
    });

  return fields;
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
    <div className="min-w-0">
      <p className="text-sm text-zinc-400">{label}</p>
      <p
        className={`mt-2 min-w-0 overflow-wrap-anywhere ${
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
      <span className="min-w-0 text-zinc-400">{label}</span>
      <span className="shrink-0 font-semibold text-white">{value}</span>
    </div>
  );
}

function EvidenceTrail({ logs }: { logs: ActivityLog[] }) {
  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-sky-300">
            Proof Vault
          </p>
          <h2 className="mt-3 text-2xl font-black text-white">
            Invoice evidence trail
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Trimax keeps the important proof in one place: sends, reminders,
            deposit actions, payment applications, check references, and stored
            payment images.
          </p>
        </div>
        <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
          {logs.length} saved event{logs.length === 1 ? "" : "s"}
        </div>
      </div>

      {logs.length > 0 ? (
        <div className="mt-6 space-y-4">
          {logs.map((log) => {
            const fields = evidenceFields(log);

            return (
              <div
                key={log.id}
                className="rounded-2xl border border-zinc-800 bg-black/30 p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-black text-white">
                      {activityLabel(log.action)}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {log.actor_email
                        ? `Recorded by ${log.actor_email}`
                        : "Recorded by Trimax"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-zinc-400">
                    {formatDateTime(log.created_at)}
                  </p>
                </div>

                {fields.length > 0 ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {fields.map((field) => (
                      <div
                        key={`${log.id}-${field.label}`}
                        className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2"
                      >
                        <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-zinc-500">
                          {field.label}
                        </p>
                        <p className="mt-1 overflow-wrap-anywhere text-sm font-semibold text-zinc-100">
                          {field.value}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-800 bg-black/20 p-5 text-sm leading-6 text-zinc-400">
          No proof events have been logged for this invoice yet. Customer
          emails, late reminders, deposit requests, and payment applications
          will appear here automatically as they happen.
        </div>
      )}
    </Card>
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
        <BackButton label="Back" fallbackHref={`/invoices${businessQuery}`} />

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
    .select("id, slug, name, split_warning_amount")
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
  let clientContact: ClientContact | null = null;
  let invoiceActivityLogs: ActivityLog[] = [];

  if (invoice.client_id) {
    const { data, error } = await supabase
      .from("clients")
      .select("name, contact_name, email, cc_email")
      .eq("id", invoice.client_id)
      .eq("business_id", business.id)
      .limit(1)
      .maybeSingle<ClientContact>();

    if (error) {
      console.error("Client contact lookup failed:", error);
    }

    clientContact = data ?? null;
  }

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

  const { data: activityData, error: activityError } = await supabase
    .from("activity_logs")
    .select("id, actor_email, action, entity_label, details, created_at")
    .eq("business_id", business.id)
    .eq("entity_type", "invoice")
    .eq("entity_id", invoice.id)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<ActivityLog[]>();

  if (activityError) {
    console.error("Invoice activity lookup failed:", activityError);
  }

  invoiceActivityLogs = activityData ?? [];

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
  const taxRate = getEffectiveTaxRate({
    taxMode: invoice.tax_mode,
    taxRate: invoice.tax_rate,
  });
  const taxAmount = subtotal * (taxRate / 100);
  const invoiceTotal = subtotal + taxAmount;
  const amountPaid = numberValue(invoice.amount_paid);
  const amountDue = Math.max(invoiceTotal - amountPaid, 0);
  const depositRequestedAmount = numberValue(
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
  const amountDueLabel = hasDepositRequest ? "Deposit Due" : "Amount Due";
  const balanceAfterDepositRequest = Math.max(
    invoiceTotal - depositRequestedAmount,
    0
  );
  const customerName = invoice.customer_name || "Customer";
  const projectTitle = invoice.project_title || customerName || "Invoice";
  const businessName =
    business.name ||
    (business.slug === "just-kleen" ? "Just Kleen" : "R&L Creations");
  const recipientEmail = clientContact?.email ?? null;
  const invoiceNumber = invoice.display_id || "Invoice";
  const displayReference = maybeCanonicalApartmentUnitLabel(invoice.reference);
  const smartInvoiceDates = getSmartInvoiceDates({
    customerName,
    projectTitle,
    serviceAddress: invoice.service_address ?? "",
    reference: displayReference,
    notes: invoice.notes ?? "",
    terms:
      invoice.terms ??
      "Payment due upon invoice. Thank you for your business.",
    lineItems: items.map((item) => ({
      description: item.description ?? "",
    })),
    issueDate: invoice.issue_date ?? invoice.created_at,
  });
  const displayIssueDate =
    invoice.issue_date ?? smartInvoiceDates.issueDate;
  const displayDueDate =
    invoice.due_date ?? smartInvoiceDates.dueDate;
  const status = invoice.status || "Draft";
  const normalizedStatus = status.toLowerCase();
  const daysLate = daysPastDue(displayDueDate);
  const isPaymentLate =
    customerFacingAmountDue > 0 &&
    daysLate !== null &&
    daysLate > 0 &&
    !["paid", "draft"].includes(normalizedStatus);
  const showFiveStarsBoaPrintButton =
    business.slug === "just-kleen" &&
    looksLikeFiveStarsBoaInvoice(invoice, items);
  const splitWarningAmount =
    numberValue(invoice.split_target_amount) ||
    numberValue(business.split_warning_amount);
  const splitPlan = buildSplitInvoicePlan({
    subtotalAmount: subtotal,
    targetAmount: splitWarningAmount,
    taxRate,
  });
  const showSplitWarning =
    Boolean(invoice.split_warning_enabled) &&
    splitPlan.length > 0;
  const canCreateSplitInvoices =
    showSplitWarning && splitRelatedInvoices.length === 0;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 sm:mb-10">
          <BackButton label="Back" fallbackHref={`/invoices${businessQuery}`} />

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-orange-400">
                Invoice Details
              </p>
              <h1 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">
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
                Automatic Split Ready
              </p>
              <p className="mt-3 text-lg font-bold text-yellow-100">
                This invoice is over {money(splitWarningAmount)} after tax.
              </p>
              <p className="mt-3 text-sm leading-6 text-yellow-100/80">
                Trimax can prepare draft split invoices that stay under the
                target including tax.
              </p>
            </Card>
          ) : null}

          {canCreateSplitInvoices ? (
            <SplitInvoicePlanner
              subtotalAmount={subtotal}
              targetAmount={splitWarningAmount}
              taxLabel={invoice.tax_label || "Tax"}
              taxRate={taxRate}
              taxMode={invoice.tax_mode}
              taxNumber={invoice.tax_number}
              sourceInvoice={{
                id: invoice.id,
                displayId: invoice.display_id,
                businessId: invoice.business_id,
                businessSlug,
                clientId: invoice.client_id,
                customerName,
                projectTitle,
                issueDate: displayIssueDate,
                dueDate: displayDueDate,
                reference: displayReference,
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

          <InvoiceEmailSendPanel
            documentId={invoice.id}
            businessSlug={businessSlug}
            businessName={businessName}
            customerName={customerName}
            recipientEmail={recipientEmail}
            clientCcEmail={clientContact?.cc_email ?? null}
            documentNumber={invoiceNumber}
            amountDue={money(customerFacingAmountDue)}
            dueDate={displayDueDate ? formatDate(displayDueDate) : "-"}
            projectTitle={projectTitle}
            printHref={`/invoices/${invoice.id}/print${businessQuery}`}
            requestType={hasDepositRequest ? "deposit" : "invoice"}
          />

          {isPaymentLate ? (
            <section
              id="late-payment-reminder"
              className="late-reminder-section scroll-mt-6 rounded-3xl border border-rose-500/30 bg-rose-500/10 p-4 sm:p-5"
            >
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.35em] text-rose-300">
                    Late Payment Reminder
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-white">
                    Invoice is {daysLate} day
                    {daysLate === 1 ? "" : "s"} past due
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-rose-100/80">
                    Send a polite payment reminder using the reminder template
                    saved in Settings. Trimax logs the reminder separately from
                    the original invoice send.
                  </p>
                </div>

                <div className="rounded-2xl border border-rose-500/25 bg-black/20 px-4 py-3 text-sm">
                  <p className="text-rose-100/70">Balance due</p>
                  <p className="mt-1 text-xl font-black text-rose-100">
                    {money(customerFacingAmountDue)}
                  </p>
                </div>
              </div>

              <InvoiceEmailSendPanel
                documentId={invoice.id}
                businessSlug={businessSlug}
                businessName={businessName}
                customerName={customerName}
                recipientEmail={recipientEmail}
                clientCcEmail={clientContact?.cc_email ?? null}
                documentNumber={invoiceNumber}
                amountDue={money(customerFacingAmountDue)}
                dueDate={displayDueDate ? formatDate(displayDueDate) : "-"}
                projectTitle={projectTitle}
                printHref={`/invoices/${invoice.id}/print${businessQuery}`}
                requestType="reminder"
              />
            </section>
          ) : null}

          <Card className={hasDepositRequest ? "deposit-request-card" : ""}>
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-600">
                  Deposit Request
                </p>
                <h2
                  className={`mt-3 text-2xl font-black ${
                    hasDepositRequest ? "text-slate-950" : "text-white"
                  }`}
                >
                  {hasDepositRequest
                    ? `${money(depositRequestedAmount)} requested`
                    : "No deposit requested yet"}
                </h2>
                <p
                  className={`mt-3 max-w-3xl text-sm leading-6 ${
                    hasDepositRequest ? "text-slate-600" : "text-zinc-400"
                  }`}
                >
                  {hasDepositRequest
                    ? `Trimax will show ${money(
                        customerFacingAmountDue
                      )} as the deposit due now while keeping the full invoice total at ${money(
                        invoiceTotal
                      )}.`
                    : "Use this when you want the customer to pay part of the invoice now without marking it as paid."}
                </p>

                {hasDepositRequest ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-emerald-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Deposit Due
                      </p>
                      <p className="mt-2 text-xl font-black text-emerald-700">
                        {money(customerFacingAmountDue)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Remaining Later
                      </p>
                      <p className="mt-2 text-xl font-black text-slate-950">
                        {money(balanceAfterDepositRequest)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Requested
                      </p>
                      <p className="mt-2 text-base font-black text-slate-950">
                        {formatDate(invoice.deposit_requested_at ?? null)}
                      </p>
                    </div>
                  </div>
                ) : null}

                {hasDepositRequest && invoice.deposit_note ? (
                  <p className="mt-4 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700">
                    {invoice.deposit_note}
                  </p>
                ) : null}
              </div>

              <RequestDepositButton
                invoiceId={invoice.id}
                businessId={invoice.business_id}
                invoiceLabel={invoice.display_id || projectTitle}
                invoiceTotal={invoiceTotal}
                currentDepositAmount={depositRequestedAmount}
                currentDepositStatus={invoice.deposit_status}
                currentDepositNote={invoice.deposit_note}
              />
            </div>
          </Card>

          <Card className="invoice-summary-card">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Customer" value={customerName} />
              <Info
                label={amountDueLabel}
                value={money(customerFacingAmountDue)}
                strong
              />
              <Info
                label="Split Target"
                value={
                  invoice.split_warning_enabled && splitWarningAmount > 0
                    ? money(splitWarningAmount)
                    : "-"
                }
              />
              <Info label="Issue Date" value={formatDate(displayIssueDate)} />
              <Info label="Due Date" value={formatDate(displayDueDate)} />
              <Info
                label="Invoice Number"
                value={invoice.display_id || "Invoice"}
              />
              <Info label="Reference" value={displayReference || "-"} />
              <Info
                label="Service Address"
                value={invoice.service_address || "-"}
              />
            </div>
          </Card>

          <Card className="invoice-line-items-card">
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-2xl font-bold text-white">Line Items</h2>
              <p className="text-2xl font-black text-orange-400 sm:text-right">
                {money(amountDue)}
              </p>
            </div>

            {items.length > 0 ? (
              <div className="rounded-2xl border border-zinc-800 md:overflow-hidden">
                <div className="hidden grid-cols-[minmax(0,1fr)_90px_130px_130px] gap-4 bg-black/50 px-5 py-4 text-sm font-bold text-zinc-400 md:grid">
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
                      className="invoice-line-item-row grid gap-4 border-t border-zinc-800 px-4 py-5 text-white first:border-t-0 md:grid-cols-[minmax(0,1fr)_90px_130px_130px] md:px-5 md:py-4"
                    >
                      <div className="min-w-0 whitespace-pre-wrap break-words text-base leading-7 md:leading-6">
                        {item.description}
                      </div>
                      <div className="flex items-center justify-between gap-3 md:block md:text-right">
                        <span className="text-sm font-semibold text-zinc-400 md:hidden">
                          Qty
                        </span>
                        <span>{quantity}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 md:block md:text-right">
                        <span className="text-sm font-semibold text-zinc-400 md:hidden">
                          Unit
                        </span>
                        <span>{money(unitPrice)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 font-bold text-orange-400 md:block md:text-right">
                        <span className="text-sm font-semibold text-zinc-400 md:hidden">
                          Total
                        </span>
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
                  taxMode: invoice.tax_mode,
                })}
                value={money(taxAmount)}
              />
              <SummaryRow label="Total" value={money(invoiceTotal)} />
              {hasDepositRequest ? (
                <>
                  <SummaryRow
                    label="Deposit Requested"
                    value={money(depositRequestedAmount)}
                  />
                  <SummaryRow
                    label="Remaining After Deposit"
                    value={money(balanceAfterDepositRequest)}
                  />
                </>
              ) : null}
              <SummaryRow label="Amount Paid" value={money(amountPaid)} />

              <div className="border-t border-zinc-700 pt-4">
                <SummaryRow
                  label={amountDueLabel}
                  value={money(customerFacingAmountDue)}
                  strong
                />
              </div>
            </div>
          </Card>

          <EvidenceTrail logs={invoiceActivityLogs} />

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

            {isPaymentLate ? (
              <a href="#late-payment-reminder">
                <Button variant="secondary">Send Reminder</Button>
              </a>
            ) : null}

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
