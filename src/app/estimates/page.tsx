import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
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
  estimate_amount: string | null;
  status: string | null;
};

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams?: Promise<{ business?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";

  const { data: businessData } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", businessSlug)
    .single();

  const selectedBusiness = businessData as Business | null;

  let estimates: Estimate[] = [];

  if (selectedBusiness?.id) {
    const { data } = await supabase
      .from("estimates")
      .select("*")
      .eq("business_id", selectedBusiness.id)
      .order("created_at", { ascending: false });

    estimates = (data ?? []) as Estimate[];
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-2 text-4xl font-bold">Estimates</h1>

            <p className="mt-2 text-zinc-400">
              Showing estimates for {selectedBusiness?.name ?? "selected business"}.
            </p>
          </div>

          <Link href={`/estimates/new?business=${businessSlug}`}>
            <Button>+ New Estimate</Button>
          </Link>
        </div>

        {estimates.length === 0 ? (
          <Card>
            <p className="text-zinc-400">
              No estimates for this business yet.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {estimates.map((estimate) => (
              <Link key={estimate.id} href={`/estimates/${estimate.id}`}>
                <Card className="transition hover:border-orange-500/60 hover:bg-zinc-800">
                  <div className="flex items-start justify-between">
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
                        {estimate.estimate_amount || "$0"}
                      </p>

                      <p className="mt-1 text-sm text-zinc-400">
                        {estimate.status || "Draft"}
                      </p>
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