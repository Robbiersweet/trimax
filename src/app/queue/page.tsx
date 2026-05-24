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

type QueueItemWithEstimate = {
  id: string;
  property: string | null;
  unit: string | null;
  status: string | null;
  paint_type: string | null;
  flooring: string | null;
  move_out_date: string | null;
  ready_date: string | null;
  notes: string | null;
  linked_estimate_id: string | null;
};

type LinkedEstimate = {
  id: string;
  display_id: string | null;
};

function normalizeStatus(value: string | null) {
  return (value || "Pending Estimate").trim().toLowerCase();
}

function statusLabel(value: string) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function queueHref(
  businessSlug: string,
  options?: {
    q?: string;
    status?: string;
  }
) {
  const params = new URLSearchParams({
    business: businessSlug,
  });

  if (options?.q) {
    params.set("q", options.q);
  }

  if (options?.status && options.status !== "all") {
    params.set("status", options.status);
  }

  return `/queue?${params.toString()}`;
}

export default async function QueuePage({
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
    resolvedSearchParams.status?.trim().toLowerCase() ?? "all";
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

  let queueItems: QueueItemWithEstimate[] = [];

  if (selectedBusiness?.id) {
    const { data, error } = await supabase
      .from("queue_items")
      .select("*")
      .eq("business_id", selectedBusiness.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
    }

    queueItems = (data ?? []) as QueueItemWithEstimate[];
  }

  const linkedEstimateIds = queueItems
    .map((item) => item.linked_estimate_id)
    .filter((id): id is string => Boolean(id));

  let linkedEstimates: LinkedEstimate[] = [];

  if (linkedEstimateIds.length > 0) {
    const { data } = await supabase
      .from("estimates")
      .select("id, display_id")
      .in("id", linkedEstimateIds);

    linkedEstimates = data ?? [];
  }

  const estimateById = new Map(
    linkedEstimates.map((estimate) => [estimate.id, estimate])
  );

  const statuses = Array.from(
    new Set(queueItems.map((item) => normalizeStatus(item.status)))
  ).sort((first, second) => first.localeCompare(second));

  const filteredQueueItems = queueItems.filter((item) => {
    if (
      statusFilter !== "all" &&
      normalizeStatus(item.status) !== statusFilter
    ) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    const searchableText = [
      item.property,
      item.unit,
      item.status,
      item.paint_type,
      item.flooring,
      item.move_out_date,
      item.ready_date,
      item.notes,
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(searchTerm.toLowerCase());
  });

  const statusLinks = [
    {
      label: "All",
      value: "all",
    },
    ...statuses.map((status) => ({
      label: statusLabel(status),
      value: status,
    })),
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-3 text-5xl font-bold">Work Queue</h1>

            <p className="mt-3 text-zinc-400">
              Showing queue items for{" "}
              {selectedBusiness?.name ?? "selected business"}.
            </p>
          </div>

          <Link href={`/new-request${businessQuery}`}>
            <Button>+ New Queue Item</Button>
          </Link>
        </div>

        <Card>
          <form
            action="/queue"
            className="grid gap-4 md:grid-cols-[1fr_auto]"
          >
            <input type="hidden" name="business" value={businessSlug} />

            {statusFilter !== "all" ? (
              <input type="hidden" name="status" value={statusFilter} />
            ) : null}

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Search Queue
              </label>

              <input
                name="q"
                defaultValue={searchTerm}
                placeholder="Search property, unit, paint, flooring, date, or notes"
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div className="flex items-end gap-3">
              <Button>Search</Button>

              {(searchTerm || statusFilter !== "all") && (
                <Link href={`/queue${businessQuery}`}>
                  <Button variant="secondary">Clear</Button>
                </Link>
              )}
            </div>
          </form>
        </Card>

        <div className="flex flex-wrap gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-2">
          {statusLinks.map((filter) => (
            <Link
              key={filter.value}
              href={queueHref(businessSlug, {
                q: searchTerm,
                status: filter.value,
              })}
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

        <div className="grid gap-6">
          {queueItems.length === 0 ? (
            <Card>
              <p className="text-zinc-400">
                No queue items for this business yet.
              </p>
            </Card>
          ) : filteredQueueItems.length === 0 ? (
            <Card>
              <p className="text-zinc-400">
                No queue items match those filters.
              </p>
            </Card>
          ) : (
            filteredQueueItems.map((item) => {
              const linkedEstimate = item.linked_estimate_id
                ? estimateById.get(item.linked_estimate_id)
                : null;

              return (
                <Card key={item.id}>
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-semibold">
                          {item.property || "Unknown Property"}
                        </h2>

                        <StatusBadge
                          status={item.status ?? "Pending Estimate"}
                        />
                      </div>

                      <p className="mt-2 text-zinc-400">
                        Unit {item.unit || "-"}
                      </p>

                      <div className="mt-5 grid gap-4 text-sm text-zinc-300 md:grid-cols-2">
                        <Info label="Paint Type" value={item.paint_type} />
                        <Info label="Flooring" value={item.flooring} />
                        <Info
                          label="Move Out Date"
                          value={item.move_out_date}
                        />
                        <Info label="Ready Date" value={item.ready_date} />
                      </div>

                      <p className="mt-5 max-w-2xl text-zinc-400">
                        {item.notes || "No notes added."}
                      </p>

                      {linkedEstimate ? (
                        <p className="mt-4 text-sm text-purple-300">
                          Linked Estimate:{" "}
                          {linkedEstimate.display_id ?? "Estimate"}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                      <Link href={`/queue/${item.id}${businessQuery}`}>
                        <Button>Open Queue Item</Button>
                      </Link>

                      {linkedEstimate ? (
                        <Link
                          href={`/estimates/${linkedEstimate.id}${businessQuery}`}
                        >
                          <Button variant="secondary">Open Estimate</Button>
                        </Link>
                      ) : (
                        <Link
                          href={`/estimates/new?queueId=${item.id}&business=${businessSlug}`}
                        >
                          <Button variant="secondary">Create Estimate</Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <p className="text-zinc-500">{label}</p>
      <p>{value || "-"}</p>
    </div>
  );
}
