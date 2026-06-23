import Link from "next/link";
import AppShell from "../components/AppShell";
import BatchInvoicePayments from "../components/BatchInvoicePayments";
import Button from "../components/Button";
import Card from "../components/Card";
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
    "invoice.batch_payment_applied": "Batch Payment Applied",
    "invoice.deposit_requested": "Deposit Requested",
    "invoice.deposit_cleared": "Deposit Cleared",
  };

  return labels[action] ?? "Payment Activity";
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

function invoiceCountLabel(count: number) {
  return `${count} invoice${count === 1 ? "" : "s"}`;
}

function getOldestDueDate(invoices: Array<{ due_date: string | null }>) {
  return invoices.reduce<string | null>((oldestDue, invoice) => {
    if (!invoice.due_date) {
      return oldestDue;
    }

    if (!oldestDue) {
      return invoice.due_date;
    }

    return invoice.due_date < oldestDue ? invoice.due_date : oldestDue;
  }, null);
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

  const openBalance = payableInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const depositRequestInvoices = payableInvoices.filter(
    (invoice) => invoice.isDepositRequest
  );
  const depositRequestBalance = depositRequestInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const overdueInvoices = payableInvoices.filter(
    (invoice) => (invoice.daysLate ?? -1) >= 0
  );
  const overdueBalance = payableInvoices
    .filter((invoice) => overdueInvoices.includes(invoice))
    .reduce((total, invoice) => total + invoice.amountDue, 0);
  const draftBalance = invoices
    .filter((invoice) => invoiceStatusKey(invoice.status) === "draft")
    .reduce(
      (total, invoice) =>
        total +
        Math.max(
          parseMoney(invoice.invoice_amount) - parseMoney(invoice.amount_paid),
          0
        ),
      0
    );
  const recentPaymentTotal = paymentLogs.reduce(
    (total, log) => total + activityAmount(log),
    0
  );
  const agingBuckets = [
    {
      label: "0-30 Days",
      min: 0,
      max: 30,
      tone: "bg-yellow-400",
    },
    {
      label: "31-60 Days",
      min: 31,
      max: 60,
      tone: "bg-orange-400",
    },
    {
      label: "61-90 Days",
      min: 61,
      max: 90,
      tone: "bg-pink-400",
    },
    {
      label: "91+ Days",
      min: 91,
      max: Infinity,
      tone: "bg-red-400",
    },
  ].map((bucket) => {
    const bucketInvoices = payableInvoices.filter((invoice) => {
      if (invoice.daysLate === null || invoice.daysLate < 0) {
        return false;
      }

      return (
        invoice.daysLate >= bucket.min &&
        invoice.daysLate <= bucket.max
      );
    });

    return {
      ...bucket,
      count: bucketInvoices.length,
      amount: bucketInvoices.reduce(
        (total, invoice) => total + invoice.amountDue,
        0
      ),
    };
  });
  const agingVisualMax = Math.max(
    ...agingBuckets.map((bucket) => bucket.amount),
    1
  );
  const customerPaymentGroups = Array.from(
    payableInvoices.reduce(
      (
        groups,
        invoice
      ): Map<
        string,
        { customerName: string; count: number; total: number; oldestDue: string | null }
      > => {
        const customerName = invoice.customer_name ?? "Unknown Customer";
        const current = groups.get(customerName) ?? {
          customerName,
          count: 0,
          total: 0,
          oldestDue: null,
        };
        const oldestDue =
          current.oldestDue && invoice.due_date
            ? current.oldestDue < invoice.due_date
              ? current.oldestDue
              : invoice.due_date
            : current.oldestDue ?? invoice.due_date;

        groups.set(customerName, {
          customerName,
          count: current.count + 1,
          total: current.total + invoice.amountDue,
          oldestDue,
        });

        return groups;
      },
      new Map<
        string,
        { customerName: string; count: number; total: number; oldestDue: string | null }
      >()
    ).values()
  )
    .sort((first, second) => second.total - first.total)
    .slice(0, 8);
  const paymentPriority = [...payableInvoices]
    .sort((first, second) => {
      const firstLate = first.daysLate ?? -999;
      const secondLate = second.daysLate ?? -999;

      if (firstLate !== secondLate) {
        return secondLate - firstLate;
      }

      return second.amountDue - first.amountDue;
    })
    .slice(0, 6);
  const bestCollectionTarget = paymentPriority[0] ?? null;
  const focusedCustomerInvoices = focusedCustomer
    ? payableInvoices.filter(
        (invoice) =>
          (invoice.customer_name ?? "Unknown Customer").toLowerCase() ===
          focusedCustomer.toLowerCase()
      )
    : [];
  const selectedBatchInvoices = initialInvoiceIds.length
    ? payableInvoices.filter((invoice) => initialInvoiceIds.includes(invoice.id))
    : [];
  const paymentRunInvoices =
    selectedBatchInvoices.length > 0
      ? selectedBatchInvoices
      : focusedCustomerInvoices.length > 0
        ? focusedCustomerInvoices
        : payableInvoices;
  const paymentRunBalance = paymentRunInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const paymentRunOldestDue = getOldestDueDate(paymentRunInvoices);
  const paymentRunLabel =
    selectedBatchInvoices.length > 0
      ? "Selected invoice batch"
      : focusedCustomer
        ? focusedCustomer
        : "All open invoices";
  const paymentRunDescription =
    selectedBatchInvoices.length > 0
      ? "Trimax is focused on the invoices selected from the invoice list."
      : focusedCustomer
        ? "Trimax is focused on this customer so one check can be applied cleanly."
        : "Trimax is showing every unpaid invoice for this workspace.";
  const batchCandidateGroups = customerPaymentGroups.filter(
    (group) => group.count > 1
  );
  const collectionReadiness =
    payableInvoices.length === 0
      ? "Clear"
      : overdueInvoices.length > 0
        ? "Collect overdue first"
        : batchCandidateGroups.length > 0
          ? "Batch payment ready"
          : "Ready for check entry";
  const cockpitCards = [
    {
      label: "Collect First",
      value: bestCollectionTarget
        ? formatMoney(bestCollectionTarget.amountDue)
        : "$0.00",
      detail: bestCollectionTarget
        ? `${bestCollectionTarget.customer_name ?? "Unknown Customer"} - ${
            bestCollectionTarget.display_id ?? "Invoice"
          }`
        : "No urgent invoice target",
      href: bestCollectionTarget
        ? `/invoices/${bestCollectionTarget.id}${businessQuery}`
        : `/invoices${businessQuery}#invoice-results`,
      tone: overdueInvoices.length > 0 ? "danger" : "info",
    },
    {
      label: "Overdue Exposure",
      value: formatMoney(overdueBalance),
      detail: `${invoiceCountLabel(overdueInvoices.length)} at or past due`,
      href: `/invoices${businessQuery}&view=aging#invoice-results`,
      tone: overdueInvoices.length > 0 ? "danger" : "neutral",
    },
    {
      label: "Deposit Requests",
      value: formatMoney(depositRequestBalance),
      detail: `${invoiceCountLabel(depositRequestInvoices.length)} asking for partial payment`,
      href: `/invoices${businessQuery}&collection=open#invoice-results`,
      tone: depositRequestInvoices.length > 0 ? "success" : "neutral",
    },
    {
      label: "Batch Candidates",
      value: String(batchCandidateGroups.length),
      detail: "Customers with multiple open invoices",
      href: "#customer-payment-queue",
      tone: batchCandidateGroups.length > 0 ? "success" : "info",
    },
  ];
  const paymentProofCards = [
    {
      label: "Proof Logged",
      value: formatMoney(recentPaymentTotal),
      detail: `${paymentLogs.length} recent payment trail item${
        paymentLogs.length === 1 ? "" : "s"
      }`,
      href: `/activity${businessQuery}&type=payment`,
      tone: paymentLogs.length > 0 ? "emerald" : "zinc",
    },
    {
      label: "Check Queue",
      value: invoiceCountLabel(paymentRunInvoices.length),
      detail: `${formatMoney(paymentRunBalance)} in the active payment run.`,
      href: "#batch-payment-tool",
      tone: paymentRunInvoices.length > 0 ? "sky" : "zinc",
    },
    {
      label: "Batch Opportunity",
      value: String(batchCandidateGroups.length),
      detail: "Customers where one check may cover multiple invoices.",
      href: "#customer-payment-queue",
      tone: batchCandidateGroups.length > 0 ? "amber" : "zinc",
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-300">
              Payments
            </p>

            <h1 className="mt-3 text-4xl font-bold">Payment Workspace</h1>

            <p className="mt-3 max-w-3xl text-zinc-400">
              Built for check days: capture checks, match them to open
              invoices, apply deposits or full payments, and keep the
              accounting trail clean.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={`/invoices${businessQuery}#invoice-results`}>
              <Button variant="secondary">Open Invoices</Button>
            </Link>

            <Link href={`/invoices${businessQuery}&view=aging#invoice-results`}>
              <Button variant="secondary">Aging View</Button>
            </Link>
          </div>
        </div>

        <Card className="payment-compass border-emerald-500/20 bg-zinc-950/70 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="payment-compass-kicker text-xs font-black uppercase tracking-[0.28em] text-emerald-300">
                Payment Compass
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                Collection control for {business?.name ?? "this workspace"}
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                Start with the money that needs action, then jump straight into
                invoice aging, deposit requests, or the batch tool without
                hunting through the page.
              </p>
            </div>

            <a href="#batch-payment-tool">
              <Button>Open Batch Tool</Button>
            </a>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Open Balance",
                value: formatMoney(openBalance),
                detail: `${invoiceCountLabel(payableInvoices.length)} collectible`,
                href: "#customer-payment-queue",
                tone: "sky",
              },
              {
                label: "Overdue",
                value: formatMoney(overdueBalance),
                detail: `${invoiceCountLabel(overdueInvoices.length)} at or past due`,
                href: `/invoices${businessQuery}&view=aging#invoice-results`,
                tone: overdueInvoices.length > 0 ? "rose" : "zinc",
              },
              {
                label: "Deposits",
                value: formatMoney(depositRequestBalance),
                detail: `${invoiceCountLabel(depositRequestInvoices.length)} requested`,
                href: `/invoices${businessQuery}&collection=open#invoice-results`,
                tone: "emerald",
              },
              {
                label: "Batch Ready",
                value: String(batchCandidateGroups.length),
                detail: "Customers with multiple invoices",
                href: "#customer-payment-queue",
                tone: "amber",
              },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="payment-compass-card rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5 hover:border-emerald-300/60"
                data-tone={item.tone}
              >
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                  {item.label}
                </p>

                <p className="mt-3 text-2xl font-black text-white">
                  {item.value}
                </p>

                <p className="mt-2 text-sm leading-5 text-zinc-400">
                  {item.detail}
                </p>
              </Link>
            ))}
          </div>
        </Card>

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

            <p className="mt-4 text-sm leading-6 text-amber-100/90">
              If you are on the login page, sign in again first. If you are
              already signed in and this stays here, the invoice or activity
              access rules may need review.
            </p>
          </Card>
        ) : null}

        {focusedCustomer ? (
          <Card className="border-green-500/30 bg-green-500/10">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-green-200">
              Customer Payment Focus
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Ready to record payment for {focusedCustomer}
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
              Trimax will preselect matching open invoices below when possible.
              Review the invoice list, enter the check details, then apply the
              payment to the selected invoices together.
            </p>
          </Card>
        ) : null}

        {initialInvoiceIds.length > 0 ? (
          <Card className="border-green-500/30 bg-green-500/10">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-green-200">
              Selected Invoice Batch
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Payment batch loaded from invoices
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
              Trimax brought over the invoices you selected on the invoice
              list. Review the check amount, date, and reference, then apply
              the payment when everything matches.
            </p>
          </Card>
        ) : null}

        <Card className="payment-cockpit border-sky-500/20 bg-gradient-to-br from-zinc-950 via-slate-950 to-zinc-900">
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr] xl:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">
                Collections Cockpit
              </p>

              <h2 className="mt-3 text-3xl font-black text-white">
                {collectionReadiness}
              </h2>

              <p className="mt-3 text-sm leading-6 text-zinc-300">
                Trimax is reading open balances, deposit requests, due dates,
                and customer groupings so check entry starts with the smartest
                target instead of a raw invoice list.
              </p>

              {bestCollectionTarget ? (
                <div className="payment-next-target mt-5 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">
                    Next Best Collection Move
                  </p>

                  <p className="mt-2 text-lg font-black text-white">
                    {bestCollectionTarget.customer_name ?? "Unknown Customer"}
                  </p>

                  <p className="mt-1 text-sm leading-6 text-zinc-300">
                    {bestCollectionTarget.display_id ?? "Invoice"} /{" "}
                    {bestCollectionTarget.isDepositRequest
                      ? "deposit request"
                      : "open balance"}{" "}
                    / {formatMoney(bestCollectionTarget.amountDue)}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link
                        href={`/payments?${new URLSearchParams({
                        business: businessSlug,
                        customer:
                          bestCollectionTarget.customer_name ??
                          "Unknown Customer",
                      }).toString()}#batch-payment-tool`}
                      className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-black text-white transition hover:bg-sky-600"
                    >
                      Focus Payment
                    </Link>

                    <Link
                      href={`/invoices/${bestCollectionTarget.id}${businessQuery}`}
                      className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-black text-zinc-100 transition hover:border-sky-400 hover:text-sky-200"
                    >
                      Open Invoice
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {cockpitCards.map((card) => (
                <Link
                  key={card.label}
                  href={card.href}
                  className="payment-cockpit-card rounded-2xl border border-zinc-800 bg-black/35 p-4 transition hover:-translate-y-0.5 hover:border-sky-400/60"
                  data-tone={card.tone}
                >
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-400">
                    {card.label}
                  </p>

                  <p className="mt-3 text-2xl font-black text-white">
                    {card.value}
                  </p>

                  <p className="mt-2 text-sm leading-5 text-zinc-400">
                    {card.detail}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </Card>

        {payableInvoices.length > 0 ? (
          <Card className="payment-hero-card dark-surface border-green-400/30 bg-gradient-to-br from-green-500/15 via-zinc-950 to-orange-500/10">
            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <p className="payment-hero-label text-sm uppercase tracking-[0.3em] text-green-200">
                  Check Day Control
                </p>

                <h2 className="mt-3 text-3xl font-black">
                  {paymentRunLabel}
                </h2>

                <p className="payment-hero-copy mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                  {paymentRunDescription} Review the total, compare it to the
                  check, then use the batch payment tool below.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <div className="payment-hero-stat rounded-2xl border border-green-400/20 bg-black/30 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                    Balance
                  </p>
                  <p className="mt-2 text-2xl font-black text-green-200">
                    {formatMoney(paymentRunBalance)}
                  </p>
                </div>

                <div className="payment-hero-stat rounded-2xl border border-orange-400/20 bg-black/30 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                    Invoices
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {invoiceCountLabel(paymentRunInvoices.length)}
                  </p>
                </div>

                <div className="payment-hero-stat rounded-2xl border border-pink-400/20 bg-black/30 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                    Oldest Due
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {formatDate(paymentRunOldestDue)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <a href="#batch-payment-tool">
                <Button>Open Batch Tool</Button>
              </a>

              <Link href={`/invoices${businessQuery}&view=aging#invoice-results`}>
                <Button variant="secondary">Review Aging</Button>
              </Link>
            </div>
          </Card>
        ) : null}

        <Card className="payment-proof-radar border-emerald-500/20 bg-zinc-950/75">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="payment-proof-kicker text-xs font-black uppercase tracking-[0.28em] text-emerald-300">
                Payment Proof Radar
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                Keep every check easy to explain later
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                This keeps the payment page tied to the audit trail: logged
                checks, active payment runs, and customers likely to need batch
                matching.
              </p>
            </div>

            <Link
              href={`/activity${businessQuery}&type=payment`}
              className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-100 transition hover:-translate-y-0.5 hover:border-emerald-200"
            >
              Open payment trail
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {paymentProofCards.map((card) => (
              <Link
                key={card.label}
                href={card.href}
                data-tone={card.tone}
                className="payment-proof-card rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5 hover:border-emerald-300/60"
              >
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                  {card.label}
                </p>

                <p className="mt-3 line-clamp-2 text-2xl font-black text-white">
                  {card.value}
                </p>

                <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-400">
                  {card.detail}
                </p>
              </Link>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-green-500/20 bg-green-500/5">
            <p className="text-sm text-zinc-400">Open Balance</p>
            <p className="mt-2 text-4xl font-black">{formatMoney(openBalance)}</p>
            <p className="mt-2 text-sm text-zinc-500">
              {payableInvoices.length} unpaid invoice
              {payableInvoices.length === 1 ? "" : "s"}.
            </p>
          </Card>

          <Card className="border-pink-500/20 bg-pink-500/5">
            <p className="text-sm text-zinc-400">Past Due</p>
            <p className="mt-2 text-4xl font-black">{formatMoney(overdueBalance)}</p>
            <p className="mt-2 text-sm text-zinc-500">
              Open invoices at or past due date.
            </p>
          </Card>

          <Card className="border-amber-500/20 bg-amber-500/5">
            <p className="text-sm text-zinc-400">Draft Balance</p>
            <p className="mt-2 text-4xl font-black">{formatMoney(draftBalance)}</p>
            <p className="mt-2 text-sm text-zinc-500">
              Work still sitting in draft status.
            </p>
          </Card>

          <Card>
            <p className="text-sm text-zinc-400">Recently Applied</p>
            <p className="mt-2 text-4xl font-black">
              {formatMoney(recentPaymentTotal)}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Latest logged batch payment entries.
            </p>
          </Card>
        </div>

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

                <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                  When an invoice, deposit request, or imported FreshBooks
                  balance is collectible, it will appear here for check capture
                  and batch payment matching.
                </p>
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

        {payableInvoices.length > 0 ? (
          <Card className="border-pink-500/20 bg-pink-500/5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-pink-300">
                  Aging Snapshot
                </p>
                <h2 className="mt-2 text-2xl font-bold">
                  Open balances by age
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  A quick check-day view of unpaid invoices that are at or past
                  their due date.
                </p>
              </div>

              <Link href={`/invoices${businessQuery}&view=aging#invoice-results`}>
                <Button variant="secondary">Open Aging View</Button>
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {agingBuckets.map((bucket) => (
                <div
                  key={bucket.label}
                  className="payment-aging-card rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-zinc-400">
                        {bucket.label}
                      </p>
                      <p className="mt-2 text-2xl font-black text-white">
                        {formatMoney(bucket.amount)}
                      </p>
                    </div>

                    <span className="rounded-full bg-pink-500/15 px-3 py-1 text-xs font-bold text-pink-100">
                      {bucket.count}
                    </span>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${bucket.tone}`}
                      style={{
                        width:
                          bucket.amount > 0
                            ? `${Math.max(
                                6,
                                (bucket.amount / agingVisualMax) * 100
                              )}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <div id="batch-payment-tool" className="scroll-mt-6">
          <BatchInvoicePayments
            businessId={business?.id}
            businessSlug={businessSlug}
            initialCustomer={focusedCustomer}
            initialInvoiceIds={initialInvoiceIds}
            invoices={payableInvoices.map((invoice) => ({
              id: invoice.id,
              displayId: invoice.display_id ?? "Invoice",
              customerName: invoice.customer_name ?? "Unknown Customer",
              projectTitle: invoice.project_title ?? "Untitled Invoice",
              invoiceAmount: invoice.invoiceAmount,
              amountPaid: invoice.amountPaid,
              collectionAmountDue: invoice.amountDue,
              isDepositRequest: invoice.isDepositRequest,
              status: invoice.status ?? "Draft",
              dueDate: invoice.due_date,
            }))}
          />
        </div>

        {paymentPriority.length > 0 ? (
          <Card id="customer-payment-queue">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                  Payment Priority
                </p>
                <h2 className="mt-2 text-2xl font-bold">
                  Open invoices to watch first
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  Trimax sorts this list by oldest unpaid due date first, then
                  by largest unpaid balance.
                </p>
              </div>

              <Link href={`/invoices${businessQuery}&view=aging`}>
                <Button variant="secondary">Open Aging View</Button>
              </Link>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800">
              {paymentPriority.map((invoice) => {
                const daysLate = invoice.daysLate ?? null;
                const isLate = daysLate !== null && daysLate >= 0;

                return (
                  <Link
                    key={invoice.id}
                    href={`/invoices/${invoice.id}${businessQuery}`}
                    className="payment-priority-row grid gap-3 border-b border-zinc-800 bg-zinc-950 p-4 transition last:border-b-0 hover:bg-orange-500/10 md:grid-cols-[1fr_auto_auto]"
                  >
                    <div>
                      <p className="font-semibold text-white">
                        {invoice.display_id ?? "Invoice"}
                      </p>
                      <p className="mt-1 text-sm font-medium text-zinc-200">
                        {invoice.customer_name ?? "Unknown Customer"}
                      </p>
                      <p className="mt-1 text-sm text-zinc-300">
                        {invoice.project_title ?? "Untitled Invoice"}
                      </p>
                      {invoice.isDepositRequest ? (
                        <span className="mt-3 inline-flex rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                          Deposit request
                        </span>
                      ) : null}
                    </div>

                    <div className="md:text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                        Due
                      </p>
                      <p className="mt-1 font-semibold text-white">
                        {formatDate(invoice.due_date)}
                      </p>
                      <p
                        className={`mt-1 text-sm ${
                          isLate ? "text-rose-200" : "text-zinc-300"
                        }`}
                      >
                        {isLate
                          ? `${daysLate} day${daysLate === 1 ? "" : "s"} late`
                          : "Not past due"}
                      </p>
                    </div>

                    <div className="md:text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                        {invoice.isDepositRequest ? "Deposit Due" : "Balance"}
                      </p>
                      <p className="mt-1 text-xl font-black text-orange-300">
                        {formatMoney(invoice.amountDue)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        ) : null}

        {customerPaymentGroups.length > 0 ? (
          <Card>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-green-300">
                  Customer Payment Queue
                </p>
                <h2 className="mt-2 text-2xl font-bold">
                  Start with the customer on the check
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  This groups unpaid invoices by customer. Multi-invoice
                  customers are the best batch-payment candidates, but single
                  invoice payments stay visible too.
                </p>
              </div>

              <Link href={`/invoices${businessQuery}`}>
                <Button variant="secondary">Review All Invoices</Button>
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {customerPaymentGroups.map((group) => {
                const customerPaymentParams = new URLSearchParams({
                  business: businessSlug,
                  customer: group.customerName,
                });
                const customerInvoiceParams = new URLSearchParams({
                  business: businessSlug,
                  customer: group.customerName,
                  collection: "open",
                });

                return (
                  <div
                    key={group.customerName}
                    className="payment-customer-card rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-white">
                          {group.customerName}
                        </p>
                        <p className="mt-1 text-sm text-zinc-300">
                          {invoiceCountLabel(group.count)} open
                        </p>
                      </div>

                      <p className="text-lg font-black text-green-300">
                        {formatMoney(group.total)}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-800 pt-3">
                      <p className="text-sm font-medium text-zinc-200">
                        Oldest due date: {formatDate(group.oldestDue)}
                      </p>

                      <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-bold text-green-100">
                        {group.count > 1 ? "Batch candidate" : "Single invoice"}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link href={`/payments?${customerPaymentParams.toString()}#batch-payment-tool`}>
                        <Button>Record Payment</Button>
                      </Link>

                      <Link href={`/invoices?${customerInvoiceParams.toString()}#invoice-results`}>
                        <Button variant="secondary">View Invoices</Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Payment Workflow
            </p>
            <h2 className="mt-2 text-2xl font-bold">How to use this page</h2>

            <div className="mt-5 grid gap-3">
              {[
                "Select the customer or leave the list on all open invoices.",
                "Capture a check photo or enter the check details.",
                "Let Trimax suggest invoices that match the check amount.",
                "Enter the check amount and reference number.",
                "Trimax verifies the total before applying the payment.",
              ].map((step, index) => (
                <div
                  key={step}
                  className="payment-workflow-step flex gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500 font-black text-black">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-zinc-300">{step}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-green-300">
                  Recent Payments
                </p>
                <h2 className="mt-2 text-2xl font-bold">Latest activity</h2>
              </div>

              <Link
                href={`/activity${businessQuery}&type=payment`}
                className="text-sm font-semibold text-orange-400"
              >
                Open log
              </Link>
            </div>

            {paymentLogs.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-green-500/20 bg-green-500/10 p-4">
                <p className="font-semibold text-green-200">
                  Batch payment history will appear here.
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  After you apply one check across multiple invoices, Trimax
                  will record the payment reference, customer, amount, and time
                  here for quick review.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {paymentLogs.map((log) => {
                  const chips = paymentProofChips(log);
                  const amount = activityAmount(log);

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
                          <p className="mt-1 font-semibold">
                            {log.entity_label ?? "Invoice payment"}
                          </p>
                          <p className="mt-1 text-sm text-zinc-500">
                            {formatDate(log.created_at)}
                            {log.actor_email ? ` by ${log.actor_email}` : ""}
                          </p>
                        </div>

                        {amount > 0 ? (
                          <p className="font-black text-green-300">
                            {formatMoney(amount)}
                          </p>
                        ) : null}
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
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
