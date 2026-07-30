import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import DeleteEstimateButton from "../components/DeleteEstimateButton";
import StatusBadge from "../components/StatusBadge";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type Estimate = {
  id: string;
  business_id: string | null;
  client_id: string | null;
  queue_item_id: string | null;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  project_address: string | null;
  service_address: string | null;
  reference: string | null;
  estimate_amount: string | number | null;
  status: string | null;
  notes: string | null;
  terms: string | null;
  created_at: string | null;
  updated_at: string | null;
  hasLinkedInvoice?: boolean;
  linkedInvoiceId?: string | null;
  linkedInvoiceDisplayId?: string | null;
  linkedInvoiceStatus?: string | null;
  sentCount?: number;
  lastSentAt?: string | null;
  lastSentRecipient?: string | null;
  convertedAt?: string | null;
  activityCount?: number;
  lastActivityAt?: string | null;
};

type LinkedInvoice = {
  id: string;
  estimate_id: string | null;
  display_id: string | null;
  status: string | null;
};

type ActivityLog = {
  action: string;
  entity_id: string | null;
  actor_email: string | null;
  created_at: string | null;
  details: Record<string, unknown> | null;
};

function parseEstimateAmount(value: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number | null) {
  const parsed = parseEstimateAmount(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(parsed);
}

function getStatusKey(status: string | null) {
  return (status || "Draft").toLowerCase();
}

function getPipelineStatusKey(estimate: Estimate) {
  const statusKey = getStatusKey(estimate.status);

  if (statusKey === "converted" || estimate.hasLinkedInvoice) {
    return "converted";
  }

  return statusKey;
}

function getAuthoritativeStatusLabel(estimate: Estimate) {
  const statusKey = getPipelineStatusKey(estimate);

  if (estimate.hasLinkedInvoice) {
    return "Invoice connected";
  }

  if (statusKey === "converted") {
    return "Converted";
  }

  return estimate.status || "Draft";
}

function getDaysSince(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(
    0,
    Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24))
  );
}

function getEstimateFreshnessDate(estimate: Estimate) {
  return (
    estimate.lastActivityAt ??
    estimate.updated_at ??
    estimate.created_at
  );
}

