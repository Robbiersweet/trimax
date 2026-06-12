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
  status: string | null;
  due_date: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type InvoiceWithoutUpdatedAt = Omit<Invoice, "updated_at">;

type ActivityLog = {
  id: string;
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

function activityAmount(log: ActivityLog) {
  const amount = log.details?.amountApplied;

  return typeof amount === "string" || typeof amount === "number"
    ? parseMoney(amount)
    : 0;
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
        "id, display_id, customer_name, project_title, invoice_amount, amount_paid, status, due_date, updated_at, created_at"
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
      .select("id, actor_email, entity_label, details, created_at")
      .eq("business_id", business.id)
      .eq("action", "invoice.batch_payment_applied")
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

      return {
        ...invoice,
        invoiceAmount,
        amountPaid,
        amountDue: Math.max(invoiceAmount - amountPaid, 0),
        daysLate: daysPastDue(invoice.due_date),
      };
    })
    .filter(
      (invoice) =>
        invoice.amountDue > 0 &&
        (invoice.status ?? "Draft").toLowerCase() !== "paid"
    );

  const openBalance = payableInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const overdueBalance = payableInvoices
    .filter((invoice) => (invoice.daysLate ?? -1) >= 0)
    .reduce((total, invoice) => total + invoice.amountDue, 0);
  const draftBalance = payableInvoices
    .filter((invoice) => (invoice.status ?? "Draft").toLowerCase() === "draft")
    .reduce((total, invoice) => total + invoice.amountDue, 0);
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
              Built for check days: review open invoices, select the ones paid
              by the same check, and mark the full batch paid together.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={`/invoices${businessQuery}`}>
              <Button variant="secondary">Open Invoices</Button>
            </Link>

            <Link href={`/invoices${businessQuery}&view=aging`}>
              <Button variant="secondary">Aging View</Button>
            </Link>
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
              Review the invoice list, enter the check details, then mark the
              selected invoices paid together.
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

              <Link href={`/invoices${businessQuery}&view=aging`}>
                <Button variant="secondary">Review Aging</Button>
              </Link>
            </div>
          </Card>
        ) : null}

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

              <Link href={`/invoices${businessQuery}&view=aging`}>
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
            invoices={invoices.map((invoice) => ({
              id: invoice.id,
              displayId: invoice.display_id ?? "Invoice",
              customerName: invoice.customer_name ?? "Unknown Customer",
              projectTitle: invoice.project_title ?? "Untitled Invoice",
              invoiceAmount: parseMoney(invoice.invoice_amount),
              amountPaid: parseMoney(invoice.amount_paid),
              status: invoice.status ?? "Draft",
              dueDate: invoice.due_date,
            }))}
          />
        </div>

        {paymentPriority.length > 0 ? (
          <Card>
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
                      <p className="mt-1 text-sm text-zinc-400">
                        {invoice.customer_name ?? "Unknown Customer"}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        {invoice.project_title ?? "Untitled Invoice"}
                      </p>
                    </div>

                    <div className="md:text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        Due
                      </p>
                      <p className="mt-1 font-semibold">
                        {formatDate(invoice.due_date)}
                      </p>
                      <p
                        className={`mt-1 text-sm ${
                          isLate ? "text-pink-200" : "text-zinc-500"
                        }`}
                      >
                        {isLate
                          ? `${daysLate} day${daysLate === 1 ? "" : "s"} late`
                          : "Not past due"}
                      </p>
                    </div>

                    <div className="md:text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        Balance
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
                  q: group.customerName,
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
                        <p className="mt-1 text-sm text-zinc-500">
                          {invoiceCountLabel(group.count)} open
                        </p>
                      </div>

                      <p className="text-lg font-black text-green-300">
                        {formatMoney(group.total)}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-800 pt-3">
                      <p className="text-sm text-zinc-400">
                        Oldest due date: {formatDate(group.oldestDue)}
                      </p>

                      <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-bold text-green-200">
                        {group.count > 1 ? "Batch candidate" : "Single invoice"}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link href={`/payments?${customerPaymentParams.toString()}`}>
                        <Button>Record Payment</Button>
                      </Link>

                      <Link href={`/invoices?${customerInvoiceParams.toString()}`}>
                        <Button variant="secondary">View Invoices</Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}

        {payableInvoices.length === 0 ? (
          <Card>
            <p className="text-lg font-semibold">No open invoices to pay.</p>
            <p className="mt-2 text-zinc-400">
              When invoices have an unpaid balance, this page will show the
              batch payment tool.
            </p>
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
                "Check the invoices paid by the same check.",
                "Enter the check amount and reference number.",
                "Trimax verifies the total before marking the selected invoices paid.",
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
                {paymentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="payment-log-card rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold">
                          {log.entity_label ?? "Invoice payment"}
                        </p>
                        <p className="mt-1 text-sm text-zinc-500">
                          {formatDate(log.created_at)}
                        </p>
                      </div>

                      <p className="font-black text-green-300">
                        {formatMoney(activityAmount(log))}
                      </p>
                    </div>

                    {log.details?.paymentReference ? (
                      <p className="mt-2 text-sm text-zinc-400">
                        Ref: {String(log.details.paymentReference)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
