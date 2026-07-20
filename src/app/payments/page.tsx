import Link from "next/link";
import AppShell from "../components/AppShell";
import BatchInvoicePayments from "../components/BatchInvoicePayments";
import Button from "../components/Button";
import Card from "../components/Card";
import PersistentDetails from "../components/PersistentDetails";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type Invoice = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  deposit_requested_amount?: string | number | null;
  deposit_status?: string | null;
  status: string | null;
  due_date: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type InvoiceWithoutUpdatedAt = Omit<Invoice, "updated_at">;

type ActivityLog = {
  id: string;
  action: string;
  actor_email: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

function parseMoney(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseMoney(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function daysPastDue(value: string | null) {
  if (!value) {
    return null;
  }

  const dueDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);
}

function invoiceStatusKey(value: string | null | undefined) {
  return (value || "Draft").trim().toLowerCase();
}

function isCollectibleInvoiceStatus(value: string | null | undefined) {
  const status = invoiceStatusKey(value);

  return status !== "paid" && status !== "draft";
}

function hasActiveDepositRequest(invoice: Invoice) {
  return (
    String(invoice.deposit_status ?? "none").toLowerCase() === "requested" &&
    parseMoney(invoice.deposit_requested_amount) > 0
  );
}

function invoiceCollectionAmountDue(invoice: Invoice) {
  const invoiceAmount = parseMoney(invoice.invoice_amount);
  const amountPaid = parseMoney(invoice.amount_paid);
  const fullAmountDue = Math.max(invoiceAmount - amountPaid, 0);

  if (!hasActiveDepositRequest(invoice)) {
    return fullAmountDue;
  }

  return Math.max(parseMoney(invoice.deposit_requested_amount) - amountPaid, 0);
}

function activityAmount(log: ActivityLog) {
  const amount =
    log.details?.amountApplied ??
    log.details?.checkAmount ??
    log.details?.depositAmount ??
    log.details?.paymentAmount;

  return typeof amount === "string" || typeof amount === "number"
    ? parseMoney(amount)
    : 0;
}

function detailText(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function paymentActivityLabel(action: string) {
  const labels: Record<string, string> = {
    "invoice.batch_payment_applied": "Payment Applied",
    "invoice.deposit_requested": "Deposit Requested",
    "invoice.deposit_cleared": "Deposit Cleared",
  };

  return labels[action] ?? "Payment Activity";
}

function paymentOutcomeLabel(log: ActivityLog) {
  const outcome = detailText(log.details?.paymentOutcome).toLowerCase();

  if (outcome === "paid") {
    return "Paid in full";
  }

  if (outcome === "partial") {
    return "Partial payment";
  }

  if (log.action === "invoice.deposit_requested") {
    return "Deposit requested";
  }

  if (log.action === "invoice.deposit_cleared") {
    return "Deposit cleared";
  }

  return "Proof saved";
}

function paymentReferenceLabel(log: ActivityLog) {
  const reference = detailText(log.details?.paymentReference);
  const type = detailText(log.details?.paymentType);
  const image = detailText(log.details?.paymentImageFileName);

  if (reference && type) {
    return `${type} ${reference}`;
  }

  if (reference) {
    return `Reference ${reference}`;
  }

  if (image) {
    return `Image ${image}`;
  }

  return "";
}

function paymentProofChips(log: ActivityLog) {
  const details = log.details ?? {};
  const chips = [
    { label: "Payment Date", value: formatDate(detailText(details.paymentDate)) },
    { label: "Type", value: detailText(details.paymentType) },
    { label: "Reference", value: detailText(details.paymentReference) },
    { label: "Check Amount", value: formatMoney(details.checkAmount as string | number | null | undefined) },
    { label: "Applied", value: formatMoney(details.amountApplied as string | number | null | undefined) },
    { label: "Deposit", value: formatMoney(details.depositAmount as string | number | null | undefined) },
    { label: "Batch", value: detailText(details.batchInvoiceCount) },
    { label: "Stub Match", value: detailText(details.remittanceStubMatched) },
    { label: "Image", value: detailText(details.paymentImageFileName) },
    { label: "Note", value: detailText(details.internalNote ?? details.note) },
  ];

  return chips.filter((chip) => {
    if (!chip.value || chip.value === "-") {
      return false;
    }

    return (
      !["Check Amount", "Applied", "Deposit"].includes(chip.label) ||
      parseMoney(chip.value) > 0
    );
  });
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    customer?: string;
    invoiceIds?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const businessQuery = `?business=${businessSlug}`;
  const focusedCustomer = resolvedSearchParams.customer?.trim() ?? "";
  const initialInvoiceIds = (resolvedSearchParams.invoiceIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  const business = businessData as Business | null;

  let invoices: Invoice[] = [];
  let paymentLogs: ActivityLog[] = [];
  const loadIssues: string[] = [];

  if (businessError) {
    loadIssues.push("Trimax could not load the selected business.");
  }

  if (business?.id) {
    const { data: invoiceData, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        "id, display_id, customer_name, project_title, invoice_amount, amount_paid, deposit_requested_amount, deposit_status, status, due_date, updated_at, created_at"
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false });

    if (invoiceError) {
      const { data: fallbackInvoiceData, error: fallbackInvoiceError } =
        await supabase
          .from("invoices")
          .select(
            "id, display_id, customer_name, project_title, invoice_amount, amount_paid, status, due_date, created_at"
          )
          .eq("business_id", business.id)
          .order("created_at", { ascending: false });

      if (fallbackInvoiceError) {
        loadIssues.push(
          "Invoices could not be loaded yet. Try signing in again; if this stays here, invoice access settings need attention."
        );
      } else {
        invoices = ((fallbackInvoiceData ?? []) as InvoiceWithoutUpdatedAt[]).map(
          (invoice) => ({
            ...invoice,
            updated_at: null,
          })
        );
      }
    } else {
      invoices = (invoiceData ?? []) as Invoice[];
    }

    const { data: activityData, error: activityError } = await supabase
      .from("activity_logs")
      .select("id, action, actor_email, entity_label, details, created_at")
      .eq("business_id", business.id)
      .in("action", [
        "invoice.batch_payment_applied",
        "invoice.deposit_requested",
        "invoice.deposit_cleared",
      ])
      .order("created_at", { ascending: false })
      .limit(8);

    if (activityError) {
      loadIssues.push(
        "Recent payment activity could not be loaded yet. Payments can still be reviewed once activity access is ready."
      );
    }

    paymentLogs = (activityData ?? []) as ActivityLog[];
  }

  const payableInvoices = invoices
    .map((invoice) => {
      const invoiceAmount = parseMoney(invoice.invoice_amount);
      const amountPaid = parseMoney(invoice.amount_paid);
      const isDepositRequest = hasActiveDepositRequest(invoice);

      return {
        ...invoice,
        invoiceAmount,
        amountPaid,
        amountDue: invoiceCollectionAmountDue(invoice),
        isDepositRequest,
        daysLate: daysPastDue(invoice.due_date),
      };
    })
    .filter(
      (invoice) =>
        invoice.amountDue > 0 &&
        isCollectibleInvoiceStatus(invoice.status)
    );

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-300">
              Payments
            </p>

            <h1 className="mt-3 text-4xl font-bold">Payment Workspace</h1>
          </div>
        </div>

        {loadIssues.length > 0 ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-200">
              Payment Data Notice
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Payments page is open, but some data needs attention
            </h2>

            <div className="mt-4 space-y-2 text-sm leading-6 text-amber-100/90">
              {loadIssues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          </Card>
        ) : null}

        {payableInvoices.length === 0 ? (
          <Card className="payment-empty-state border-sky-500/25 bg-sky-500/5">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">
                  Payment Desk Clear
                </p>

                <h2 className="mt-2 text-3xl font-black">
                  No open invoices need payment right now
                </h2>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href={`/invoices/new${businessQuery}`}>
                  <Button>New Invoice</Button>
                </Link>

                <Link href={`/invoices${businessQuery}`}>
                  <Button variant="secondary">Review Invoices</Button>
                </Link>
              </div>
            </div>
          </Card>
        ) : null}

        <div id="batch-payment-tool" className="scroll-mt-6">
          <BatchInvoicePayments
            businessId={business?.id}
            businessSlug={businessSlug}
            initialCustomer={focusedCustomer}
            initialInvoiceIds={initialInvoiceIds}
            invoices={invoices.map((invoice) => ({
              invoiceAmount: parseMoney(invoice.invoice_amount),
              amountPaid: parseMoney(invoice.amount_paid),
              collectionAmountDue: invoiceCollectionAmountDue(invoice),
              isDepositRequest: hasActiveDepositRequest(invoice),
              id: invoice.id,
              displayId: invoice.display_id ?? "Invoice",
              customerName: invoice.customer_name ?? "Unknown Customer",
              projectTitle: invoice.project_title ?? "Untitled Invoice",
              status: invoice.status ?? "Draft",
              dueDate: invoice.due_date,
            }))}
          />
        </div>

          <PersistentDetails
            storageKey={`trimax.payments.history.${businessSlug}`}
            title="History"
            subtitle="Recent payments"
            summaryMeta={
              <Link
                href={`/activity${businessQuery}&type=payment`}
                className="text-sm font-semibold text-orange-400"
              >
                Open log
              </Link>
            }
            className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3"
          >

            {paymentLogs.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-green-500/20 bg-green-500/10 p-4">
                <p className="font-semibold text-green-200">
                  No recent payment activity.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {paymentLogs.map((log) => {
                  const chips = paymentProofChips(log);
                  const amount = activityAmount(log);
                  const outcome = paymentOutcomeLabel(log);
                  const reference = paymentReferenceLabel(log);

                  return (
                    <div
                      key={log.id}
                      className="payment-log-card rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">
                            {paymentActivityLabel(log.action)}
                          </p>
                          <p className="mt-1 font-semibold text-white">
                            {log.entity_label ?? "Invoice payment"}
                          </p>
                          <p className="mt-1 text-sm text-zinc-300">
                            {formatDate(log.created_at)}
                            {log.actor_email ? ` by ${log.actor_email}` : ""}
                          </p>
                          {reference ? (
                            <p className="mt-1 text-sm font-semibold text-zinc-200">
                              {reference}
                            </p>
                          ) : null}
                        </div>

                        <div className="text-right">
                          {amount > 0 ? (
                            <p className="font-black text-green-300">
                              {formatMoney(amount)}
                            </p>
                          ) : null}
                          <p className="mt-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-100">
                            {outcome}
                          </p>
                        </div>
                      </div>

                      {chips.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {chips.map((chip) => (
                            <span
                              key={`${log.id}-${chip.label}-${chip.value}`}
                              className="payment-proof-chip rounded-full border border-zinc-700 bg-black/30 px-3 py-1 text-xs font-semibold text-zinc-200"
                            >
                              {chip.label}: {chip.value}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </PersistentDetails>
      </div>
    </AppShell>
  );
}