function getDetailString(
  details: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = details?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatDaysLabel(days: number | null) {
  if (days === null) {
    return "No date recorded";
  }

  if (days === 0) {
    return "Today";
  }

  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function getEstimateReadiness(estimate: Estimate) {
  const missing: string[] = [];
  const amount = parseEstimateAmount(estimate.estimate_amount);

  if (!estimate.customer_name?.trim()) {
    missing.push("customer");
  }

  if (!estimate.project_title?.trim() && !estimate.reference?.trim()) {
    missing.push("scope title");
  }

  if (!estimate.project_address?.trim() && !estimate.service_address?.trim()) {
    missing.push("service address");
  }

  if (amount <= 0) {
    missing.push("price");
  }

  if (!estimate.terms?.trim()) {
    missing.push("terms");
  }

  const score = Math.max(0, Math.round(((5 - missing.length) / 5) * 100));
  const statusKey = getPipelineStatusKey(estimate);

  if (statusKey === "converted" || estimate.hasLinkedInvoice) {
    return {
      label: "Closed cleanly",
      detail: "This proposal is already connected to billing.",
      missing,
      score: 100,
      tone: "success",
    };
  }

  if (missing.length === 0) {
    return {
      label: "Client-ready",
      detail: "Customer, scope, address, price, and terms are all present.",
      missing,
      score,
      tone: "success",
    };
  }

  if (missing.length <= 2) {
    return {
      label: "Nearly ready",
      detail: `Add ${missing.join(" and ")} before sending.`,
      missing,
      score,
      tone: "warning",
    };
  }

  return {
    label: "Needs polish",
    detail: `Missing ${missing.slice(0, 3).join(", ")}${
      missing.length > 3 ? ", and more" : ""
    }.`,
    missing,
    score,
    tone: "warning",
  };
}

function getEstimateAttentionScore(estimate: Estimate) {
  const statusKey = getPipelineStatusKey(estimate);
  const amount = parseEstimateAmount(estimate.estimate_amount);
  const readiness = getEstimateReadiness(estimate);
  const daysSinceUpdate = getDaysSince(getEstimateFreshnessDate(estimate));
  const daysSinceSent = getDaysSince(estimate.lastSentAt);
  let score = Math.min(24, Math.floor(amount / 500));

  if (statusKey === "approved" && !estimate.hasLinkedInvoice) {
    score += 80;
  } else if (statusKey === "sent") {
    score += daysSinceSent !== null && daysSinceSent >= 3 ? 70 : 42;
  } else if (statusKey === "draft") {
    score += readiness.missing.length > 0 ? 66 : 48;
  } else if (estimate.hasLinkedInvoice || statusKey === "converted") {
    score -= 90;
  }

  if (readiness.missing.length > 0 && statusKey !== "converted") {
    score += 12;
  }

  if (daysSinceUpdate !== null && daysSinceUpdate >= 7 && statusKey !== "converted") {
    score += 8;
  }

  return score;
}

function compareEstimateNumbers(left: Estimate, right: Estimate) {
  const leftNumber = Number(left.display_id?.match(/\d+/)?.[0] ?? 0);
  const rightNumber = Number(right.display_id?.match(/\d+/)?.[0] ?? 0);

  return rightNumber - leftNumber;
}

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    q?: string;
    status?: string;
    sort?: string;
    limit?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const searchTerm = resolvedSearchParams.q?.trim() ?? "";
  const statusFilter =
    resolvedSearchParams.status === "draft" ||
    resolvedSearchParams.status === "sent" ||
    resolvedSearchParams.status === "approved" ||
    resolvedSearchParams.status === "converted"
      ? resolvedSearchParams.status
      : "all";
  const sortMode =
    resolvedSearchParams.sort === "newest" ||
    resolvedSearchParams.sort === "oldest" ||
    resolvedSearchParams.sort === "highest-value" ||
    resolvedSearchParams.sort === "estimate-number"
      ? resolvedSearchParams.sort
      : "needs-attention";
  const pageSize = 15;
  const requestedLimit = Number(resolvedSearchParams.limit ?? pageSize);
  const visibleLimit =
    Number.isFinite(requestedLimit) && requestedLimit > pageSize
      ? Math.min(100, Math.floor(requestedLimit))
      : pageSize;
  const businessQuery = `?business=${businessSlug}`;
  const estimateResultsAnchor = "#estimate-results";
  const baseResultsParams = new URLSearchParams({
    business: businessSlug,
  });

  if (searchTerm) {
    baseResultsParams.set("q", searchTerm);
  }

  if (statusFilter !== "all") {
    baseResultsParams.set("status", statusFilter);
  }

  if (sortMode !== "needs-attention") {
    baseResultsParams.set("sort", sortMode);
  }


  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  let estimateLoadMessage = businessError
    ? "Workspace details could not be loaded. Try signing in again, then reopen this workspace."
    : null;
  let estimatesLoadFailed = Boolean(businessError);

  if (businessError) {
    console.warn("Estimates workspace lookup failed:", businessError.message);
  }

  const selectedBusiness = businessData as Business | null;

  let estimates: Estimate[] = [];

  if (selectedBusiness?.id) {
    const { data, error } = await supabase
      .from("estimates")
      .select(
        "id, business_id, client_id, queue_item_id, display_id, customer_name, project_title, project_address, service_address, reference, estimate_amount, status, notes, terms, created_at"
      )
      .eq("business_id", selectedBusiness.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Estimates could not be loaded:", error.message);
      estimatesLoadFailed = true;
      estimateLoadMessage =
        "Estimates could not be loaded. Try signing in again; if this stays here, the estimate access settings need attention.";
    }

    estimates = (data ?? []) as Estimate[];

    const estimateIds = estimates.map((estimate) => estimate.id);

    if (estimateIds.length > 0) {
      const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices")
        .select("id, estimate_id, display_id, status")
        .eq("business_id", selectedBusiness.id)
        .in("estimate_id", estimateIds);

      if (invoiceError) {
        console.warn("Linked invoices could not be loaded:", invoiceError.message);
      } else {
        const invoiceByEstimateId = new Map(
          ((invoiceData ?? []) as LinkedInvoice[])
            .filter((invoice) => Boolean(invoice.estimate_id))
            .map((invoice) => [invoice.estimate_id as string, invoice])
        );

        estimates = estimates.map((estimate) => ({
          ...estimate,
          hasLinkedInvoice: invoiceByEstimateId.has(estimate.id),
          linkedInvoiceId: invoiceByEstimateId.get(estimate.id)?.id ?? null,
          linkedInvoiceDisplayId:
            invoiceByEstimateId.get(estimate.id)?.display_id ?? null,
          linkedInvoiceStatus:
            invoiceByEstimateId.get(estimate.id)?.status ?? null,
        }));
      }

      const { data: activityData, error: activityError } = await supabase
        .from("activity_logs")
        .select("action, entity_id, actor_email, created_at, details")
        .eq("business_id", selectedBusiness.id)
        .eq("entity_type", "estimate")
        .in("entity_id", estimateIds)
        .order("created_at", { ascending: false });

      if (activityError) {
        console.warn(
          "Estimate activity logs could not be loaded:",
          activityError.message
        );
      } else {
        const logsByEstimateId = new Map<string, ActivityLog[]>();

        ((activityData ?? []) as ActivityLog[]).forEach((log) => {
          if (!log.entity_id) {
            return;
          }

          const existingLogs = logsByEstimateId.get(log.entity_id) ?? [];
          existingLogs.push(log);
          logsByEstimateId.set(log.entity_id, existingLogs);
        });

        estimates = estimates.map((estimate) => {
          const logs = logsByEstimateId.get(estimate.id) ?? [];
          const sentLogs = logs.filter(
            (log) => log.action === "estimate.email_sent"
          );
          const convertedLog = logs.find(
            (log) => log.action === "estimate.converted_to_invoice"
          );
          const lastSentLog = sentLogs[0];

          return {
            ...estimate,
            sentCount: sentLogs.length,
            lastSentAt: lastSentLog?.created_at ?? null,
            lastSentRecipient:
              getDetailString(lastSentLog?.details, "recipient_email") ?? null,
            convertedAt: convertedLog?.created_at ?? null,
            activityCount: logs.length,
            lastActivityAt: logs[0]?.created_at ?? null,
          };
        });
      }
    }
  }

  const filteredEstimates = estimates.filter((estimate) => {
    if (
      statusFilter !== "all" &&
      getPipelineStatusKey(estimate) !== statusFilter
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
  const sortedFilteredEstimates = [...filteredEstimates].sort((left, right) => {
    if (sortMode === "newest") {
      return (
        new Date(right.created_at ?? 0).getTime() -
        new Date(left.created_at ?? 0).getTime()
      );
    }

    if (sortMode === "oldest") {
      return (
        new Date(left.created_at ?? 0).getTime() -
        new Date(right.created_at ?? 0).getTime()
      );
    }

    if (sortMode === "highest-value") {
      return (
        parseEstimateAmount(right.estimate_amount) -
        parseEstimateAmount(left.estimate_amount) ||
        compareEstimateNumbers(left, right)
      );
    }

    if (sortMode === "estimate-number") {
      return compareEstimateNumbers(left, right);
    }

    return (
      getEstimateAttentionScore(right) -
        getEstimateAttentionScore(left) ||
      compareEstimateNumbers(left, right)
    );
  });
  const visibleEstimates = sortedFilteredEstimates.slice(0, visibleLimit);
  const hasMoreEstimates = sortedFilteredEstimates.length > visibleLimit;
  const loadMoreParams = new URLSearchParams(baseResultsParams);
  loadMoreParams.set("limit", String(visibleLimit + pageSize));
  const loadMoreHref = `/estimates?${loadMoreParams.toString()}${estimateResultsAnchor}`;

  const draftEstimates = estimates.filter(
    (estimate) => getPipelineStatusKey(estimate) === "draft"
  );
  const sentEstimates = estimates.filter(
    (estimate) => getPipelineStatusKey(estimate) === "sent"
  );
  const approvedEstimates = estimates.filter(
    (estimate) => getPipelineStatusKey(estimate) === "approved"
  );
  const convertedEstimates = estimates.filter(
    (estimate) => getPipelineStatusKey(estimate) === "converted"
  );
  const approvedReadyForInvoice = approvedEstimates.filter(
    (estimate) => !estimate.hasLinkedInvoice
  );
  const openEstimates = estimates.filter(
    (estimate) =>
      getStatusKey(estimate.status) !== "converted" && !estimate.hasLinkedInvoice
  );
  const topOpenEstimate = [...openEstimates].sort(
    (left, right) =>
      parseEstimateAmount(right.estimate_amount) -
      parseEstimateAmount(left.estimate_amount)
  )[0];
  const totalEstimateValue = estimates.reduce(
    (total, estimate) => total + parseEstimateAmount(estimate.estimate_amount),
    0
  );
  const readyForInvoiceValue = approvedReadyForInvoice.reduce(
    (total, estimate) => total + parseEstimateAmount(estimate.estimate_amount),
    0
  );
  const filteredEstimateValue = filteredEstimates.reduce(
    (total, estimate) => total + parseEstimateAmount(estimate.estimate_amount),
    0
  );
  const conversionRate = estimates.length
    ? Math.round((convertedEstimates.length / estimates.length) * 100)
    : 0;
  const sentProofCount = estimates.filter(
    (estimate) => (estimate.sentCount ?? 0) > 0
  ).length;
  const proofCoverageRate = estimates.length
    ? Math.round((sentProofCount / estimates.length) * 100)
    : 0;
  const staleDraftEstimates = draftEstimates.filter((estimate) => {
    const age = getDaysSince(getEstimateFreshnessDate(estimate));

    return age !== null && age >= 7;
  });
  const sentFollowUpEstimates = sentEstimates.filter((estimate) => {
    const age = getDaysSince(
      estimate.lastSentAt ?? getEstimateFreshnessDate(estimate)
    );

    return age !== null && age >= 3;
  });
  const queueLinkedEstimates = estimates.filter(
    (estimate) => Boolean(estimate.queue_item_id)
  );
  const estimateHealthCards = [
    {
      label: "Proposal Pipeline",
      value: formatMoney(totalEstimateValue),
      detail: `${estimates.length} total estimate${estimates.length === 1 ? "" : "s"}`,
      tone: "info",
      href: `/estimates${businessQuery}${estimateResultsAnchor}`,
    },
    {
      label: "Ready to Invoice",
      value: formatMoney(readyForInvoiceValue),
      detail: `${approvedReadyForInvoice.length} approved estimate${approvedReadyForInvoice.length === 1 ? "" : "s"}`,
      tone: approvedReadyForInvoice.length > 0 ? "success" : "neutral",
      href:
        approvedReadyForInvoice[0]?.id
          ? `/estimates/${approvedReadyForInvoice[0].id}${businessQuery}`
          : `/estimates${businessQuery}&status=approved${estimateResultsAnchor}`,
    },
    {
      label: "Draft Follow-up",
      value: String(draftEstimates.length),
      detail: "Proposals still being prepared",
      tone: draftEstimates.length > 0 ? "warning" : "neutral",
      href: `/estimates${businessQuery}&status=draft${estimateResultsAnchor}`,
    },
    {
      label: "Sent Follow-up",
      value: String(sentFollowUpEstimates.length),
      detail: `${sentEstimates.length} sent proposal${sentEstimates.length === 1 ? "" : "s"} in motion`,
      tone: sentFollowUpEstimates.length > 0 ? "warning" : "info",
      href: `/estimates${businessQuery}&status=sent${estimateResultsAnchor}`,
    },
    {
      label: "Conversion Health",
      value: `${conversionRate}%`,
      detail: `${convertedEstimates.length} converted or linked`,
      tone: conversionRate >= 60 ? "success" : "info",
      href: `/estimates${businessQuery}&status=converted${estimateResultsAnchor}`,
    },
  ];
  const openEstimateValue = openEstimates.reduce(
    (total, estimate) => total + parseEstimateAmount(estimate.estimate_amount),
    0
  );
  const proposalReadinessCards = [
    {
      label: "Win Pipeline",
      value: formatMoney(openEstimateValue),
      detail: "Open proposal value that can still become work.",
      href: `/estimates${businessQuery}${estimateResultsAnchor}`,
      tone: "sky",
    },
    {
      label: "Conversion Queue",
      value: String(approvedReadyForInvoice.length),
      detail: "Approved estimates waiting to become invoices.",
      href: `/estimates${businessQuery}&status=approved${estimateResultsAnchor}`,
      tone: approvedReadyForInvoice.length > 0 ? "emerald" : "zinc",
    },
    {
      label: "Sent Proof",
      value: `${proofCoverageRate}%`,
      detail: `${sentProofCount} estimate${sentProofCount === 1 ? "" : "s"} have email proof in the activity log.`,
      href: `/activity${businessQuery}`,
      tone: proofCoverageRate >= 70 ? "emerald" : "amber",
    },
    {
      label: "Draft Cleanup",
      value: String(staleDraftEstimates.length),
      detail: `${draftEstimates.length} total draft${draftEstimates.length === 1 ? "" : "s"}; stale ones need a decision.`,
      href: `/estimates${businessQuery}&status=draft${estimateResultsAnchor}`,
      tone: draftEstimates.length > 0 ? "amber" : "zinc",
    },
  ];

  const estimateAttentionList = openEstimates
    .map((estimate) => {
      const statusKey = getPipelineStatusKey(estimate);
      const amount = parseEstimateAmount(estimate.estimate_amount);
      const readiness = getEstimateReadiness(estimate);
      const daysSinceUpdate = getDaysSince(
        getEstimateFreshnessDate(estimate)
      );
      const daysSinceSent = getDaysSince(estimate.lastSentAt);
      const reasons: string[] = [];
      let score = Math.min(24, Math.floor(amount / 500));
      let action = "Review proposal";
      let tone = "info";

      if (statusKey === "approved" && !estimate.hasLinkedInvoice) {
        score += 60;
        action = "Convert to invoice";
        tone = "success";
        reasons.push("approved and waiting on billing");
      }

      if (statusKey === "sent") {
        score += 34;
        action = daysSinceSent !== null && daysSinceSent >= 3
          ? "Follow up with customer"
          : "Watch for decision";
        tone = daysSinceSent !== null && daysSinceSent >= 3 ? "warning" : "info";
        reasons.push(
          daysSinceSent !== null
            ? `sent ${formatDaysLabel(daysSinceSent).toLowerCase()}`
            : "sent status needs proof check"
        );
      }

      if (statusKey === "draft") {
        score += 18;
        action = "Finish and send";
        tone = "warning";
        reasons.push("still in draft");
      }

      if ((estimate.sentCount ?? 0) === 0 && statusKey !== "draft") {
        score += 14;
        reasons.push("no sent proof logged");
      }

      if (daysSinceUpdate !== null && daysSinceUpdate >= 7) {
        score += 12;
        reasons.push(`quiet for ${daysSinceUpdate} days`);
      }

      if (estimate.queue_item_id) {
        score += 6;
        reasons.push("queue-linked scope");
      }

      if (readiness.missing.length > 0) {
        score += 10;
        reasons.push(`${readiness.score}% client-ready`);
      }

      if (reasons.length === 0) {
        reasons.push("healthy pipeline item");
      }

      return {
        id: estimate.id,
        displayId: estimate.display_id ?? "Estimate",
        title:
          estimate.project_title ||
          estimate.customer_name ||
          "Untitled estimate",
        customer: estimate.customer_name ?? "Unknown customer",
        amount,
        action,
        tone,
        reasons: reasons.slice(0, 3),
        score,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);

  const buildResultsHref = (overrides: {
    status?: string;
    sort?: string;
    q?: string;
    limit?: string | null;
  }) => {
    const params = new URLSearchParams(baseResultsParams);

    if (overrides.status) {
      if (overrides.status === "all") {
        params.delete("status");
      } else {
        params.set("status", overrides.status);
      }
    }

    if (overrides.sort) {
      if (overrides.sort === "needs-attention") {
        params.delete("sort");
      } else {
        params.set("sort", overrides.sort);
      }
    }

    if (overrides.q !== undefined) {
      if (overrides.q) {
        params.set("q", overrides.q);
      } else {
        params.delete("q");
      }
    }

    if (overrides.limit === null) {
      params.delete("limit");
    } else if (overrides.limit) {
      params.set("limit", overrides.limit);
    }

    return `/estimates?${params.toString()}${estimateResultsAnchor}`;
  };

  const filterLinks = [
    {
      label: "All",
      value: "all",
      href: buildResultsHref({ status: "all", limit: null }),
    },
    {
      label: "Draft",
      value: "draft",
      href: buildResultsHref({ status: "draft", limit: null }),
    },
    {
      label: "Sent",
      value: "sent",
      href: buildResultsHref({ status: "sent", limit: null }),
    },
    {
      label: "Approved",
      value: "approved",
      href: buildResultsHref({ status: "approved", limit: null }),
    },
    {
      label: "Converted",
      value: "converted",
      href: buildResultsHref({ status: "converted", limit: null }),
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

        {estimateLoadMessage ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-amber-200">
                  Estimate notice
                </p>

                <p className="mt-2 text-sm leading-6 text-amber-100/90">
                  {estimateLoadMessage}
                </p>
              </div>

              <Link href={`/estimates${businessQuery}${estimateResultsAnchor}`}>
                <Button variant="secondary">Retry</Button>
              </Link>
            </div>
          </Card>
        ) : null}

        {!estimatesLoadFailed ? (
        <Card className="estimate-command-center overflow-hidden border-sky-500/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-slate-950 p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.28em] text-sky-300">
                Estimate Workspace
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                What needs attention next
              </h2>

              <p className="mt-1 max-w-2xl text-sm leading-5 text-zinc-300">
                Drafts, follow-ups, and invoice-ready estimates first.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href={`/estimates/new${businessQuery}`}>
                <Button>New Estimate</Button>
              </Link>

              <Link href={`/invoices${businessQuery}`}>
                <Button variant="secondary">Open Invoices</Button>
              </Link>
            </div>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {estimateHealthCards.map((metric) => (
              <Link
                key={metric.label}
                href={metric.href}
                className="estimate-health-card rounded-2xl border border-zinc-800 bg-black/35 p-3 transition hover:-translate-y-0.5 hover:border-sky-400/60"
                data-tone={metric.tone}
              >
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-zinc-400">
                  {metric.label}
                </p>

                <p className="mt-1 text-xl font-black text-white">
                  {metric.value}
                </p>

                <p className="mt-1 text-xs leading-4 text-zinc-400">
                  {metric.detail}
                </p>
              </Link>
            ))}
          </div>

          {topOpenEstimate ? (
            <div className="estimate-top-open mt-3 flex flex-col gap-3 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-200">
                  Highest Open Proposal
                </p>

                <p className="mt-1 text-base font-bold text-white">
                  {topOpenEstimate.project_title ||
                    topOpenEstimate.display_id ||
                    "Open estimate"}
                </p>

                <p className="mt-1 text-sm text-zinc-300">
                  {topOpenEstimate.customer_name || "Unknown customer"} /{" "}
                  {formatMoney(topOpenEstimate.estimate_amount)}
                </p>
              </div>

              <Link
                href={`/estimates/${topOpenEstimate.id}${businessQuery}`}
                className="rounded-xl bg-sky-500 px-4 py-2 text-center text-sm font-black text-white transition hover:bg-sky-600"
              >
                Review Estimate
              </Link>
            </div>
          ) : null}

          <details className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3">
            <summary className="cursor-pointer text-sm font-black text-zinc-200">
              More estimate signals
            </summary>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
              <div className="grid gap-2 md:grid-cols-2">
                {proposalReadinessCards.map((card) => (
                  <Link
                    key={card.label}
                    href={card.href}
                    data-tone={card.tone}
                    className="estimate-proposal-card rounded-2xl border border-white/10 bg-zinc-950/60 p-3 transition hover:-translate-y-0.5 hover:border-orange-300/60"
                  >
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                      {card.label}
                    </p>

                    <p className="mt-1 line-clamp-1 text-lg font-black text-white">
                      {card.value}
                    </p>

                    <p className="mt-1 text-xs leading-4 text-zinc-400">
                      {card.detail}
                    </p>
                  </Link>
                ))}
              </div>

              <div className="grid gap-2">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="estimate-proof-stat">
                    <span>Email proof</span>
                    <strong>{sentProofCount}</strong>
                  </div>

                  <div className="estimate-proof-stat">
                    <span>Queue-linked</span>
                    <strong>{queueLinkedEstimates.length}</strong>
                  </div>

                  <div className="estimate-proof-stat">
                    <span>Ready to bill</span>
                    <strong>{approvedReadyForInvoice.length}</strong>
                  </div>
                </div>

                {estimateAttentionList.length > 0 ? (
                  estimateAttentionList.map((item) => (
                    <Link
                      key={item.id}
                      href={`/estimates/${item.id}${businessQuery}`}
                      className="estimate-attention-row"
                      data-tone={item.tone}
                    >
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                          {item.displayId}
                        </p>

                        <p className="mt-1 font-black text-white">
                          {item.title}
                        </p>

                        <p className="mt-1 text-sm text-zinc-400">
                          {item.customer} - {formatMoney(item.amount)}
                        </p>
                      </div>

                      <div className="text-left sm:text-right">
                        <p className="text-sm font-black text-white">
                          {item.action}
                        </p>

                        <p className="mt-1 text-xs leading-5 text-zinc-400">
                          {item.reasons.join(" / ")}
                        </p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="estimate-attention-empty rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
                    <p className="text-sm font-black text-emerald-100">
                      No open estimate needs urgent attention.
                    </p>

                    <p className="mt-1 text-sm text-emerald-100/75">
                      The proposal board is clean from the current data.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </details>
        </Card>
        ) : null}

        {!estimatesLoadFailed ? (
        <Card>
          <form
            action={`/estimates${estimateResultsAnchor}`}
            className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]"
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
              <label className="app-form-label mb-2 block text-sm text-zinc-400">
                Search Estimates
              </label>

              <input
                name="q"
                defaultValue={searchTerm}
                placeholder="Search number, project, customer, or status"
                className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div>
              <label className="app-form-label mb-2 block text-sm text-zinc-400">
                Sort
              </label>

              <select
                name="sort"
                defaultValue={sortMode}
                className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              >
                <option value="needs-attention">Needs Attention</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="highest-value">Highest Value</option>
                <option value="estimate-number">Estimate Number</option>
              </select>
            </div>

            <div className="flex items-end gap-3">
              <Button type="submit">Search</Button>

              {(searchTerm || statusFilter !== "all") && (
                <Link href={`/estimates${businessQuery}${estimateResultsAnchor}`}>
                  <Button variant="secondary">
                    Clear
                  </Button>
                </Link>
              )}
            </div>
          </form>
        </Card>
        ) : null}

        {!estimatesLoadFailed ? (
        <div className="workspace-filter-bar flex flex-wrap gap-3 rounded-2xl border border-zinc-800 p-2">
          {filterLinks.map((filter) => (
            <Link
              key={filter.value}
              href={filter.href}
              scroll={false}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                statusFilter === filter.value
                  ? "app-chip-active bg-orange-500 text-black"
                  : "app-chip workspace-filter-link-inactive text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {filter.label}
            </Link>
          ))}
        </div>
        ) : null}

        <div
          id="estimate-results"
          className="estimate-results-anchor scroll-mt-6"
        >
        {estimatesLoadFailed ? (
          <Card className="app-empty-state border-amber-500/40 bg-zinc-950/80">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">
                  Estimates Not Loaded
                </p>

                <h2 className="mt-2 text-2xl font-black text-white">
                  Retry the estimate list
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                  Trimax did not use the zero totals because the estimate list
                  did not load cleanly. Retry the workspace, then sign in again
                  if the notice remains.
                </p>
              </div>

              <Link href={`/estimates${businessQuery}${estimateResultsAnchor}`}>
                <Button className="w-full sm:w-auto">Retry</Button>
              </Link>
            </div>
          </Card>
        ) : estimates.length > 0 ? (
          <div className="estimate-filter-summary flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {filteredEstimates.length} of {estimates.length} estimates
              {searchTerm ? ` matching "${searchTerm}"` : ""}.
            </span>

            <span className="font-bold text-sky-300">
              Filtered value: {formatMoney(filteredEstimateValue)}
            </span>
          </div>
        ) : null}

        {!estimatesLoadFailed && estimates.length === 0 ? (
          <Card className="app-empty-state border-sky-500/40 bg-zinc-950/80">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-zinc-400">
                  Estimate Workspace Ready
                </p>

                <h2 className="mt-2 text-2xl font-black text-white">
                  Start the first proposal
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                  Create a clean estimate from scratch, or open the queue when
                  apartment turn details should carry into the proposal.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href={`/queue${businessQuery}`}>
                  <Button variant="secondary" className="w-full sm:w-auto">
                    Open Queue
                  </Button>
                </Link>

                <Link href={`/estimates/new${businessQuery}`}>
                  <Button className="w-full sm:w-auto">New Estimate</Button>
                </Link>
              </div>
            </div>
          </Card>
        ) : !estimatesLoadFailed && filteredEstimates.length === 0 ? (
          <Card className="app-empty-state border-dashed border-zinc-700 bg-zinc-950/80">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-zinc-400">
                  Filter Check
                </p>

                <h2 className="mt-2 text-2xl font-black text-white">
                  No estimates match this view
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                  Try a broader search, switch back to all estimate statuses, or
                  start a fresh proposal if this is new work.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href={`/estimates${businessQuery}${estimateResultsAnchor}`}>
                  <Button variant="secondary" className="w-full sm:w-auto">
                    Show All Estimates
                  </Button>
                </Link>

                <Link href={`/estimates/new${businessQuery}`}>
                  <Button className="w-full sm:w-auto">New Estimate</Button>
                </Link>
              </div>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3 pb-28">
            {visibleEstimates.map((estimate) => {
              const statusKey = getPipelineStatusKey(estimate);
              const isConverted = statusKey === "converted";
              const isLinkedToInvoice = Boolean(estimate.hasLinkedInvoice);
              const readyToInvoice = statusKey === "approved" && !isLinkedToInvoice;
              const daysSinceSent = getDaysSince(estimate.lastSentAt);
              const daysSinceUpdate = getDaysSince(
                getEstimateFreshnessDate(estimate)
              );
              const readiness = getEstimateReadiness(estimate);
              const hasMissingReadiness = readiness.missing.length > 0;
              const isSendableDraft =
                statusKey === "draft" &&
                !isLinkedToInvoice &&
                !isConverted &&
                !hasMissingReadiness;
              const nextActionLabel =
                isLinkedToInvoice
                  ? {
                      label: "Invoice connected",
                      tone: "success",
                    }
                  : isConverted
                    ? {
                        label: "No action required",
                        tone: "success",
                      }
                  : readyToInvoice
                    ? {
                        label: "Create invoice",
                        tone: "success",
                      }
                    : statusKey === "sent"
                      ? {
                          label:
                            daysSinceSent !== null && daysSinceSent >= 3
                              ? "Follow up"
                              : "Awaiting approval",
                          tone:
                            daysSinceSent !== null && daysSinceSent >= 3
                              ? "warning"
                              : "info",
                        }
                    : statusKey === "draft"
                      ? {
                          label: hasMissingReadiness
                            ? `Missing ${readiness.missing.slice(0, 2).join(" and ")}`
                            : "Ready to send",
                          tone: "warning",
                        }
                      : {
                          label: "Review status",
                          tone: "info",
                        };
              const estimateLabel =
                estimate.display_id ||
                estimate.project_title ||
                estimate.customer_name ||
                "Estimate";
              const primaryAction = isLinkedToInvoice && estimate.linkedInvoiceId
                ? {
                    label: "Open Invoice",
                    href: `/invoices/${estimate.linkedInvoiceId}${businessQuery}`,
                  }
                : readyToInvoice
                  ? {
                      label: "Create Invoice",
                      href: `/estimates/${estimate.id}${businessQuery}`,
                    }
                  : isSendableDraft
                    ? {
                        label: "Send",
                        href: `/estimates/${estimate.id}${businessQuery}#send-estimate`,
                      }
                    : statusKey === "draft"
                      ? {
                          label: "Edit",
                          href: `/estimates/${estimate.id}/edit${businessQuery}`,
                        }
                      : {
                          label: "Open",
                          href: `/estimates/${estimate.id}${businessQuery}`,
                        };
              const proofLabel = (estimate.sentCount ?? 0) > 0
                ? `${estimate.sentCount} send proof${
                    estimate.sentCount === 1 ? "" : "s"
                  }`
                : "No send proof";
              const touchedLabel =
                daysSinceUpdate !== null
                  ? `Touched ${formatDaysLabel(daysSinceUpdate).toLowerCase()}`
                  : "No activity date";
              const invoiceLabel =
                estimate.linkedInvoiceDisplayId ??
                (estimate.linkedInvoiceId ? "Invoice" : null);

              return (
                <Card
                  key={estimate.id}
                  className="estimate-list-card p-3 transition hover:border-orange-500/60 hover:bg-zinc-800 sm:p-4"
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-orange-300">
                          {estimate.display_id ?? "Estimate"}
                        </p>

                        <StatusBadge
                          status={getAuthoritativeStatusLabel(estimate)}
                        />

                        <span
                          className="rounded-full border px-2 py-0.5 text-xs font-bold"
                          data-tone={nextActionLabel.tone}
                        >
                          {nextActionLabel.label}
                        </span>
                      </div>

                      <h2 className="mt-1 truncate text-base font-black text-white sm:text-lg">
                        {estimate.project_title || "Untitled Estimate"}
                      </h2>

                      <p className="mt-0.5 truncate text-sm text-zinc-400">
                        {estimate.customer_name || "Unknown Customer"}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-zinc-400">
                        <span>{estimate.queue_item_id ? "Queue-linked" : "No queue link"}</span>
                        <span>{proofLabel}</span>
                        <span>{touchedLabel}</span>
                        {invoiceLabel ? (
                          <span>
                            Invoice {invoiceLabel}
                            {estimate.linkedInvoiceStatus
                              ? ` / ${estimate.linkedInvoiceStatus}`
                              : ""}
                          </span>
                        ) : null}
                        {hasMissingReadiness && !isLinkedToInvoice && !isConverted ? (
                          <span className="text-amber-200">
                            Add {readiness.missing.join(", ")}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[auto_auto] sm:items-center lg:text-right">
                      <p className="text-lg font-black text-orange-300">
                        {formatMoney(estimate.estimate_amount)}
                      </p>

                      <Link
                        href={primaryAction.href}
                        className="rounded-xl bg-blue-600 px-4 py-2 text-center text-sm font-bold text-white transition hover:bg-blue-700"
                      >
                        {primaryAction.label}
                      </Link>
                    </div>
                  </div>

                  <details className="mt-2 text-sm text-zinc-400">
                    <summary className="cursor-pointer font-semibold text-zinc-300">
                      Secondary actions
                    </summary>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link
                        href={`/estimates/${estimate.id}${businessQuery}`}
                        className="app-button-secondary rounded-xl bg-zinc-800 px-3 py-2 text-sm font-bold text-white transition hover:bg-zinc-700"
                      >
                        Open Estimate
                      </Link>

                      <Link
                        href={`/estimates/${estimate.id}/print${businessQuery}`}
                        className="app-button-secondary rounded-xl bg-zinc-800 px-3 py-2 text-sm font-bold text-white transition hover:bg-zinc-700"
                      >
                        Print
                      </Link>

                      {!isLinkedToInvoice && !isConverted ? (
                        <Link
                          href={`/estimates/${estimate.id}/edit${businessQuery}`}
                          className="app-button-secondary rounded-xl bg-zinc-800 px-3 py-2 text-sm font-bold text-white transition hover:bg-zinc-700"
                        >
                          Edit
                        </Link>
                      ) : null}

                      {!isLinkedToInvoice && !isConverted ? (
                        <DeleteEstimateButton
                          estimateId={estimate.id}
                          businessId={estimate.business_id}
                          estimateLabel={estimateLabel}
                        />
                      ) : null}
                    </div>
                  </details>
                </Card>
              );
            })}

            {hasMoreEstimates ? (
              <div className="flex justify-center pt-2">
                <Link href={loadMoreHref} scroll={false}>
                  <Button variant="secondary">
                    Load More Estimates
                  </Button>
                </Link>
              </div>
            ) : null}
                  </div>
        )}
        </div>
      </div>
    </AppShell>
  );
}
