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

    invoicesWithSplitInfo = invoices.map((invoice) => ({
      ...invoice,
      split_children_count:
        splitChildrenByParentId.get(invoice.id) ?? 0,
      split_parent_display_id: invoice.split_parent_invoice_id
        ? invoiceById.get(invoice.split_parent_invoice_id)
            ?.display_id ?? null
        : null,
    }));
  }

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

        {invoicesWithSplitInfo.length === 0 ? (
          <Card>
            <p className="text-zinc-400">No invoices for this business yet.</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {invoicesWithSplitInfo.map((invoice) => {
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
