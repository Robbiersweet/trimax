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

  if (businessError) {
    console.error(businessError);
  }

  const business = businessData as Business | null;

  let invoices: Invoice[] = [];
  let paymentLogs: ActivityLog[] = [];

  if (business?.id) {
    const { data: invoiceData, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        "id, display_id, customer_name, project_title, invoice_amount, amount_paid, status, due_date, updated_at, created_at"
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false });

    if (invoiceError) {
      console.error(invoiceError);
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
      console.error(activityError);
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
