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

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ business?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const businessQuery = `?business=${businessSlug}`;

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
      loadIssues.push(
        "Invoices could not be loaded yet. This is usually a Supabase permission or stale login session issue."
      );
    }

    invoices = (invoiceData ?? []) as Invoice[];

    const { data: activityData, error: activityError } = await supabase
      .from("activity_logs")
      .select("id, actor_email, entity_label, details, created_at")
      .eq("business_id", business.id)
      .eq("action", "invoice.batch_payment_applied")
      .order("created_at", { ascending: false })
      .limit(8);

    if (activityError) {
      loadIssues.push(
        "Recent payment activity could not be loaded yet."
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
  const batchOpportunities = Array.from(
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
    .filter((group) => group.count > 1)
    .sort((first, second) => second.total - first.total)
    .slice(0, 4);

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
          <Card className="border-yellow-500/30 bg-yellow-500/10">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-yellow-200">
              Payment Data Notice
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Payments page is open, but some data needs attention
            </h2>

            <div className="mt-4 space-y-2 text-sm leading-6 text-yellow-50/90">
              {loadIssues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>

            <p className="mt-4 text-sm leading-6 text-zinc-300">
              If you are on the login page, sign in again first. If you are
              already signed in and this stays here, the next step is tightening
              the Supabase policy for invoices and activity logs.
            </p>
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
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
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

        <BatchInvoicePayments
          businessId={business?.id}
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

        {batchOpportunities.length > 0 ? (
          <Card>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-green-300">
                  Batch Opportunities
                </p>
                <h2 className="mt-2 text-2xl font-bold">
                  Customers with multiple open invoices
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  These are the best places to start when one check pays several
                  invoices at once.
                </p>
              </div>

              <Link href={`/invoices${businessQuery}`}>
                <Button variant="secondary">Review All Invoices</Button>
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {batchOpportunities.map((group) => (
                <div
                  key={group.customerName}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">
                        {group.customerName}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        {group.count} open invoices
                      </p>
                    </div>

                    <p className="text-lg font-black text-green-300">
                      {formatMoney(group.total)}
                    </p>
                  </div>

                  <p className="mt-3 text-sm text-zinc-400">
                    Oldest due date: {formatDate(group.oldestDue)}
                  </p>
                </div>
              ))}
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
                  className="flex gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
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
              <p className="mt-5 text-sm leading-6 text-zinc-400">
                No batch payments have been logged yet.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {paymentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
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
