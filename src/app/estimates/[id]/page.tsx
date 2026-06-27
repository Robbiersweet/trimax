import Link from "next/link";
import AppShell from "../../components/AppShell";
import BackButton from "../../components/BackButton";
import Card from "../../components/Card";
import Button from "../../components/Button";
import ConvertEstimateToInvoiceButton from "../../components/ConvertEstimateToInvoiceButton";
import DeleteEstimateButton from "../../components/DeleteEstimateButton";
import InvoiceEmailSendPanel from "../../components/InvoiceEmailSendPanel";
import OutlookDraftPrepCard from "../../components/OutlookDraftPrepCard";
import SplitInvoicePlanner from "../../components/SplitInvoicePlanner";
import Toast from "../../components/Toast";
import { buildOutlookDraftPreview } from "../../lib/outlookDrafts";
import { buildSplitInvoicePlan } from "../../lib/splitInvoices";
import { supabase } from "../../lib/supabase";
import {
  formatTaxSummaryLabel,
  getEffectiveTaxRate,
} from "../../utils/tax";
import { maybeCanonicalApartmentUnitLabel } from "../../utils/unitLabels";

type SupabaseEstimate = {
  id: string;
  business_id: string | null;
  client_id: string | null;
  display_id: string | null;
  queue_item_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  project_address: string | null;
  service_address: string | null;
  reference: string | null;
  estimate_amount: number | string | null;
  tax_mode: string | null;
  tax_label: string | null;
  tax_rate: number | string | null;
  tax_number: string | null;
  split_warning_enabled: boolean | null;
  split_target_amount: number | string | null;
  terms: string | null;
  notes: string | null;
  status: string | null;
};

type EstimateLineItem = {
  id: string;
  description: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  line_total: number | string | null;
  sort_order: number | null;
};

type LinkedInvoice = {
  id: string;
  display_id: string | null;
  status: string | null;
};

type Business = {
  id: string;
  slug: string;
  name: string | null;
  split_warning_amount: number | string | null;
};

type ClientContact = {
  email: string | null;
  cc_email: string | null;
};

type ActivityLog = {
  action: string;
  actor_email: string | null;
  created_at: string | null;
  details: Record<string, unknown> | null;
};

function toNumber(value: number | string | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCurrency(value: number | string | null) {
  return toNumber(value);
}

function formatCurrency(amount: number) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `$${safeAmount.toFixed(2)}`;
}

function formatActivityDate(value: string | null) {
  if (!value) {
    return "No date recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "No date recorded";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getDaysSince(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(
    0,
    Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24))
  );
}

