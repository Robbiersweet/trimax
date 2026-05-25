import Link from "next/link";
import AppShell from "../components/AppShell";
import BatchInvoicePayments from "../components/BatchInvoicePayments";
import Card from "../components/Card";
import Button from "../components/Button";
import StatusBadge from "../components/StatusBadge";
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
  split_parent_invoice_id: string | null;
  split_sequence: number | null;
  split_count: number | null;
};

type InvoiceWithSplitInfo = Invoice & {
  split_children_count: number;
  split_parent_display_id: string | null;
};

function parseMoney(value: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number | null) {
  const parsed = parseMoney(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(parsed);
}

function formatDate(value: string | null) {
  if (!value) {
    return "No Due Date";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  }).format(date);
}

function invoiceDaysPastDue(value: string | null) {
  if (!value) {
    return null;
  }

  const dueDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.floor(
    (today.getTime() - dueDate.getTime()) / 86_400_000
  );
}

function matchesStatusFilter({
  statusFilter,
  invoiceStatus,
  amountDue,
  daysLate,
}: {
  statusFilter: string;
  invoiceStatus: string | null;
  amountDue: number;
  daysLate: number | null;
}) {
  if (statusFilter === "all") {
    return true;
  }

  if (statusFilter === "overdue") {
    return amountDue > 0 && (daysLate ?? -1) >= 0;
  }

  return (invoiceStatus || "Draft").toLowerCase() === statusFilter;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    q?: string;
    status?: string;
    view?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const searchTerm = resolvedSearchParams.q?.trim() ?? "";
  const statusFilter =
    resolvedSearchParams.status === "draft" ||
    resolvedSearchParams.status === "sent" ||
    resolvedSearchParams.status === "paid" ||
    resolvedSearchParams.status === "overdue"
      ? resolvedSearchParams.status
      : "all";
  const view =
    resolvedSearchParams.view === "originals" ||
    resolvedSearchParams.view === "splits" ||
    resolvedSearchParams.view === "aging"
      ? resolvedSearchParams.view
      : "all";
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

  const selectedBusiness = businessData as Business | null;

  let invoices: Invoice[] = [];
  let invoicesWithSplitInfo: InvoiceWithSplitInfo[] = [];

  if (selectedBusiness?.id) {
    const { data, error } = await supabase
      .from("invoices")
      .select(
        "id, display_id, customer_name, project_title, invoice_amount, amount_paid, status, due_date, updated_at, created_at, split_parent_invoice_id, split_sequence, split_count"
      )
      .eq("business_id", selectedBusiness.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
    }

    invoices = (data ?? []) as Invoice[];

    const invoiceById = new Map(
      invoices.map((invoice) => [invoice.id, invoice])
    );

    const splitChildrenByParentId = new Map<string, number>();

    invoices.forEach((invoice) => {
      if (!invoice.split_parent_invoice_id) {
        return;
      }

      splitChildrenByParentId.set(
        invoice.split_parent_invoice_id,
        (splitChildrenByParentId.get(
          invoice.split_parent_invoice_id
        ) ?? 0) + 1
      );
    });

    invoicesWithSplitInfo = invoices
      .map((invoice) => ({
        ...invoice,
        split_children_count:
          splitChildrenByParentId.get(invoice.id) ?? 0,
        split_parent_display_id: invoice.split_parent_invoice_id
          ? invoiceById.get(invoice.split_parent_invoice_id)
              ?.display_id ?? null
          : null,
      }))
      .filter((invoice) => {
        if (view === "originals") {
          return !invoice.split_parent_invoice_id;
        }

        if (view === "splits") {
          return Boolean(invoice.split_parent_invoice_id);
        }

        return true;
      });
  }

  const activeParams = new URLSearchParams({
    business: businessSlug,
  });

  if (searchTerm) {
    activeParams.set("q", searchTerm);
  }

  if (statusFilter !== "all") {
    activeParams.set("status", statusFilter);
  }

  if (view !== "all") {
    activeParams.set("view", view);
  }

  const filteredInvoices = invoicesWithSplitInfo.filter(
    (invoice) => {
      const invoiceTotal = parseMoney(invoice.invoice_amount);
      const amountPaid = parseMoney(invoice.amount_paid);
      const amountDue = Math.max(invoiceTotal - amountPaid, 0);
      const daysLate = invoiceDaysPastDue(invoice.due_date);
      const searchableText = [
        invoice.display_id,
        invoice.project_title,
        invoice.customer_name,
        invoice.status,
        invoice.split_parent_display_id,
      ]
        .join(" ")
        .toLowerCase();

      if (
        searchTerm &&
        !searchableText.includes(searchTerm.toLowerCase())
      ) {
        return false;
      }

      if (view === "aging") {
        return (
          amountDue > 0 &&
          (daysLate ?? -1) >= 0 &&
          matchesStatusFilter({
            statusFilter,
            invoiceStatus: invoice.status,
            amountDue,
            daysLate,
          })
        );
      }

      if (
        !matchesStatusFilter({
          statusFilter,
          invoiceStatus: invoice.status,
          amountDue,
          daysLate,
        })
      ) {
        return false;
      }

      return true;
    }
  );

  const openInvoicesWithAmounts = invoicesWithSplitInfo
    .map((invoice) => {
      const invoiceTotal = parseMoney(invoice.invoice_amount);
      const amountPaid = parseMoney(invoice.amount_paid);

      return {
        ...invoice,
        amountDue: Math.max(invoiceTotal - amountPaid, 0),
        daysLate: invoiceDaysPastDue(invoice.due_date),
      };
    })
    .filter(
      (invoice) =>
        invoice.amountDue > 0 &&
        (invoice.status || "Draft").toLowerCase() !== "paid"
    );

  const agingBuckets = [
    {
      label: "0-30 Days",
      min: 0,
      max: 30,
    },
    {
      label: "31-60 Days",
      min: 31,
      max: 60,
    },
    {
      label: "61-90 Days",
      min: 61,
      max: 90,
    },
    {
      label: "91+ Days",
      min: 91,
      max: Infinity,
    },
  ].map((bucket) => {
    const bucketInvoices = openInvoicesWithAmounts.filter((invoice) => {
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

  const openBalanceTotal = openInvoicesWithAmounts.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const overdueBalanceTotal = openInvoicesWithAmounts
    .filter((invoice) => (invoice.daysLate ?? -1) >= 0)
    .reduce((total, invoice) => total + invoice.amountDue, 0);
  const draftBalanceTotal = invoicesWithSplitInfo
    .filter(
      (invoice) => (invoice.status || "Draft").toLowerCase() === "draft"
    )
    .reduce(
      (total, invoice) =>
        total +
        Math.max(
          parseMoney(invoice.invoice_amount) -
            parseMoney(invoice.amount_paid),
          0
        ),
      0
    );
  const agingVisualMax = Math.max(
    ...agingBuckets.map((bucket) => bucket.amount),
    1
  );

  const customerBalanceRows = Array.from(
    openInvoicesWithAmounts.reduce(
      (customers, invoice) => {
        const customerName =
          invoice.customer_name?.trim() || "Unknown Customer";
        const existing = customers.get(customerName) ?? {
          customerName,
          invoiceCount: 0,
          amountDue: 0,
          oldestDaysLate: null as number | null,
        };

        existing.invoiceCount += 1;
        existing.amountDue += invoice.amountDue;

        if (
          invoice.daysLate !== null &&
          invoice.daysLate >= 0 &&
          (existing.oldestDaysLate === null ||
            invoice.daysLate > existing.oldestDaysLate)
        ) {
          existing.oldestDaysLate = invoice.daysLate;
        }

        customers.set(customerName, existing);

        return customers;
      },
      new Map<
        string,
        {
          customerName: string;
          invoiceCount: number;
          amountDue: number;
          oldestDaysLate: number | null;
        }
      >()
    ).values()
  )
    .sort((first, second) => second.amountDue - first.amountDue)
    .slice(0, 6);

  const recentlyUpdatedInvoices = [...invoicesWithSplitInfo]
    .sort((first, second) => {
      const firstTime = new Date(
        first.updated_at ?? first.created_at ?? "1970-01-01"
      ).getTime();
      const secondTime = new Date(
        second.updated_at ?? second.created_at ?? "1970-01-01"
      ).getTime();

      return secondTime - firstTime;
    })
    .slice(0, 5);

  const viewLinks = [
    {
      label: "All",
      value: "all",
    },
    {
      label: "Originals",
      value: "originals",
    },
    {
      label: "Split Invoices",
      value: "splits",
    },
    {
      label: "Aging",
      value: "aging",
    },
  ].map((filter) => {
    const params = new URLSearchParams(activeParams);

    if (filter.value === "all") {
      params.delete("view");
    } else {
      params.set("view", filter.value);
    }

    return {
      ...filter,
      href: `/invoices?${params.toString()}`,
    };
  });

  const statusLinks = [
    {
      label: "All Statuses",
      value: "all",
    },
    {
      label: "Draft",
      value: "draft",
    },
    {
      label: "Sent",
      value: "sent",
    },
    {
      label: "Paid",
      value: "paid",
    },
    {
      label: "Overdue",
      value: "overdue",
    },
  ].map((filter) => {
    const params = new URLSearchParams(activeParams);

    if (filter.value === "all") {
      params.delete("status");
    } else {
      params.set("status", filter.value);
    }

    return {
      ...filter,
      href: `/invoices?${params.toString()}`,
    };
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-2 text-4xl font-bold">Invoices</h1>

            <p className="mt-2 text-zinc-400">
              Showing invoices for{" "}
              {selectedBusiness?.name ?? "selected business"}.
            </p>
          </div>

          <Link href={`/invoices/new${businessQuery}`}>
            <Button>+ New Invoice</Button>
          </Link>
        </div>

        <Card>
          <form
            action="/invoices"
            className="grid gap-4 md:grid-cols-[1fr_auto]"
          >
            <input
              type="hidden"
              name="business"
              value={businessSlug}
            />

            {view !== "all" ? (
              <input
                type="hidden"
                name="view"
                value={view}
              />
            ) : null}

            {statusFilter !== "all" ? (
              <input
                type="hidden"
                name="status"
                value={statusFilter}
              />
            ) : null}

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Search Invoices
              </label>

              <input
                name="q"
                defaultValue={searchTerm}
                placeholder="Search number, project, customer, status, or split source"
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div className="flex items-end gap-3">
              <Button>Search</Button>

              {(searchTerm ||
                statusFilter !== "all" ||
                view !== "all") && (
                <Link href={`/invoices${businessQuery}`}>
                  <Button variant="secondary">
                    Clear
                  </Button>
                </Link>
              )}
            </div>
          </form>
        </Card>

        <div className="flex flex-wrap gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-2">
          {viewLinks.map((filter) => (
            <Link
              key={filter.value}
              href={filter.href}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                view === filter.value
                  ? "bg-orange-500 text-black"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {filter.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-2">
          {statusLinks.map((filter) => (
            <Link
              key={filter.value}
              href={filter.href}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                statusFilter === filter.value
                  ? "bg-orange-500 text-black"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {filter.label}
            </Link>
          ))}
        </div>

        <BatchInvoicePayments
          businessId={selectedBusiness?.id}
          invoices={invoicesWithSplitInfo.map((invoice) => ({
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

        <Card className="border-pink-500/20 bg-pink-500/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-pink-300">
                Accounts Aging
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Past-due invoice buckets
              </h2>

              <p className="mt-2 text-sm text-zinc-400">
                See unpaid invoices by age, then use batch payments when one
                check covers several units.
              </p>
            </div>

            <Link href={`/invoices?business=${businessSlug}&view=aging`}>
              <Button variant="secondary">Open Aging View</Button>
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-sm text-zinc-400">Total Outstanding</p>
              <p className="mt-2 text-3xl font-black text-white">
                {formatMoney(openBalanceTotal)}
              </p>
            </div>

            <div className="rounded-2xl border border-pink-500/30 bg-pink-500/10 p-4">
              <p className="text-sm text-pink-100/80">Past Due</p>
              <p className="mt-2 text-3xl font-black text-pink-100">
                {formatMoney(overdueBalanceTotal)}
              </p>
            </div>

            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm text-amber-100/80">Still In Draft</p>
              <p className="mt-2 text-3xl font-black text-amber-100">
                {formatMoney(draftBalanceTotal)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {agingBuckets.map((bucket) => (
              <div
                key={bucket.label}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
              >
                <p className="text-sm text-zinc-400">{bucket.label}</p>

                <p className="mt-2 text-2xl font-black">
                  {formatMoney(bucket.amount)}
                </p>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-pink-400"
                    style={{
                      width: `${Math.max(
                        4,
                        (bucket.amount / agingVisualMax) * 100
                      )}%`,
                    }}
                  />
                </div>

                <p className="mt-1 text-sm text-zinc-500">
                  {bucket.count} invoice{bucket.count === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {customerBalanceRows.length > 0 ? (
          <Card>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                  Customer Balances
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  Open invoices by customer
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Useful when one check pays several units or recurring jobs.
                </p>
              </div>

              <Link href={`/invoices?business=${businessSlug}&view=aging`}>
                <Button variant="secondary">Review Aging</Button>
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {customerBalanceRows.map((customer) => {
                const customerParams = new URLSearchParams({
                  business: businessSlug,
                  q: customer.customerName,
                });

                return (
                  <Link
                    key={customer.customerName}
                    href={`/invoices?${customerParams.toString()}`}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-orange-500/60 hover:bg-zinc-900"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-white">
                          {customer.customerName}
                        </p>

                        <p className="mt-1 text-sm text-zinc-400">
                          {customer.invoiceCount} open invoice
                          {customer.invoiceCount === 1 ? "" : "s"}
                        </p>
                      </div>

                      <p className="text-lg font-black text-orange-300">
                        {formatMoney(customer.amountDue)}
                      </p>
                    </div>

                    <div className="mt-4 border-t border-zinc-800 pt-3 text-sm">
                      {customer.oldestDaysLate !== null ? (
                        <span className="font-semibold text-pink-200">
                          Oldest is {customer.oldestDaysLate} day
                          {customer.oldestDaysLate === 1 ? "" : "s"} late
                        </span>
                      ) : (
                        <span className="text-zinc-400">
                          No past-due invoices
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        ) : null}

        {recentlyUpdatedInvoices.length > 0 ? (
          <Card>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Recently Updated
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Latest invoice activity
            </h2>

            <div className="mt-4 grid gap-3 md:grid-cols-5">
              {recentlyUpdatedInvoices.map((invoice) => {
                const invoiceTotal = parseMoney(invoice.invoice_amount);
                const amountPaid = parseMoney(invoice.amount_paid);
                const amountDue = Math.max(invoiceTotal - amountPaid, 0);

                return (
                  <Link
                    key={invoice.id}
                    href={`/invoices/${invoice.id}${businessQuery}`}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-orange-500/60 hover:bg-zinc-900"
                  >
                    <p className="text-sm text-orange-300">
                      {invoice.display_id ?? "Invoice"}
                    </p>

                    <p className="mt-2 line-clamp-2 font-semibold">
                      {invoice.customer_name ?? "Unknown Customer"}
                    </p>

                    <p className="mt-3 border-t border-zinc-800 pt-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
                      Amount Due
                    </p>

                    <p className="mt-1 font-bold">
                      {formatMoney(amountDue)}
                    </p>

                    <p className="mt-2 text-sm text-zinc-400">
                      {invoice.status ?? "Draft"}
                    </p>
                  </Link>
                );
              })}
            </div>
          </Card>
        ) : null}

        {invoicesWithSplitInfo.length === 0 ? (
          <Card>
            <p className="text-zinc-400">
              No invoices found for this view.
            </p>
          </Card>
        ) : filteredInvoices.length === 0 ? (
          <Card>
            <p className="text-zinc-400">
              No invoices match those filters.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredInvoices.map((invoice) => {
              const isSplitInvoice = Boolean(
                invoice.split_parent_invoice_id
              );
              const hasSplitChildren =
                invoice.split_children_count > 0;
              const invoiceTotal = parseMoney(invoice.invoice_amount);
              const amountPaid = parseMoney(invoice.amount_paid);
              const amountDue = Math.max(invoiceTotal - amountPaid, 0);
              const daysLate = invoiceDaysPastDue(invoice.due_date);
              const isPastDue = amountDue > 0 && (daysLate ?? -1) >= 0;

              return (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}${businessQuery}`}
                >
                  <Card
                    className={`transition hover:border-orange-500/60 hover:bg-zinc-800 ${
                      isSplitInvoice
                        ? "border-green-500/30 bg-green-500/5"
                        : hasSplitChildren
                          ? "border-orange-500/30 bg-orange-500/5"
                          : ""
                    }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-sm text-orange-400">
                            {invoice.display_id ?? "Invoice"}
                          </p>

                          {isSplitInvoice ? (
                            <span className="rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-200">
                              Split {invoice.split_sequence ?? "-"} of{" "}
                              {invoice.split_count ?? "-"}
                            </span>
                          ) : null}

                          {hasSplitChildren ? (
                            <span className="rounded-full border border-orange-500/40 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-200">
                              {invoice.split_children_count} split invoice
                              {invoice.split_children_count === 1
                                ? ""
                                : "s"}
                            </span>
                          ) : null}
                        </div>

                        <h2 className="mt-1 text-2xl font-semibold">
                          {invoice.project_title || "Untitled Invoice"}
                        </h2>

                        <p className="mt-1 text-zinc-400">
                          {invoice.customer_name || "Unknown Customer"}
                        </p>

                        {isSplitInvoice ? (
                          <p className="mt-2 text-sm text-green-200/80">
                            Created from{" "}
                            {invoice.split_parent_display_id ??
                              "original invoice"}
                          </p>
                        ) : null}
                      </div>

                      <div className="sm:text-right">
                        <p className="text-xl font-bold text-orange-400">
                          {formatMoney(amountDue)}
                        </p>

                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">
                          Amount Due
                        </p>

                        <div className="mt-2">
                          <StatusBadge status={invoice.status || "Draft"} />
                        </div>

                        <p className="mt-2 text-sm text-zinc-400">
                          {formatDate(invoice.due_date)}
                        </p>

                        {isPastDue ? (
                          <p className="mt-2 text-sm font-semibold text-pink-200">
                            {daysLate} day{daysLate === 1 ? "" : "s"} past due
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
