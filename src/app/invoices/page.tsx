import Link from "next/link";
import AppShell from "../components/AppShell";
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
  status: string | null;
  due_date: string | null;
  split_parent_invoice_id: string | null;
  split_sequence: number | null;
  split_count: number | null;
};

type InvoiceWithSplitInfo = Invoice & {
  split_children_count: number;
  split_parent_display_id: string | null;
};

function formatMoney(value: string | number | null) {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed)) {
    return "$0.00";
  }

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
    resolvedSearchParams.view === "splits"
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
        "id, display_id, customer_name, project_title, invoice_amount, status, due_date, split_parent_invoice_id, split_sequence, split_count"
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
      if (
        statusFilter !== "all" &&
        (invoice.status || "Draft").toLowerCase() !==
          statusFilter
      ) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      const searchableText = [
        invoice.display_id,
        invoice.project_title,
        invoice.customer_name,
        invoice.status,
        invoice.split_parent_display_id,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(
        searchTerm.toLowerCase()
      );
    }
  );

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
                          {formatMoney(invoice.invoice_amount)}
                        </p>

                        <div className="mt-2">
                          <StatusBadge status={invoice.status || "Draft"} />
                        </div>

                        <p className="mt-2 text-sm text-zinc-400">
                          {formatDate(invoice.due_date)}
                        </p>
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