function formatDaysSince(days: number | null) {
  if (days === null) {
    return "No recent proof";
  }

  if (days === 0) {
    return "Today";
  }

  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function getDetailString(
  details: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = details?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getFriendlyAction(action: string) {
  const labels: Record<string, string> = {
    "estimate.created": "Created",
    "estimate.updated": "Updated",
    "estimate.email_sent": "Sent",
    "estimate.converted_to_invoice": "Converted",
    "estimate.deleted": "Deleted",
  };

  return labels[action] ?? action.replace("estimate.", "").replace(/_/g, " ");
}

export default async function EstimateDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ business?: string; created?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams
    ? await searchParams
    : {};
  const requestedBusinessSlug =
    resolvedSearchParams.business ?? "rnl-creations";
  const showCreatedToast = resolvedSearchParams.created === "1";

  const { data: selectedBusinessData } = await supabase
    .from("businesses")
    .select("id, slug, name, split_warning_amount")
    .eq("slug", requestedBusinessSlug)
    .limit(1)
    .maybeSingle();

  const selectedBusiness =
    selectedBusinessData as Business | null;

  if (!selectedBusiness) {
    return (
      <AppShell>
        <Card>
          <p className="text-red-400">
            Selected business was not found.
          </p>
        </Card>
      </AppShell>
    );
  }

  const { data, error } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", id)
    .eq("business_id", selectedBusiness.id)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return (
      <AppShell>
        <Card>
          <p className="text-red-400">
            Estimate not found for this workspace.
          </p>
        </Card>
      </AppShell>
    );
  }

  const estimate = data as SupabaseEstimate;
  const businessSlug = selectedBusiness.slug;
  const splitWarningAmount = toNumber(
    selectedBusiness.split_warning_amount ?? null
  );

  const { data: lineItemData } = await supabase
    .from("estimate_line_items")
    .select("*")
    .eq("estimate_id", estimate.id)
    .order("sort_order", {
      ascending: true,
    });

  const lineItems =
    (lineItemData ?? []) as EstimateLineItem[];

  const subtotalFromLineItems = lineItems.reduce(
    (total, item) =>
      total + toNumber(item.line_total),
    0
  );

  const subtotal =
    subtotalFromLineItems > 0
      ? subtotalFromLineItems
      : parseCurrency(estimate.estimate_amount);

  const taxRate = getEffectiveTaxRate({
    taxMode: estimate.tax_mode,
    taxRate: estimate.tax_rate,
  });
  const taxAmount = subtotal * (taxRate / 100);
  const estimateTotal = subtotal + taxAmount;

  const effectiveSplitTargetAmount =
    toNumber(estimate.split_target_amount) ||
    splitWarningAmount;
  const splitPlan = buildSplitInvoicePlan({
    subtotalAmount: subtotal,
    targetAmount: effectiveSplitTargetAmount,
    taxRate,
  });
  const isOverSplitWarning =
    Boolean(estimate.split_warning_enabled) &&
    splitPlan.length > 0;
  const outlookDraftPreview = buildOutlookDraftPreview("estimate", {
    businessSlug,
    customerName: estimate.customer_name,
    documentNumber: estimate.display_id,
    projectTitle: estimate.project_title,
    amountDue: formatCurrency(estimateTotal),
    serviceAddress:
      estimate.service_address || estimate.project_address,
    reference: maybeCanonicalApartmentUnitLabel(estimate.reference),
  });

  const { data: invoiceData } = await supabase
    .from("invoices")
    .select("id, display_id, status")
    .eq("estimate_id", estimate.id)
    .eq("business_id", selectedBusiness.id)
    .limit(1);

  const linkedInvoice = ((invoiceData ?? []) as LinkedInvoice[])[0] ?? null;

  const { data: clientData } = estimate.client_id
    ? await supabase
        .from("clients")
        .select("email, cc_email")
        .eq("id", estimate.client_id)
        .eq("business_id", selectedBusiness.id)
        .limit(1)
        .maybeSingle()
    : { data: null };
  const clientContact = clientData as ClientContact | null;

  const { data: activityData } = await supabase
    .from("activity_logs")
    .select("action, actor_email, created_at, details")
    .eq("business_id", selectedBusiness.id)
    .eq("entity_type", "estimate")
    .eq("entity_id", estimate.id)
    .order("created_at", { ascending: false })
    .limit(8);

  const activityLogs = (activityData ?? []) as ActivityLog[];
  const sentLogs = activityLogs.filter(
    (log) => log.action === "estimate.email_sent"
  );
  const lastSentLog = sentLogs[0] ?? null;
  const convertedLog =
    activityLogs.find((log) => log.action === "estimate.converted_to_invoice") ??
    null;
  const daysSinceSent = getDaysSince(lastSentLog?.created_at);
  const hasLineItems = lineItems.length > 0 && subtotal > 0;
  const hasCustomer = Boolean(estimate.customer_name?.trim());
  const hasProjectTitle = Boolean(estimate.project_title?.trim());
  const hasDeliveryEmail = Boolean(clientContact?.email?.trim());
  const isConverted = Boolean(linkedInvoice || convertedLog);
  const isApproved = (estimate.status ?? "").toLowerCase() === "approved";
  const isSent = (estimate.status ?? "").toLowerCase() === "sent";
  const closeAction = isConverted
    ? "Keep proof attached to the invoice"
    : isApproved
      ? "Convert this approved estimate to an invoice"
      : isSent
        ? daysSinceSent !== null && daysSinceSent >= 3
          ? "Follow up and capture the customer's answer"
          : "Watch for the customer decision"
        : "Send the estimate with PDF proof";
  const readinessScore = [
    hasCustomer,
    hasProjectTitle,
    hasLineItems,
    hasDeliveryEmail,
    Boolean(lastSentLog || isConverted),
    Boolean(linkedInvoice || isApproved),
  ].filter(Boolean).length;
  const readinessPercent = Math.round((readinessScore / 6) * 100);
  const detailProofCards = [
    {
      label: "Close Move",
      value: closeAction,
      detail: isConverted
        ? "This proposal already has billing momentum."
        : "This is the next action Trimax can defend with the current data.",
      tone: isConverted || isApproved ? "success" : isSent ? "warning" : "info",
    },
    {
      label: "Delivery Proof",
      value:
        lastSentLog && getDetailString(lastSentLog.details, "recipient_email")
          ? getDetailString(lastSentLog.details, "recipient_email") ?? "Sent"
          : lastSentLog
            ? "Sent"
            : "Not sent yet",
      detail: lastSentLog
        ? `Last sent ${formatDaysSince(daysSinceSent).toLowerCase()}`
        : "Send from Trimax to capture recipient, sender, PDF, and timestamp.",
      tone: lastSentLog ? "success" : "warning",
    },
    {
      label: "Conversion Readiness",
      value: `${readinessPercent}%`,
      detail: `${readinessScore} of 6 proposal signals are in place.`,
      tone: readinessPercent >= 80 ? "success" : readinessPercent >= 50 ? "info" : "warning",
    },
  ];
  const closeChecklist = [
    {
      label: "Customer",
      detail: hasCustomer ? estimate.customer_name ?? "Customer added" : "Add a customer",
      status: hasCustomer ? "ready" : "attention",
    },
    {
      label: "Scope",
      detail: hasProjectTitle ? estimate.project_title ?? "Scope named" : "Add project title",
      status: hasProjectTitle ? "ready" : "attention",
    },
    {
      label: "Pricing",
      detail: hasLineItems
        ? `${lineItems.length} line ${lineItems.length === 1 ? "item" : "items"} priced`
        : "Add priced line items",
      status: hasLineItems ? "ready" : "attention",
    },
    {
      label: "Delivery",
      detail: hasDeliveryEmail ? clientContact?.email ?? "Email ready" : "No client email saved",
      status: hasDeliveryEmail ? "ready" : "waiting",
    },
    {
      label: "Proof",
      detail: lastSentLog ? `${sentLogs.length} send record${sentLogs.length === 1 ? "" : "s"}` : "Send proof not logged",
      status: lastSentLog ? "ready" : "waiting",
    },
    {
      label: "Billing",
      detail: linkedInvoice
        ? linkedInvoice.display_id ?? "Invoice linked"
        : isApproved
          ? "Approved and ready"
          : "Awaiting approval",
      status: linkedInvoice || isApproved ? "ready" : "waiting",
    },
  ];

  return (
    <AppShell>
      {showCreatedToast ? (
        <Toast
          type="success"
          message={`Estimate ${estimate.display_id ?? "Estimate"} created. Next step: send the estimate or convert it to an invoice when ready.`}
        />
      ) : null}
      <div className="space-y-6">
        <BackButton
          label="Back"
          fallbackHref={`/estimates?business=${businessSlug}`}
        />

        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Estimate Details
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            {estimate.project_title || "Untitled Estimate"}
          </h1>

          <p className="mt-2 text-zinc-400">
            {estimate.display_id ?? "Estimate"}
          </p>
        </div>

        <Card className="estimate-detail-command overflow-hidden border-orange-500/25 bg-gradient-to-br from-zinc-950 via-zinc-900 to-slate-950">
          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">
                Closing Intelligence
              </p>

              <h2 className="mt-2 text-3xl font-black text-white">
                Make this proposal easy to approve
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
                Trimax is reading the estimate, line items, email delivery
                proof, and conversion history already captured in the activity
                log. No duplicate tracking system needed.
              </p>

              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {detailProofCards.map((card) => (
                  <div
                    key={card.label}
                    className="estimate-detail-proof-card"
                    data-tone={card.tone}
                  >
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                      {card.label}
                    </p>

                    <p className="mt-2 text-base font-black text-white">
                      {card.value}
                    </p>

                    <p className="mt-2 text-sm leading-5 text-zinc-400">
                      {card.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="estimate-detail-timeline rounded-3xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">
                    Proof Trail
                  </p>

                  <p className="mt-1 text-sm text-zinc-400">
                    Last activity Trimax can prove.
                  </p>
                </div>

                <Link
                  href={`/activity?business=${businessSlug}`}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-zinc-300 transition hover:border-orange-300 hover:text-white"
                >
                  Activity
                </Link>
              </div>

              <div className="mt-4 grid gap-3">
                {activityLogs.length > 0 ? (
                  activityLogs.slice(0, 4).map((log, index) => (
                    <div
                      key={`${log.action}-${log.created_at}-${index}`}
                      className="estimate-detail-event"
                    >
                      <div>
                        <p className="font-black text-white">
                          {getFriendlyAction(log.action)}
                        </p>

                        <p className="mt-1 text-xs text-zinc-400">
                          {formatActivityDate(log.created_at)}
                        </p>
                      </div>

                      <p className="text-xs font-bold text-zinc-400">
                        {getDetailString(log.details, "recipient_email") ||
                          getDetailString(log.details, "amount") ||
                          log.actor_email ||
                          "Trimax"}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="estimate-detail-event">
                    <div>
                      <p className="font-black text-white">
                        No proof events yet
                      </p>

                      <p className="mt-1 text-xs text-zinc-400">
                        Create, send, edit, and convert actions will appear here.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="estimate-close-checklist mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {closeChecklist.map((item) => (
              <div
                key={item.label}
                className="estimate-close-step"
                data-status={item.status}
              >
                <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                  {item.label}
                </p>

                <p className="mt-2 text-sm font-black text-white">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {isOverSplitWarning && (
          <Card className="border-yellow-500/60 bg-yellow-500/10">
            <p className="text-sm uppercase tracking-[0.25em] text-yellow-300">
              Automatic Split Ready
            </p>

            <p className="mt-2 text-lg font-semibold text-yellow-100">
              This estimate is over{" "}
              {formatCurrency(effectiveSplitTargetAmount)} after tax.
            </p>

            <p className="mt-2 text-sm leading-6 text-yellow-100/80">
              Converting this estimate will create split invoice drafts that
              stay under the target including tax.
            </p>
          </Card>
        )}

        {isOverSplitWarning && !linkedInvoice && (
          <SplitInvoicePlanner
            subtotalAmount={subtotal}
            targetAmount={effectiveSplitTargetAmount}
            taxLabel={estimate.tax_label || "Tax"}
            taxRate={taxRate}
            taxMode={estimate.tax_mode}
            taxNumber={estimate.tax_number}
          />
        )}

        {linkedInvoice && (
          <Card className="border-purple-500/40">
            <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
              Linked Invoice
            </p>

            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold">
                  {linkedInvoice.display_id ?? "Invoice"}
                </p>

                <p className="mt-1 text-sm text-zinc-400">
                  {linkedInvoice.status ?? "Draft"}
                </p>
              </div>

              <Link
                href={`/invoices/${linkedInvoice.id}?business=${businessSlug}`}
              >
                <Button variant="secondary">
                  Open Invoice
                </Button>
              </Link>
            </div>
          </Card>
        )}

        <InvoiceEmailSendPanel
          documentId={estimate.id}
          documentKind="estimate"
          businessSlug={businessSlug}
          businessName={selectedBusiness.name ?? "Trimax"}
          customerName={estimate.customer_name ?? "Customer"}
          recipientEmail={clientContact?.email ?? null}
          clientCcEmail={clientContact?.cc_email ?? null}
          documentNumber={estimate.display_id ?? "Estimate"}
          amountDue={formatCurrency(estimateTotal)}
          dueDate="-"
          projectTitle={estimate.project_title}
          printHref={`/estimates/${estimate.id}/print?business=${businessSlug}`}
          requestType="estimate"
        />

        <OutlookDraftPrepCard
          documentLabel="Estimate"
          preview={outlookDraftPreview}
          printHref={`/estimates/${estimate.id}/print?business=${businessSlug}`}
        />

        <Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Info
              label="Customer"
              value={estimate.customer_name ?? ""}
            />

            <Info
              label="Status"
              value={estimate.status ?? "Draft"}
            />

            <Info
              label="Service Address"
              value={
                estimate.service_address ||
                estimate.project_address ||
                ""
              }
            />

            <Info
              label="Reference"
              value={maybeCanonicalApartmentUnitLabel(estimate.reference)}
            />

            <Info
              label="Estimate Total"
              value={formatCurrency(estimateTotal)}
            />

            <Info
              label="Split Target"
              value={
                estimate.split_warning_enabled && effectiveSplitTargetAmount > 0
                  ? formatCurrency(effectiveSplitTargetAmount)
                  : "-"
              }
            />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">
              Line Items
            </h2>

            <p className="text-2xl font-bold text-orange-400">
              {formatCurrency(estimateTotal)}
            </p>
          </div>

          {lineItems.length === 0 ? (
            <p className="mt-4 text-zinc-400">
              No line items added.
            </p>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800">
              <div className="grid grid-cols-[1fr_90px_120px_120px] gap-4 border-b border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-400">
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit</span>
                <span className="text-right">Total</span>
              </div>

              {lineItems.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_90px_120px_120px] gap-4 border-b border-zinc-800 px-4 py-4 last:border-b-0"
                >
                  <span>
                    {item.description || "Line item"}
                  </span>

                  <span className="text-right text-zinc-300">
                    {toNumber(item.quantity)}
                  </span>

                  <span className="text-right text-zinc-300">
                    {formatCurrency(
                      toNumber(item.unit_price)
                    )}
                  </span>

                  <span className="text-right font-semibold text-orange-400">
                    {formatCurrency(
                      toNumber(item.line_total)
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="ml-auto mt-6 grid max-w-sm gap-3 text-sm">
            <SummaryRow
              label="Subtotal"
              value={formatCurrency(subtotal)}
            />

            <SummaryRow
              label={formatTaxSummaryLabel({
                label: estimate.tax_label,
                rate: taxRate,
                taxNumber: estimate.tax_number,
                taxMode: estimate.tax_mode,
              })}
              value={formatCurrency(taxAmount)}
            />

            <div className="border-t border-zinc-700 pt-3">
              <SummaryRow
                label="Estimate Total"
                value={formatCurrency(estimateTotal)}
                strong
              />
            </div>
          </div>
        </Card>

        <Card>
          <p className="text-sm text-zinc-500">
            Scope of Work
          </p>

          <p className="mt-3 leading-7 text-zinc-300">
            {estimate.notes || "No scope of work added."}
          </p>
        </Card>

        <Card>
          <p className="text-sm text-zinc-500">
            Terms
          </p>

          <p className="mt-3 leading-7 text-zinc-300">
            {estimate.terms || "No terms added."}
          </p>
        </Card>

        <div className="flex flex-wrap gap-4">
          {estimate.queue_item_id && (
            <Link
              href={`/queue/${estimate.queue_item_id}?business=${businessSlug}`}
            >
              <Button variant="secondary">
                Open Queue Item
              </Button>
            </Link>
          )}

          <Link
            href={`/estimates/${estimate.id}/print?business=${businessSlug}`}
          >
            <Button variant="secondary">
              Print Estimate
            </Button>
          </Link>

          <a href="#send-estimate">
            <Button>
              Send Estimate
            </Button>
          </a>

          {!linkedInvoice && (
            <Link
              href={`/estimates/${estimate.id}/edit?business=${businessSlug}`}
            >
              <Button variant="secondary">
                Edit Estimate
              </Button>
            </Link>
          )}

          {linkedInvoice ? (
            <Link
              href={`/invoices/${linkedInvoice.id}?business=${businessSlug}`}
            >
              <Button>
                Open Invoice
              </Button>
            </Link>
          ) : (
            <ConvertEstimateToInvoiceButton
              estimateId={estimate.id}
              businessId={estimate.business_id ?? ""}
              businessSlug={businessSlug}
              clientId={estimate.client_id}
              customerName={estimate.customer_name ?? ""}
              projectTitle={estimate.project_title ?? ""}
              invoiceAmount={formatCurrency(estimateTotal)}
              notes={estimate.notes ?? ""}
              splitTargetAmount={effectiveSplitTargetAmount}
            />
          )}

          {!linkedInvoice ? (
            <DeleteEstimateButton
              estimateId={estimate.id}
              businessId={estimate.business_id}
              estimateLabel={
                estimate.display_id ||
                estimate.project_title ||
                estimate.customer_name ||
                "Estimate"
              }
              returnHref={`/estimates?business=${businessSlug}`}
            />
          ) : (
            <span className="rounded-2xl border border-zinc-700 px-5 py-3 text-sm font-bold text-zinc-500">
              Delete disabled while linked to invoice
            </span>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-sm text-zinc-500">
        {label}
      </p>

      <p className="mt-1 text-lg font-medium">
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
      <span className="text-zinc-400">
        {label}
      </span>

      <span className="font-semibold">
        {value}
      </span>
    </div>
  );
}
