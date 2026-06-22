import Link from "next/link";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import Card from "../components/Card";
import {
  buildServiceAnalyticsRows,
  type ServiceAnalyticsLineItem,
  type ServiceAnalyticsService,
} from "../lib/serviceAnalytics";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value || 0);
}

async function loadLineItems(table: "estimate_line_items" | "invoice_line_items", businessId: string) {
  const withCreatedAt = await supabase
    .from(table)
    .select("description, quantity, unit_price, line_total, created_at")
    .eq("business_id", businessId);

  if (!withCreatedAt.error) {
    return (withCreatedAt.data ?? []) as ServiceAnalyticsLineItem[];
  }

  const fallback = await supabase
    .from(table)
    .select("description, quantity, unit_price, line_total")
    .eq("business_id", businessId);

  if (fallback.error) {
    console.warn(`${table} could not be loaded:`, fallback.error.message);
    return [];
  }

  return (fallback.data ?? []) as ServiceAnalyticsLineItem[];
}

export default async function ServiceAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const businessQuery = `?business=${businessSlug}`;

  const { data: businessData } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .maybeSingle();

  const business = businessData as Business | null;

  let services: ServiceAnalyticsService[] = [];
  let estimateLineItems: ServiceAnalyticsLineItem[] = [];
  let invoiceLineItems: ServiceAnalyticsLineItem[] = [];

  if (business) {
    const { data: serviceData, error: serviceError } = await supabase
      .from("service_items")
      .select("*")
      .eq("business_id", business.id)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (serviceError) {
      console.warn("Services could not be loaded:", serviceError.message);
    } else {
      services = (serviceData ?? []) as ServiceAnalyticsService[];
    }

    [estimateLineItems, invoiceLineItems] = await Promise.all([
      loadLineItems("estimate_line_items", business.id),
      loadLineItems("invoice_line_items", business.id),
    ]);
  }

  const analyticsRows = buildServiceAnalyticsRows({
    services,
    estimateLineItems,
    invoiceLineItems,
  });
  const usedRows = analyticsRows.filter((row) => row.usageCount > 0);
  const tierReadyServices = services.filter(
    (service) =>
      Number(service.easy_unit_price) > 0 ||
      Number(service.normal_unit_price) > 0 ||
      Number(service.difficult_unit_price) > 0
  );
  const topUsedService = usedRows[0] ?? null;
  const averageCatalogPrice =
    analyticsRows.length > 0
      ? analyticsRows.reduce(
          (total, row) => total + row.averageUnitPrice,
          0
        ) / analyticsRows.length
      : 0;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
              Estimating Assistant
            </p>
            <h1 className="mt-2 text-4xl font-black text-white">
              Service Analytics
            </h1>
            <p className="mt-2 max-w-3xl text-zinc-400">
              Trimax reads saved services, estimate line items, invoice line
              items, and imported FreshBooks lines to build a lightweight
              pricing memory for {business?.name ?? "this workspace"}.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={`/services${businessQuery}`}>
              <Button variant="secondary">Open Services</Button>
            </Link>
            <Link href={`/estimates/new${businessQuery}`}>
              <Button>New Estimate</Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-cyan-500/25 bg-cyan-500/10">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
              Services Read
            </p>
            <p className="mt-2 text-3xl font-black text-white">
              {analyticsRows.length}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              Saved and discovered service patterns.
            </p>
          </Card>

          <Card className="border-emerald-500/25 bg-emerald-500/10">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">
              Usage Samples
            </p>
            <p className="mt-2 text-3xl font-black text-white">
              {estimateLineItems.length + invoiceLineItems.length}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              Estimate and invoice line items.
            </p>
          </Card>

          <Card className="border-orange-500/25 bg-orange-500/10">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-200">
              Average Price
            </p>
            <p className="mt-2 text-3xl font-black text-white">
              {formatMoney(averageCatalogPrice)}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              Average across visible service rows.
            </p>
          </Card>

          <Card className="border-sky-500/25 bg-sky-500/10">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-200">
              Tier Ready
            </p>
            <p className="mt-2 text-3xl font-black text-white">
              {tierReadyServices.length}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              Services with Easy, Normal, or Difficult pricing.
            </p>
          </Card>
        </div>

        <Card className="border-white/10 bg-zinc-950/70">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Pricing Memory
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Service price signals
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Use this as a pricing reference only. It does not change the
                current estimate flow, and every estimate line can still be
                manually overridden.
              </p>
            </div>

            {topUsedService ? (
              <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                  Most Used
                </p>
                <p className="mt-1 font-black text-white">
                  {topUsedService.serviceName}
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  {topUsedService.usageCount} uses /{" "}
                  {formatMoney(topUsedService.averageUnitPrice)} average
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border border-zinc-800">
            <div className="grid min-w-[78rem] grid-cols-[minmax(14rem,1.4fr)_9rem_7rem_6rem_8rem_8rem_8rem_8rem_8rem] gap-3 bg-zinc-950 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
              <span>Service</span>
              <span>Category</span>
              <span>Unit</span>
              <span>Used</span>
              <span>Average</span>
              <span>Median</span>
              <span>Low</span>
              <span>High</span>
              <span>Recent</span>
            </div>

            {analyticsRows.length === 0 ? (
              <div className="px-4 py-8 text-sm text-zinc-400">
                No service pricing data is available yet.
              </div>
            ) : (
              analyticsRows.map((row) => (
                <div
                  key={`${row.serviceName}-${row.category}`}
                  className="grid min-w-[78rem] grid-cols-[minmax(14rem,1.4fr)_9rem_7rem_6rem_8rem_8rem_8rem_8rem_8rem] gap-3 border-t border-zinc-800 px-4 py-3 text-sm text-zinc-200"
                >
                  <div>
                    <p className="font-black text-white">{row.serviceName}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {row.sourceCount.estimates} estimates /{" "}
                      {row.sourceCount.invoices} invoices
                    </p>
                  </div>
                  <span>{row.category}</span>
                  <span>{row.unitType}</span>
                  <span>{row.usageCount}</span>
                  <span>{formatMoney(row.averageUnitPrice)}</span>
                  <span>{formatMoney(row.medianUnitPrice)}</span>
                  <span>{formatMoney(row.lowestUnitPrice)}</span>
                  <span>{formatMoney(row.highestUnitPrice)}</span>
                  <span>{formatMoney(row.mostRecentUnitPrice)}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
