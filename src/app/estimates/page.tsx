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

type Estimate = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  estimate_amount: string | number | null;
  status: string | null;
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

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    q?: string;
    status?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const searchTerm = resolvedSearchParams.q?.trim() ?? "";
  const statusFilter =
    resolvedSearchParams.status === "draft" ||
    resolvedSearchParams.status === "approved" ||
    resolvedSearchParams.status === "converted"
      ? resolvedSearchParams.status
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

  let estimates: Estimate[] = [];

  if (selectedBusiness?.id) {
    const { data } = await supabase
      .from("estimates")
      .select(
        "id, display_id, customer_name, project_title, estimate_amount, status"
      )
      .eq("business_id", selectedBusiness.id)
      .order("created_at", { ascending: false });

    estimates = (data ?? []) as Estimate[];
  }

  const filteredEstimates = estimates.filter((estimate) => {
    if (
      statusFilter !== "all" &&
      (estimate.status || "Draft").toLowerCase() !== statusFilter
    ) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    const searchableText = [
      estimate.display_id,
      estimate.project_title,
      estimate.customer_name,
      estimate.status,
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(searchTerm.toLowerCase());
  });

  const filterLinks = [
    {
      label: "All",
      value: "all",
      href: `/estimates${businessQuery}${searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : ""}`,
    },
    {
      label: "Draft",
      value: "draft",
      href: `/estimates${businessQuery}&status=draft${searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : ""}`,
    },
    {
      label: "Approved",
      value: "approved",
      href: `/estimates${businessQuery}&status=approved${searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : ""}`,
    },
    {
      label: "Converted",
      value: "converted",
      href: `/estimates${businessQuery}&status=converted${searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : ""}`,
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-2 text-4xl font-bold">Estimates</h1>

            <p className="mt-2 text-zinc-400">
              Showing estimates for{" "}
              {selectedBusiness?.name ?? "selected business"}.
            </p>
          </div>

          <Link href={`/estimates/new${businessQuery}`}>
            <Button>+ New Estimate</Button>
          </Link>
        </div>

        <Card>
          <form
            action="/estimates"
            className="grid gap-4 md:grid-cols-[1fr_auto]"
          >
            <input
              type="hidden"
              name="business"
              value={businessSlug}
            />

            {statusFilter !== "all" ? (
              <input
                type="hidden"
                name="status"
                value={statusFilter}
              />
            ) : null}

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Search Estimates
              </label>

              <input
                name="q"
                defaultValue={searchTerm}
                placeholder="Search number, project, customer, or status"
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div className="flex items-end gap-3">
              <Button>Search</Button>

              {(searchTerm || statusFilter !== "all") && (
                <Link href={`/estimates${businessQuery}`}>
                  <Button variant="secondary">
                    Clear
                  </Button>
                </Link>
              )}
            </div>
          </form>
        </Card>

        <div className="flex flex-wrap gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-2">
          {filterLinks.map((filter) => (
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

        {estimates.length === 0 ? (
          <Card>
            <p className="text-zinc-400">
              No estimates for this business yet.
            </p>
          </Card>
        ) : filteredEstimates.length === 0 ? (
          <Card>
            <p className="text-zinc-400">
              No estimates match those filters.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredEstimates.map((estimate) => (
              <Link
                key={estimate.id}
                href={`/estimates/${estimate.id}${businessQuery}`}
              >
                <Card className="transition hover:border-orange-500/60 hover:bg-zinc-800">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm text-orange-400">
                        {estimate.display_id ?? "Estimate"}
                      </p>

                      <h2 className="mt-1 text-2xl font-semibold">
                        {estimate.project_title || "Untitled Estimate"}
                      </h2>

                      <p className="mt-1 text-zinc-400">
                        {estimate.customer_name || "Unknown Customer"}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xl font-bold text-orange-400">
                        {formatMoney(estimate.estimate_amount)}
                      </p>

                      <div className="mt-2">
                        <StatusBadge
                          status={estimate.status || "Draft"}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
