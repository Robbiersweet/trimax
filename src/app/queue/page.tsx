import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import PriorityPlanner, {
  type PriorityPlannerItem,
} from "../components/PriorityPlanner";
import StatusBadge from "../components/StatusBadge";
import RoleVisible from "../components/RoleVisible";
import Toast from "../components/Toast";
import {
  queueTimingBadge,
  queueTimingTone,
} from "../lib/queueTiming";
import { supabase } from "../lib/supabase";
import {
  queueTbdDecisions,
  tbdDisplay,
} from "../lib/tbd";
import { maybeCanonicalApartmentUnitLabel } from "../utils/unitLabels";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type QueueItemWithEstimate = {
  id: string;
  created_at: string | null;
  property: string | null;
  unit: string | null;
  status: string | null;
  priority: string | null;
  priority_order: number | null;
  paint_type: string | null;
  unit_layout: string | null;
  wall_paint_color: string | null;
  flooring: string | null;
  move_out_date: string | null;
  ready_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  projected_completion_date: string | null;
  progress_stage: string | null;
  percent_complete: number | null;
  delay_reason: string | null;
  manager_update: string | null;
  manager_update_at: string | null;
  updated_at?: string | null;
  smoked_in: boolean | null;
  prior_renovation: boolean | null;
  prior_renovation_details: string | null;
  renovation_needed: boolean | null;
  renovation_needed_details: string | null;
  notes: string | null;
  linked_estimate_id: string | null;
};

type LinkedEstimate = {
  id: string;
  display_id: string | null;
};

type LinkedInvoice = {
  id: string;
  estimate_id: string | null;
  display_id: string | null;
  status: string | null;
  amount_paid: string | number | null;
  invoice_amount: string | number | null;
};

type InvoiceSendProof = {
  entity_id: string | null;
};

type QueueJobSession = {
  id: string;
  queue_item_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  total_minutes: number | null;
};

type QueueJobSessionBreakdown = {
  id: string;
  job_session_id: string;
};

function normalizeStatus(value: string | null) {
  return (value || "Pending Estimate").trim().toLowerCase();
}

function propertyKey(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function statusLabel(value: string) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function dateValue(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function isReadySoonUnscheduled(item: QueueItemWithEstimate) {
  const readyDate = dateValue(item.ready_date);

  if (!readyDate) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(today.getDate() + 7);

  const status = normalizeStatus(item.status);

  return (
    readyDate >= today &&
    readyDate <= sevenDaysFromNow &&
    !item.scheduled_date &&
    status !== "scheduled" &&
    status !== "completed"
  );
}

function isRemediationItem(item: QueueItemWithEstimate) {
  return (
    Boolean(item.smoked_in) ||
    (item.notes || "").toLowerCase().includes("smok")
  );
}

function needsEstimate(item: QueueItemWithEstimate) {
  const status = normalizeStatus(item.status);

  return (
    !item.linked_estimate_id &&
    !["completed", "invoiced", "paid"].includes(status)
  );
}

function priorityOrderValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.POSITIVE_INFINITY;
}

function deadlineSortValue(value: string | null) {
  const date = dateValue(value);

  return date ? date.getTime() : Number.POSITIVE_INFINITY;
}

function createdAtSortValue(value: string | null | undefined) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? Number.POSITIVE_INFINITY
    : date.getTime();
}

function statusSortValue(value: string | null) {
  const status = normalizeStatus(value);
  const order: Record<string, number> = {
    "pending estimate": 1,
    "estimate created": 2,
    scheduled: 3,
    "on hold": 4,
    completed: 5,
    invoiced: 6,
    paid: 7,
  };

  return order[status] ?? 50;
}

function compareQueueItems(
  first: QueueItemWithEstimate,
  second: QueueItemWithEstimate,
  sortMode: string
) {
  const fallback = first.id.localeCompare(second.id);

  if (sortMode === "priority") {
    return (
      priorityOrderValue(first.priority_order) -
        priorityOrderValue(second.priority_order) ||
      deadlineSortValue(first.ready_date) - deadlineSortValue(second.ready_date) ||
      createdAtSortValue(first.created_at) - createdAtSortValue(second.created_at) ||
      fallback
    );
  }

  if (sortMode === "status") {
    return (
      statusSortValue(first.status) - statusSortValue(second.status) ||
      deadlineSortValue(first.ready_date) - deadlineSortValue(second.ready_date) ||
      priorityOrderValue(first.priority_order) -
        priorityOrderValue(second.priority_order) ||
      createdAtSortValue(first.created_at) - createdAtSortValue(second.created_at) ||
      fallback
    );
  }

  return (
    priorityOrderValue(first.priority_order) -
      priorityOrderValue(second.priority_order) ||
    deadlineSortValue(first.ready_date) - deadlineSortValue(second.ready_date) ||
    createdAtSortValue(first.created_at) - createdAtSortValue(second.created_at) ||
    statusSortValue(first.status) - statusSortValue(second.status) ||
    fallback
  );
}

function isClosedQueueItem(item: QueueItemWithEstimate) {
  const status = normalizeStatus(item.status);

  return (
    status === "completed" ||
    status === "invoiced" ||
    status === "paid" ||
    Boolean(item.completed_date)
  );
}

function daysUntil(value: string | null) {
  const date = dateValue(value);

  if (!date) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dateMatchesOffset(value: string | null, offsetDays: number) {
  const date = dateValue(value);

  if (!date) {
    return false;
  }

  const target = new Date();
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + offsetDays);

  return localDateKey(date) === localDateKey(target);
}

function isOverdueQueueItem(item: QueueItemWithEstimate) {
  const dueDays = daysUntil(item.ready_date);

  return !isClosedQueueItem(item) && dueDays !== null && dueDays < 0;
}

function isDueTodayQueueItem(item: QueueItemWithEstimate) {
  return !isClosedQueueItem(item) && dateMatchesOffset(item.ready_date, 0);
}

function isDueTomorrowQueueItem(item: QueueItemWithEstimate) {
  return !isClosedQueueItem(item) && dateMatchesOffset(item.ready_date, 1);
}

function isScheduledTodayQueueItem(item: QueueItemWithEstimate) {
  return !isClosedQueueItem(item) && dateMatchesOffset(item.scheduled_date, 0);
}

function queueItemLabel(item: QueueItemWithEstimate) {
  const unit = maybeCanonicalApartmentUnitLabel(item.unit);

  return [unit, item.property].filter(Boolean).join(" / ") || "Queue item";
}

function minutesBetween(startedAt: string | null, endedAt: string | null) {
  if (!startedAt) {
    return 0;
  }

  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }

  return Math.round((end - start) / 60000);
}

function formatSessionMinutes(minutes: number) {
  if (minutes <= 0) {
    return "0m";
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours <= 0) {
    return `${remainder}m`;
  }

  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatQueueDateTime(value: string | null) {
  if (!value) {
    return "not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "not recorded";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function moneyNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isInvoicePaid(invoice: LinkedInvoice | null | undefined) {
  if (!invoice) {
    return false;
  }

  const status = normalizeStatus(invoice.status);
  const invoiceAmount = moneyNumber(invoice.invoice_amount);
  const amountPaid = moneyNumber(invoice.amount_paid);

  return status === "paid" || (invoiceAmount > 0 && amountPaid >= invoiceAmount);
}

function queueHref(
  businessSlug: string,
  options?: {
    property?: string;
    q?: string;
    status?: string;
    view?: string;
    sort?: string;
  }
) {
  const params = new URLSearchParams({
    business: businessSlug,
  });

  if (options?.property && options.property !== "all") {
    params.set("property", options.property);
  }

  if (options?.q) {
    params.set("q", options.q);
  }

  if (options?.status && options.status !== "all") {
    params.set("status", options.status);
  }

  if (options?.view && options.view !== "all") {
    params.set("view", options.view);
  }

  if (options?.sort && options.sort !== "deadline") {
    params.set("sort", options.sort);
  }

  return `/queue?${params.toString()}#queue-results`;
}

function viewCopy(view: string) {
  if (view === "ready-soon") {
    return {
      title: "R&L Start Soon",
      detail:
        "Unscheduled units with a property deadline in the next 7 days.",
    };
  }

  if (view === "needs-estimate") {
    return {
      title: "Needs Estimate",
      detail:
        "Queue items without linked estimates that still need review.",
    };
  }

  if (view === "remediation") {
    return {
      title: "Remediation",
      detail:
        "Items flagged for smoker/remediation work or smoke notes.",
    };
  }

  if (view === "history") {
    return {
      title: "All History",
      detail:
        "Active and completed queue records saved for reporting and unit history.",
    };
  }

  if (view === "priority-planner") {
    return {
      title: "Priority Planner",
      detail:
        "Reorder active queue items for the selected property using manager requested priority.",
    };
  }

  return {
    title: "Active Work",
    detail:
      "Open queue items that still need estimate, scheduling, invoice, or completion attention.",
  };
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    property?: string;
    q?: string;
    status?: string;
    view?: string;
    sort?: string;
    completed?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const showCompletedToast = resolvedSearchParams.completed === "1";
  const propertyFilter =
    resolvedSearchParams.property?.trim().toLowerCase() ?? "all";
  const searchTerm = resolvedSearchParams.q?.trim() ?? "";
  const statusFilter =
    resolvedSearchParams.status?.trim().toLowerCase() ?? "all";
  const viewFilter =
    resolvedSearchParams.view?.trim().toLowerCase() ?? "all";
  const requestedSortMode =
    resolvedSearchParams.sort?.trim().toLowerCase() ?? "priority";
  const sortMode = ["deadline", "priority", "status"].includes(
    requestedSortMode
  )
    ? requestedSortMode
    : "deadline";
  const businessQuery =
    propertyFilter === "all"
      ? `?business=${businessSlug}`
      : `?business=${businessSlug}&property=${propertyFilter}`;
  const activeView = viewCopy(viewFilter);

  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  let queueLoadMessage = businessError
    ? "Workspace details could not be loaded. Try signing in again, then reopen this workspace."
    : null;

  if (businessError) {
    console.warn("Queue workspace lookup failed:", businessError.message);
  }

  const selectedBusiness = businessData as Business | null;

  let queueItems: QueueItemWithEstimate[] = [];
  let jobSessions: QueueJobSession[] = [];
  let jobSessionBreakdowns: QueueJobSessionBreakdown[] = [];

  if (selectedBusiness?.id) {
    const [
      initialQueueResponse,
      jobSessionResponse,
      jobBreakdownResponse,
    ] = await Promise.all([
        supabase
          .from("queue_items")
          .select(
            "id, created_at, property, unit, status, priority, priority_order, paint_type, unit_layout, wall_paint_color, flooring, move_out_date, ready_date, scheduled_date, completed_date, projected_completion_date, progress_stage, percent_complete, delay_reason, manager_update, manager_update_at, updated_at, smoked_in, prior_renovation, prior_renovation_details, renovation_needed, renovation_needed_details, notes, linked_estimate_id"
          )
          .eq("business_id", selectedBusiness.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("job_sessions")
          .select("id, queue_item_id, started_at, ended_at, total_minutes")
          .eq("business_id", selectedBusiness.id),
        supabase
          .from("job_session_breakdowns")
          .select("id, job_session_id")
          .eq("business_id", selectedBusiness.id),
      ]);
    let queueData = initialQueueResponse.data;
    let queueError = initialQueueResponse.error;

    if (
      queueError?.message?.includes("priority_order") ||
      queueError?.message?.includes("projected_completion_date") ||
      queueError?.message?.includes("progress_stage") ||
      queueError?.message?.includes("percent_complete") ||
      queueError?.message?.includes("delay_reason") ||
      queueError?.message?.includes("manager_update") ||
      queueError?.message?.includes("updated_at")
    ) {
      const retry = await supabase
        .from("queue_items")
        .select(
          "id, created_at, property, unit, status, priority, paint_type, unit_layout, wall_paint_color, flooring, move_out_date, ready_date, scheduled_date, completed_date, smoked_in, prior_renovation, prior_renovation_details, renovation_needed, renovation_needed_details, notes, linked_estimate_id"
        )
        .eq("business_id", selectedBusiness.id)
        .order("created_at", { ascending: false });

      queueData = retry.data as typeof queueData;
      queueError = retry.error;
    }

    if (queueError) {
      console.warn("Queue items could not be loaded:", queueError.message);
      queueLoadMessage =
        "Queue items could not be loaded. Try signing in again; if this stays here, the queue access settings need attention.";
    }

    if (jobSessionResponse.error) {
      console.warn(
        "Queue job sessions could not be loaded:",
        jobSessionResponse.error.message
      );
    }

    if (jobBreakdownResponse.error) {
      console.warn(
        "Queue job session breakdowns could not be loaded:",
        jobBreakdownResponse.error.message
      );
    }

    queueItems = (queueData ?? []) as QueueItemWithEstimate[];
    jobSessions = (jobSessionResponse.data ?? []) as QueueJobSession[];
    jobSessionBreakdowns =
      (jobBreakdownResponse.data ?? []) as QueueJobSessionBreakdown[];
  }

  const linkedEstimateIds = queueItems
    .map((item) => item.linked_estimate_id)
    .filter((id): id is string => Boolean(id));

  let linkedEstimates: LinkedEstimate[] = [];
  let linkedInvoices: LinkedInvoice[] = [];
  let invoiceSendProofs: InvoiceSendProof[] = [];

  if (linkedEstimateIds.length > 0) {
    const { data } = await supabase
      .from("estimates")
      .select("id, display_id")
      .in("id", linkedEstimateIds);

    linkedEstimates = data ?? [];

    const { data: invoiceData, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, estimate_id, display_id, status, amount_paid, invoice_amount")
      .in("estimate_id", linkedEstimateIds)
      .order("created_at", { ascending: false });

    if (invoiceError) {
      console.warn("Queue linked invoices could not be loaded:", invoiceError.message);
    }

    linkedInvoices = (invoiceData ?? []) as LinkedInvoice[];

    const linkedInvoiceIds = linkedInvoices.map((invoice) => invoice.id);

    if (linkedInvoiceIds.length > 0) {
      const { data: sendProofData, error: sendProofError } = await supabase
        .from("activity_logs")
        .select("entity_id")
        .eq("business_id", selectedBusiness?.id)
        .eq("entity_type", "invoice")
        .in("entity_id", linkedInvoiceIds)
        .in("action", [
          "invoice.email_sent",
          "invoice.split_group_email_sent",
        ]);

      if (sendProofError) {
        console.warn(
          "Queue invoice send proof could not be loaded:",
          sendProofError.message
        );
      }

      invoiceSendProofs = (sendProofData ?? []) as InvoiceSendProof[];
    }
  }

  const estimateById = new Map(
    linkedEstimates.map((estimate) => [estimate.id, estimate])
  );
  const invoiceByEstimateId = new Map<string, LinkedInvoice>();

  linkedInvoices.forEach((invoice) => {
    if (invoice.estimate_id && !invoiceByEstimateId.has(invoice.estimate_id)) {
      invoiceByEstimateId.set(invoice.estimate_id, invoice);
    }
  });

  const invoiceIdsWithSendProof = new Set(
    invoiceSendProofs
      .map((proof) => proof.entity_id)
      .filter((id): id is string => Boolean(id))
  );
  const breakdownSessionIds = new Set(
    jobSessionBreakdowns.map((breakdown) => breakdown.job_session_id)
  );
  const sessionsByQueueItemId = jobSessions.reduce((map, session) => {
    if (!session.queue_item_id) {
      return map;
    }

    const current = map.get(session.queue_item_id) ?? [];
    current.push(session);
    map.set(session.queue_item_id, current);

    return map;
  }, new Map<string, QueueJobSession[]>());

  const propertyScopedQueueItems = queueItems.filter((item) => {
    if (propertyFilter === "all") {
      return true;
    }

    return propertyKey(item.property) === propertyFilter;
  });
  const activePropertyLabel =
    propertyFilter === "all"
      ? "all properties"
      : propertyScopedQueueItems[0]?.property ?? "selected property";
  const propertyPlannerOptions = Array.from(
    new Map(
      queueItems
        .map((item) => item.property?.trim())
        .filter((property): property is string => Boolean(property))
        .map((property) => [propertyKey(property), property])
    ).entries()
  ).sort((first, second) => first[1].localeCompare(second[1]));

  const statuses = Array.from(
    new Set(
      propertyScopedQueueItems.map((item) =>
        normalizeStatus(item.status)
      )
    )
  ).sort((first, second) => first.localeCompare(second));

  const statusCounts = propertyScopedQueueItems.reduce(
    (counts, item) => {
      const status = normalizeStatus(item.status);
      counts.set(status, (counts.get(status) ?? 0) + 1);
      return counts;
    },
    new Map<string, number>()
  );

  const readySoonCount = propertyScopedQueueItems.filter(
    isReadySoonUnscheduled
  ).length;
  const remediationCount = propertyScopedQueueItems.filter(
    (item) => !isClosedQueueItem(item) && isRemediationItem(item)
  ).length;
  const needsEstimateCount =
    propertyScopedQueueItems.filter(needsEstimate).length;
  const activeWorkCount = propertyScopedQueueItems.filter(
    (item) => !isClosedQueueItem(item)
  ).length;
  const propertyScopedQueueItemIds = new Set(
    propertyScopedQueueItems.map((item) => item.id)
  );
  const unscheduledActiveCount = propertyScopedQueueItems.filter(
    (item) => !isClosedQueueItem(item) && !item.scheduled_date
  ).length;
  const overdueUnscheduledCount = propertyScopedQueueItems.filter((item) => {
    const dueDays = daysUntil(item.ready_date);

    return (
      !isClosedQueueItem(item) &&
      !item.scheduled_date &&
      dueDays !== null &&
      dueDays < 0
    );
  }).length;
  const overdueItems = propertyScopedQueueItems.filter(isOverdueQueueItem);
  const dueTodayItems = propertyScopedQueueItems.filter(isDueTodayQueueItem);
  const dueTomorrowItems =
    propertyScopedQueueItems.filter(isDueTomorrowQueueItem);
  const managerPriorityItems = propertyScopedQueueItems
    .filter(
      (item) =>
        !isClosedQueueItem(item) &&
        typeof item.priority_order === "number" &&
        Number.isFinite(item.priority_order)
    )
    .sort((first, second) => compareQueueItems(first, second, "priority"));
  const priorityPlannerItems = propertyScopedQueueItems
    .filter((item) => !isClosedQueueItem(item))
    .sort((first, second) => compareQueueItems(first, second, "priority"))
    .map(
      (item): PriorityPlannerItem => ({
        id: item.id,
        property: item.property,
        unit: item.unit,
        priority_order: item.priority_order,
        ready_date: item.ready_date,
        move_out_date: item.move_out_date,
        status: item.status,
        paint_type: item.paint_type,
        notes: item.notes,
        created_at: item.created_at,
      })
    );
  const scheduledTodayItems = propertyScopedQueueItems.filter(
    isScheduledTodayQueueItem
  );
  const waitingEtaItems = propertyScopedQueueItems.filter(
    (item) => !isClosedQueueItem(item) && !item.projected_completion_date
  );
  const delayedItems = propertyScopedQueueItems.filter(
    (item) => !isClosedQueueItem(item) && Boolean(item.delay_reason)
  );
  const scheduledWithoutEtaItems = scheduledTodayItems.filter(
    (item) => !item.projected_completion_date
  );
  const activeSessionCount = jobSessions.filter(
    (session) =>
      !session.ended_at &&
      typeof session.queue_item_id === "string" &&
      propertyScopedQueueItemIds.has(session.queue_item_id)
  ).length;
  const missingBreakdownCount = jobSessions.filter(
    (session) =>
      Boolean(session.ended_at) &&
      typeof session.queue_item_id === "string" &&
      propertyScopedQueueItemIds.has(session.queue_item_id) &&
      !breakdownSessionIds.has(session.id)
  ).length;
  const queueDispatchCards = [
    {
      label: "In Progress",
      value: activeSessionCount,
      detail:
        activeSessionCount > 0
          ? "Field sessions currently running."
          : "No active labor sessions right now.",
      tone: activeSessionCount > 0 ? "emerald" : "zinc",
      href: queueHref(businessSlug, { property: propertyFilter }),
    },
    {
      label: "Unscheduled",
      value: unscheduledActiveCount,
      detail:
        unscheduledActiveCount > 0
          ? "Open work still needs a date."
          : "Open work has schedule coverage.",
      tone: unscheduledActiveCount > 0 ? "amber" : "emerald",
      href: queueHref(businessSlug, { property: propertyFilter }),
    },
    {
      label: "Past Due",
      value: overdueUnscheduledCount,
      detail:
        overdueUnscheduledCount > 0
          ? "Due dates have passed without a scheduled date."
          : "No unscheduled past-due work visible.",
      tone: overdueUnscheduledCount > 0 ? "rose" : "emerald",
      href: queueHref(businessSlug, {
        property: propertyFilter,
        view: "ready-soon",
      }),
    },
    {
      label: "Labor Proof",
      value: missingBreakdownCount,
      detail:
        missingBreakdownCount > 0
          ? "Completed sessions need time breakdowns."
          : "Completed labor looks accounted for.",
      tone: missingBreakdownCount > 0 ? "violet" : "zinc",
      href: `/job-sessions?business=${businessSlug}`,
    },
  ];
  const waitingInvoiceCount = propertyScopedQueueItems.filter((item) => {
    if (!item.linked_estimate_id || isClosedQueueItem(item)) {
      return false;
    }

    return !invoiceByEstimateId.has(item.linked_estimate_id);
  }).length;
  const completedTodayCount = propertyScopedQueueItems.filter((item) =>
    dateMatchesOffset(item.completed_date, 0)
  ).length;
  const inProgressQueueItemCount = propertyScopedQueueItems.filter((item) => {
    const progress = (item.progress_stage || "").trim().toLowerCase();

    return (
      !isClosedQueueItem(item) &&
      progress &&
      !["not started", "complete", "completed"].includes(progress)
    );
  }).length;
  const workloadMetrics = [
    {
      label: "Pending",
      value: statusCounts.get("pending estimate") ?? 0,
    },
    {
      label: "Scheduled",
      value: statusCounts.get("scheduled") ?? 0,
    },
    {
      label: "In Progress",
      value: Math.max(activeSessionCount, inProgressQueueItemCount),
    },
    {
      label: "Waiting Estimate",
      value: needsEstimateCount,
    },
    {
      label: "Waiting Invoice",
      value: waitingInvoiceCount,
    },
    {
      label: "Completed Today",
      value: completedTodayCount,
    },
  ];
  const renoGroups = propertyScopedQueueItems.reduce((groups, item) => {
    if (
      isClosedQueueItem(item) ||
      !(item.paint_type || "").toLowerCase().includes("reno")
    ) {
      return groups;
    }

    const key = item.property || "Unknown property";
    groups.set(key, (groups.get(key) ?? 0) + 1);
    return groups;
  }, new Map<string, number>());
  const groupedRenoCount = Array.from(renoGroups.values()).filter(
    (count) => count >= 2
  ).length;
  const completedNeedsEstimateCount = propertyScopedQueueItems.filter(
    (item) => Boolean(item.completed_date) && !item.linked_estimate_id
  ).length;
  const managerPrioritiesDueTomorrow = managerPriorityItems.filter(
    isDueTomorrowQueueItem
  ).length;
  const smartSuggestions = [
    overdueItems.length > 0
      ? `${overdueItems.length} unit${
          overdueItems.length === 1 ? " is" : "s are"
        } overdue.`
      : null,
    managerPrioritiesDueTomorrow > 0
      ? `${managerPrioritiesDueTomorrow} manager priority unit${
          managerPrioritiesDueTomorrow === 1 ? " is" : "s are"
        } due tomorrow.`
      : null,
    scheduledWithoutEtaItems.length > 0
      ? `${scheduledWithoutEtaItems.length} scheduled unit${
          scheduledWithoutEtaItems.length === 1 ? " has" : "s have"
        } no ETA.`
      : null,
    groupedRenoCount > 0
      ? "Several Reno units could be grouped by property."
      : null,
    completedNeedsEstimateCount > 0
      ? `Estimate has not been created for ${completedNeedsEstimateCount} completed queue item${
          completedNeedsEstimateCount === 1 ? "" : "s"
        }.`
      : null,
  ].filter((suggestion): suggestion is string => Boolean(suggestion));

  const filteredQueueItems = propertyScopedQueueItems.filter((item) => {
    if (
      viewFilter !== "history" &&
      statusFilter === "all" &&
      isClosedQueueItem(item)
    ) {
      return false;
    }

    if (
      statusFilter !== "all" &&
      normalizeStatus(item.status) !== statusFilter
    ) {
      return false;
    }

    if (viewFilter === "ready-soon" && !isReadySoonUnscheduled(item)) {
      return false;
    }

    if (viewFilter === "remediation" && !isRemediationItem(item)) {
      return false;
    }

    if (viewFilter === "needs-estimate" && !needsEstimate(item)) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    const searchableText = [
      item.property,
      item.unit,
      maybeCanonicalApartmentUnitLabel(item.unit),
      item.status,
      item.priority,
      item.paint_type,
      item.unit_layout,
      item.wall_paint_color,
      item.flooring,
      item.move_out_date,
      item.ready_date,
      item.scheduled_date,
      item.completed_date,
      item.prior_renovation_details,
      item.renovation_needed_details,
      item.renovation_needed ? "renovation needed" : "",
      item.prior_renovation ? "prior renovation" : "",
      item.notes,
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(searchTerm.toLowerCase());
  });
  const displayQueueItems = [...filteredQueueItems].sort((first, second) =>
    compareQueueItems(first, second, sortMode)
  );
  const sortLinks = [
    { label: "Sort by Requested Priority", value: "priority" },
    { label: "Sort by Deadline", value: "deadline" },
    { label: "Sort by Status", value: "status" },
  ];

  const statusLinks = [
    {
      label: "All",
      value: "all",
      icon: "A",
      count:
        viewFilter === "history"
          ? propertyScopedQueueItems.length
          : activeWorkCount,
    },
    ...statuses.map((status) => ({
      label: statusLabel(status),
      value: status,
      icon: queueFilterIcon(statusLabel(status)),
      count: statusCounts.get(status) ?? 0,
    })),
  ];

  const specialViewLinks = [
    {
      label: "Active Work",
      value: "all",
      icon: "W",
      count: activeWorkCount,
    },
    {
      label: "Due Soon",
      value: "ready-soon",
      icon: "D",
      count: readySoonCount,
    },
    {
      label: "Needs Estimate",
      value: "needs-estimate",
      icon: "E",
      count: needsEstimateCount,
    },
    {
      label: "Remediation",
      value: "remediation",
      icon: "R",
      count: remediationCount,
    },
    {
      label: "Priority Planner",
      value: "priority-planner",
      icon: "P",
      count: priorityPlannerItems.length,
    },
    {
      label: "All History",
      value: "history",
      icon: "H",
      count: propertyScopedQueueItems.length,
    },
  ];

  return (
    <AppShell>
      {showCompletedToast ? (
        <Toast
          type="success"
          message="Work marked complete. If the invoice has been sent, this item is ready to leave the Active Queue."
        />
      ) : null}
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-3 text-5xl font-bold">Work Queue</h1>

            <p className="mt-3 text-zinc-400">
              Showing queue items for{" "}
              {selectedBusiness?.name ?? "selected business"}
              {propertyFilter === "all"
                ? "."
                : ` / ${activePropertyLabel}.`}
            </p>
          </div>

          <RoleVisible
            businessSlug={businessSlug}
            allow={["owner", "admin", "property_manager"]}
          >
            <Link href={`/new-request${businessQuery}`}>
              <Button>+ New Queue Item</Button>
            </Link>
          </RoleVisible>
        </div>

        <Card className="queue-compass border-cyan-500/20 bg-zinc-950/70 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.22em]">
                Queue Compass
              </p>
              <h2 className="mt-1 text-xl font-black text-white">
                {activeView.title} for {activePropertyLabel}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-300">
                {activeView.detail}
              </p>
            </div>

            <Link
              href={queueHref(businessSlug, {
                property: propertyFilter,
                view: "ready-soon",
              })}
              className="queue-compass-action rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm font-black text-amber-100 transition hover:-translate-y-0.5 hover:border-amber-200"
            >
              Review due-soon work
            </Link>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Active Work",
                value: activeWorkCount,
                detail: "Open queue items",
                href: queueHref(businessSlug, { property: propertyFilter }),
                tone: "sky",
              },
              {
                label: "Needs Estimate",
                value: needsEstimateCount,
                detail: "Pricing blockers",
                href: queueHref(businessSlug, {
                  property: propertyFilter,
                  view: "needs-estimate",
                }),
                tone: "violet",
              },
              {
                label: "Ready Soon",
                value: readySoonCount,
                detail: "Needs schedule attention",
                href: queueHref(businessSlug, {
                  property: propertyFilter,
                  view: "ready-soon",
                }),
                tone: "amber",
              },
              {
                label: "Remediation",
                value: remediationCount,
                detail: "Smoke or special work",
                href: queueHref(businessSlug, {
                  property: propertyFilter,
                  view: "remediation",
                }),
                tone: "rose",
              },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                data-tone={item.tone}
                className="queue-compass-card rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/60"
              >
                <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">
                  {item.label}
                </p>
                <p className="mt-2 text-3xl font-black text-white">
                  {item.value}
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-300">
                  {item.detail}
                </p>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="queue-dispatch-radar border-emerald-500/20 bg-zinc-950/70 p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.22em]">
                Dispatch Radar
              </p>
              <h2 className="mt-1 text-xl font-black text-white">
                Workload pressure at a glance
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-300">
                Trimax is watching schedule gaps, overdue work, active field
                sessions, and missing labor proof from the same queue data.
              </p>
            </div>

            <Link
              href={`/job-sessions?business=${businessSlug}`}
              className="queue-dispatch-action rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-100 transition hover:-translate-y-0.5 hover:border-emerald-200"
            >
              Review labor proof
            </Link>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {queueDispatchCards.map((card) => (
              <Link
                key={card.label}
                href={card.href}
                data-tone={card.tone}
                className="queue-dispatch-radar-card rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:-translate-y-0.5"
              >
                <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">
                  {card.label}
                </p>
                <p className="mt-2 text-3xl font-black text-white">
                  {card.value}
                </p>
                <p className="mt-1 text-sm font-semibold leading-5 text-zinc-300">
                  {card.detail}
                </p>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="queue-operations-summary border-cyan-500/20 bg-cyan-500/10 p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.22em]">
                Operations Summary
              </p>
              <h2 className="mt-1 text-xl font-black text-white">
                What deserves attention right now
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-300">
                Trimax is reading deadlines, requested priority, schedule,
                progress, and lifecycle status from the current queue.
              </p>
            </div>

            <p className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-sm font-bold text-cyan-100">
              {activePropertyLabel}
            </p>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_1.1fr_0.85fr]">
            <div className="grid gap-3">
              <OperationsMetricCard
                label="Needs Attention"
                items={[
                  {
                    label: "Overdue units",
                    value: overdueItems.length,
                    tone: overdueItems.length > 0 ? "rose" : "emerald",
                  },
                  {
                    label: "Due today",
                    value: dueTodayItems.length,
                    tone: dueTodayItems.length > 0 ? "amber" : "zinc",
                  },
                  {
                    label: "Due tomorrow",
                    value: dueTomorrowItems.length,
                    tone: dueTomorrowItems.length > 0 ? "sky" : "zinc",
                  },
                ]}
              />

              <OperationsMetricCard
                label="Operations"
                items={[
                  {
                    label: "Scheduled today",
                    value: scheduledTodayItems.length,
                    tone: scheduledTodayItems.length > 0 ? "emerald" : "zinc",
                  },
                  {
                    label: "Waiting for ETA",
                    value: waitingEtaItems.length,
                    tone: waitingEtaItems.length > 0 ? "amber" : "zinc",
                  },
                  {
                    label: "Delayed units",
                    value: delayedItems.length,
                    tone: delayedItems.length > 0 ? "rose" : "zinc",
                  },
                ]}
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">
                  Manager Priorities
                </p>
                <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2.5 py-1 text-xs font-black text-sky-100">
                  {managerPriorityItems.length} active
                </span>
              </div>

              <div className="mt-4 grid gap-2">
                {managerPriorityItems.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-semibold text-zinc-400">
                    No manager requested priority order is set.
                  </p>
                ) : (
                  managerPriorityItems.slice(0, 5).map((item) => (
                    <Link
                      key={item.id}
                      href={`/queue/${item.id}${businessQuery}`}
                      className="rounded-2xl border border-sky-400/15 bg-sky-400/10 px-3 py-3 transition hover:border-sky-300/50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-black text-white">
                          #{item.priority_order} {queueItemLabel(item)}
                        </p>
                        <span className="shrink-0 text-xs font-bold text-sky-100">
                          {item.ready_date || "No deadline"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-zinc-400">
                        {item.progress_stage || item.status || "Pending"}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">
                  Workload
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {workloadMetrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
                    >
                      <p className="text-2xl font-black text-white">
                        {metric.value}
                      </p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">
                        {metric.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-100">
                  Smart Suggestions
                </p>
                <div className="mt-3 grid gap-2">
                  {smartSuggestions.length === 0 ? (
                    <p className="text-sm font-semibold leading-6 text-zinc-300">
                      No urgent queue suggestions right now.
                    </p>
                  ) : (
                    smartSuggestions.map((suggestion) => (
                      <p
                        key={suggestion}
                        className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold leading-5 text-amber-50"
                      >
                        {suggestion}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {queueLoadMessage ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <p className="text-sm font-semibold text-amber-200">
              Queue notice
            </p>

            <p className="mt-2 text-sm leading-6 text-amber-100/90">
              {queueLoadMessage}
            </p>
          </Card>
        ) : null}

        <Card>
          <form
            action="/queue#queue-results"
            className="grid gap-4 md:grid-cols-[1fr_auto]"
          >
            <input type="hidden" name="business" value={businessSlug} />
            {propertyFilter !== "all" ? (
              <input
                type="hidden"
                name="property"
                value={propertyFilter}
              />
            ) : null}

            {statusFilter !== "all" ? (
              <input type="hidden" name="status" value={statusFilter} />
            ) : null}

            {viewFilter !== "all" ? (
              <input type="hidden" name="view" value={viewFilter} />
            ) : null}
            {sortMode !== "deadline" ? (
              <input type="hidden" name="sort" value={sortMode} />
            ) : null}

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Search Queue
              </label>

              <input
                name="q"
                defaultValue={searchTerm}
                placeholder="Search property, unit, paint color, flooring, date, or notes"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              />
            </div>

            <div className="flex items-end gap-3">
              <Button type="submit">Search</Button>

              {(searchTerm ||
                statusFilter !== "all" ||
                viewFilter !== "all") && (
                <Link href={`/queue${businessQuery}#queue-results`}>
                  <Button variant="secondary">Clear</Button>
                </Link>
              )}
            </div>
          </form>
        </Card>

        <div className="queue-filter-bar flex flex-wrap gap-3 rounded-2xl border border-zinc-800 p-2">
          {specialViewLinks.map((filter) => (
            <Link
              key={filter.value}
              href={queueHref(businessSlug, {
                q: searchTerm,
                property: propertyFilter,
                status: statusFilter,
                view: filter.value,
                sort: sortMode,
              })}
              scroll={false}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                viewFilter === filter.value
                  ? "bg-sky-600 text-white shadow-sm shadow-sky-900/10"
                  : "queue-filter-link-inactive text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <span
                className={`filter-tab-icon ${
                  viewFilter === filter.value ? "filter-tab-icon-active" : ""
                }`}
                aria-hidden="true"
              >
                {filter.icon}
              </span>
              <span>{filter.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  viewFilter === filter.value
                    ? "bg-white/20 text-white"
                    : "queue-filter-count-inactive bg-zinc-950 text-zinc-400"
                }`}
              >
                {filter.count}
              </span>
            </Link>
          ))}
        </div>

        <div className="queue-filter-bar flex flex-wrap gap-3 rounded-2xl border border-zinc-800 p-2">
          {statusLinks.map((filter) => (
            <Link
              key={filter.value}
              href={queueHref(businessSlug, {
                q: searchTerm,
                property: propertyFilter,
                status: filter.value,
                view: viewFilter,
                sort: sortMode,
              })}
              scroll={false}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                statusFilter === filter.value
                  ? "bg-sky-600 text-white shadow-sm shadow-sky-900/10"
                  : "queue-filter-link-inactive text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <span
                className={`filter-tab-icon ${
                  statusFilter === filter.value ? "filter-tab-icon-active" : ""
                }`}
                aria-hidden="true"
              >
                {filter.icon}
              </span>
              <span>{filter.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  statusFilter === filter.value
                    ? "bg-white/20 text-white"
                    : "queue-filter-count-inactive bg-zinc-950 text-zinc-400"
                }`}
              >
                {filter.count}
              </span>
            </Link>
          ))}
        </div>

        <div className="queue-filter-bar flex flex-wrap gap-3 rounded-2xl border border-zinc-800 p-2">
          {sortLinks.map((filter) => (
            <Link
              key={filter.value}
              href={queueHref(businessSlug, {
                q: searchTerm,
                property: propertyFilter,
                status: statusFilter,
                view: viewFilter,
                sort: filter.value,
              })}
              scroll={false}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                sortMode === filter.value
                  ? "bg-sky-600 text-white shadow-sm shadow-sky-900/10"
                  : "queue-filter-link-inactive text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {filter.label}
            </Link>
          ))}
        </div>

        <Card className="border-sky-500/25 bg-sky-500/10 p-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-200">
            Queue field guide
          </p>
          <p className="mt-2 text-sm leading-6 text-sky-100">
            Needed By = property deadline. Priority = manager&apos;s requested
            order. Work Scheduled Date = internal Robbie schedule.
          </p>
        </Card>

        {viewFilter === "priority-planner" ? (
          propertyFilter === "all" ? (
            <Card className="border-sky-500/25 bg-sky-500/10 p-5">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-200">
                Priority Planner
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Choose a property first
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Manager requested priority is property-scoped. Pick one
                property so priorities do not mix across different queues.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {propertyPlannerOptions.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-zinc-300">
                    No properties are available yet.
                  </p>
                ) : (
                  propertyPlannerOptions.map(([key, label]) => (
                    <Link
                      key={key}
                      href={queueHref(businessSlug, {
                        property: key,
                        view: "priority-planner",
                        sort: "priority",
                      })}
                      className="rounded-2xl border border-sky-300/25 bg-sky-400/10 px-4 py-3 text-sm font-black text-sky-100 transition hover:border-sky-200"
                    >
                      {label}
                    </Link>
                  ))
                )}
              </div>
            </Card>
          ) : selectedBusiness?.id ? (
            <PriorityPlanner
              businessId={selectedBusiness.id}
              propertyName={activePropertyLabel}
              items={priorityPlannerItems}
            />
          ) : null
        ) : null}

        <Card className="queue-view-summary border-sky-500/20 bg-sky-500/10 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-sky-100">
                Current Queue View
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {activeView.title}
              </h2>
              <p className="mt-2 text-zinc-300">{activeView.detail}</p>
            </div>

            <p className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-zinc-300">
              Showing {displayQueueItems.length} of{" "}
              {propertyScopedQueueItems.length}{" "}
              queue items.
            </p>
          </div>
        </Card>

        <div id="queue-results" className="grid scroll-mt-6 gap-6">
          {propertyScopedQueueItems.length === 0 ? (
            <Card className="queue-empty-card border-sky-500/20 bg-sky-500/10">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-sky-100">
                    Ready For Intake
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">
                    Start this property queue
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                    Add the first unit when a property manager sends a turn,
                    repair request, or scheduling note. Trimax will keep the
                    work tied to this workspace and property.
                  </p>
                </div>

                <RoleVisible
                  businessSlug={businessSlug}
                  allow={["owner", "admin", "property_manager"]}
                >
                  <Link href={`/new-request${businessQuery}`}>
                    <Button>+ New Queue Item</Button>
                  </Link>
                </RoleVisible>
              </div>
            </Card>
          ) : displayQueueItems.length === 0 ? (
            <Card className="queue-empty-card border-zinc-700 bg-zinc-950/70">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
                    Nothing In This View
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">
                    No queue items match these filters
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                    Try clearing the search or switching back to All Work to
                    see the full property queue.
                  </p>
                </div>

                <Link href={`/queue${businessQuery}#queue-results`}>
                  <Button variant="secondary">Clear Filters</Button>
                </Link>
              </div>
            </Card>
          ) : (
            displayQueueItems.map((item) => {
              const displayUnit = maybeCanonicalApartmentUnitLabel(item.unit);
              const linkedEstimate = item.linked_estimate_id
                ? estimateById.get(item.linked_estimate_id)
                : null;
              const linkedInvoice = linkedEstimate?.id
                ? invoiceByEstimateId.get(linkedEstimate.id) ?? null
                : null;
              const invoiceWasSent = linkedInvoice
                ? invoiceIdsWithSendProof.has(linkedInvoice.id) ||
                  ["sent", "paid"].includes(normalizeStatus(linkedInvoice.status))
                : false;
              const invoiceIsPaid = isInvoicePaid(linkedInvoice);
              const readySoon = isReadySoonUnscheduled(item);
              const remediation = isRemediationItem(item);
              const estimateNeeded = needsEstimate(item);
              const readyDays = daysUntil(item.ready_date);
              const timingBadge = queueTimingBadge(item);
              const timingTone = queueTimingTone(timingBadge);
              const tbdDecisions = queueTbdDecisions(item);
              const itemJobSessions = sessionsByQueueItemId.get(item.id) ?? [];
              const activeJobSessionCount = itemJobSessions.filter(
                (session) => !session.ended_at
              ).length;
              const completedJobSessionCount = itemJobSessions.filter(
                (session) => session.ended_at
              ).length;
              const missingBreakdownCount = itemJobSessions.filter(
                (session) =>
                  Boolean(session.ended_at) &&
                  !breakdownSessionIds.has(session.id)
              ).length;
              const jobSessionMinutes = itemJobSessions.reduce(
                (total, session) =>
                  total +
                  (session.total_minutes ??
                    minutesBetween(session.started_at, session.ended_at)),
                0
              );
              const nextMove = activeJobSessionCount
                ? "Work in progress"
                : estimateNeeded
                  ? "Estimate needed"
                  : !item.scheduled_date && readySoon
                    ? "Schedule this unit"
                    : !item.scheduled_date
                      ? "Pick a work date"
                      : linkedEstimate
                        ? "Ready to manage"
                        : "Queue active";

              return (
                <Card key={item.id} className="queue-list-card queue-dispatch-card">
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_12rem] xl:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                        <div className="queue-unit-plate queue-unit-plate-v2">
                          <span className="queue-unit-plate-label">Unit</span>
                          <span className="queue-unit-plate-value">
                            {displayUnit || "-"}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <h2 className="text-2xl font-semibold">
                              {item.property || "Unknown Property"}
                            </h2>

                            <StatusBadge
                              status={item.status ?? "Pending Estimate"}
                            />

                            {item.priority ? (
                              <span className="queue-priority-pill rounded-full bg-zinc-950 px-3 py-1 text-sm font-semibold text-zinc-300">
                                {item.priority} Priority
                              </span>
                            ) : null}

                            {item.priority_order ? (
                              <span className="queue-priority-pill rounded-full bg-sky-500/15 px-3 py-1 text-sm font-semibold text-sky-100">
                                Requested Priority #{item.priority_order}
                              </span>
                            ) : null}

                            <span className="queue-priority-pill rounded-full border border-white/10 bg-black/25 px-3 py-1 text-sm font-semibold text-zinc-200">
                              Needed By {item.ready_date || "Not set"}
                            </span>

                            <span className="queue-priority-pill rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-100">
                              Progress {item.progress_stage || "Not Started"}
                            </span>

                            <span className="queue-priority-pill rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-sm font-semibold text-cyan-100">
                              ETA {item.projected_completion_date || "Missing"}
                            </span>

                            {item.smoked_in ? (
                              <span className="queue-remediation-pill rounded-full bg-red-500/20 px-3 py-1 text-sm font-semibold text-red-300">
                                Remediation
                              </span>
                            ) : null}

                            {!item.smoked_in && remediation ? (
                              <span className="queue-remediation-pill rounded-full bg-red-500/20 px-3 py-1 text-sm font-semibold text-red-300">
                                Smoke Note
                              </span>
                            ) : null}

                            {readySoon ? (
                              <span className="queue-ready-soon-pill rounded-full bg-yellow-500/20 px-3 py-1 text-sm font-semibold text-yellow-200">
                                Due Soon
                              </span>
                            ) : null}

                            {estimateNeeded ? (
                              <span className="queue-estimate-needed-pill rounded-full bg-purple-500/20 px-3 py-1 text-sm font-semibold text-purple-200">
                                Needs Estimate
                              </span>
                            ) : null}

                            <span
                              data-tone={timingTone}
                              className="queue-priority-pill rounded-full border border-white/10 bg-black/30 px-3 py-1 text-sm font-semibold text-zinc-100"
                            >
                              {timingBadge}
                            </span>

                            {item.renovation_needed ? (
                              <span className="queue-current-renovation-pill rounded-full bg-orange-500/20 px-3 py-1 text-sm font-semibold text-orange-200">
                                Current Renovation
                              </span>
                            ) : null}

                            {item.prior_renovation ||
                            item.prior_renovation_details ? (
                              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-semibold text-emerald-200">
                                Prior Renovation
                              </span>
                            ) : null}
                          </div>

                          {item.unit_layout ? (
                            <p className="mt-2 text-zinc-400">
                              Layout {item.unit_layout}
                            </p>
                          ) : null}

                          <div className="queue-next-move mt-4 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-sm font-bold text-sky-100">
                            <span className="queue-next-move-dot" aria-hidden="true" />
                            {nextMove}
                          </div>

                          <QueueLifecycleStrip
                            workDone={isClosedQueueItem(item)}
                            estimate={linkedEstimate}
                            invoice={linkedInvoice}
                            invoiceWasSent={invoiceWasSent}
                            invoiceIsPaid={invoiceIsPaid}
                            businessQuery={businessQuery}
                          />
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <LifecyclePill
                          label="Move Out"
                          value={item.move_out_date}
                        />
                        <LifecyclePill
                          label="Needed By"
                          value={item.ready_date}
                          detail={
                            readySoon && readyDays !== null
                              ? `${readyDays} day${
                                  readyDays === 1 ? "" : "s"
                                } out`
                              : undefined
                          }
                          alert={readySoon}
                          emptyValue="No deadline provided"
                        />
                        <LifecyclePill
                          label="Manager Priority"
                          value={
                            item.priority_order
                              ? `Priority ${item.priority_order}`
                              : null
                          }
                          emptyValue="No priority order"
                        />
                        <LifecyclePill
                          label="Scheduled"
                          value={item.scheduled_date}
                        />
                        <LifecyclePill
                          label="Progress"
                          value={item.progress_stage || "Not Started"}
                          detail={
                            item.percent_complete !== null &&
                            item.percent_complete !== undefined
                              ? `${item.percent_complete}% complete`
                              : undefined
                          }
                        />
                        <LifecyclePill
                          label="Robbie ETA"
                          value={item.projected_completion_date}
                          emptyValue="No ETA set"
                        />
                        <LifecyclePill
                          label="Delay"
                          value={item.delay_reason}
                          emptyValue="No delay reason"
                        />
                        {tbdDecisions.length > 0 ? (
                          <LifecyclePill
                            label="Outstanding Decisions"
                            value={`${tbdDecisions.length} TBD`}
                            detail={tbdDecisions
                              .map((decision) => decision.field)
                              .join(", ")}
                            alert
                          />
                        ) : null}
                      </div>

                      <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">
                          Manager Update
                        </p>
                        <p className="mt-2 text-sm leading-6 text-zinc-100">
                          {item.manager_update ||
                            "No manager-visible update yet."}
                        </p>
                        <p className="mt-2 text-xs font-semibold text-zinc-400">
                          Last updated{" "}
                          {formatQueueDateTime(
                            item.manager_update_at ?? item.updated_at ?? null
                          )}
                        </p>
                      </div>

                      <div className="mt-5 grid gap-4 text-sm text-zinc-300 md:grid-cols-2">
                        <Info label="Paint Type" value={item.paint_type} />
                        <Info
                          label="Unit Layout"
                          value={item.unit_layout}
                        />
                        <Info
                          label="Wall Color"
                          value={tbdDisplay(item.wall_paint_color)}
                        />
                        <Info
                          label="Flooring"
                          value={tbdDisplay(item.flooring)}
                        />
                        <Info
                          label="Renovation"
                          value={
                            item.renovation_needed
                              ? item.renovation_needed_details ||
                                "Needed"
                              : item.prior_renovation_details
                                ? item.prior_renovation_details
                                : item.prior_renovation
                                  ? "Prior renovation"
                                  : null
                          }
                        />
                        <Info
                          label="Completed Date"
                          value={item.completed_date}
                        />
                        <Info
                          label="Linked Estimate"
                          value={linkedEstimate?.display_id ?? null}
                        />
                        <Info
                          label="Linked Invoice"
                          value={linkedInvoice?.display_id ?? null}
                        />
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

                      <RoleVisible
                        businessSlug={businessSlug}
                        allow={["owner", "admin"]}
                      >
                        <LaborCue
                          activeCount={activeJobSessionCount}
                          completedCount={completedJobSessionCount}
                          missingBreakdownCount={missingBreakdownCount}
                          totalMinutes={jobSessionMinutes}
                        />
                      </RoleVisible>
                    </div>

                    <div className="queue-card-action-rail flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:flex-row xl:flex-col">
                      <Link href={`/queue/${item.id}${businessQuery}`}>
                        <Button>Open Queue Item</Button>
                      </Link>

                      <RoleVisible
                        businessSlug={businessSlug}
                        allow={["owner", "admin", "accountant", "property_manager"]}
                      >
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
                      </RoleVisible>
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

function LaborCue({
  activeCount,
  completedCount,
  missingBreakdownCount,
  totalMinutes,
}: {
  activeCount: number;
  completedCount: number;
  missingBreakdownCount: number;
  totalMinutes: number;
}) {
  if (activeCount === 0 && completedCount === 0) {
    return (
      <div className="queue-labor-cue mt-4 inline-flex flex-wrap items-center gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sm font-bold text-sky-100">
        <span className="queue-labor-dot" aria-hidden="true" />
        Open this item to start a job session
      </div>
    );
  }

  return (
    <div className="queue-labor-cue mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-100">
      <span className="queue-labor-dot queue-labor-dot-active" aria-hidden="true" />
      <span>
        {activeCount > 0
          ? `${activeCount} session running`
          : `${formatSessionMinutes(totalMinutes)} recorded`}
      </span>
      {completedCount > 0 ? (
        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-xs">
          {completedCount} stopped
        </span>
      ) : null}
      {missingBreakdownCount > 0 ? (
        <span className="rounded-full border border-amber-300/30 bg-amber-300/15 px-2 py-0.5 text-xs text-amber-100">
          {missingBreakdownCount} need breakdown
        </span>
      ) : null}
    </div>
  );
}

function OperationsMetricCard({
  label,
  items,
}: {
  label: string;
  items: Array<{
    label: string;
    value: number;
    tone: "rose" | "amber" | "emerald" | "sky" | "zinc";
  }>;
}) {
  const toneClasses = {
    rose: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    amber: "border-amber-300/30 bg-amber-300/10 text-amber-100",
    emerald: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
    sky: "border-sky-300/25 bg-sky-400/10 text-sky-100",
    zinc: "border-white/10 bg-black/20 text-zinc-200",
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">
        {label}
      </p>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 ${
              toneClasses[item.tone]
            }`}
          >
            <span className="text-sm font-bold">{item.label}</span>
            <span className="text-2xl font-black">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueueLifecycleStrip({
  workDone,
  estimate,
  invoice,
  invoiceWasSent,
  invoiceIsPaid,
  businessQuery,
}: {
  workDone: boolean;
  estimate: LinkedEstimate | null | undefined;
  invoice: LinkedInvoice | null | undefined;
  invoiceWasSent: boolean;
  invoiceIsPaid: boolean;
  businessQuery: string;
}) {
  const stages = [
    {
      label: "Work",
      complete: workDone,
      href: null,
    },
    {
      label: "Estimate",
      complete: Boolean(estimate),
      href: estimate?.id ? `/estimates/${estimate.id}${businessQuery}` : null,
    },
    {
      label: "Invoice",
      complete: Boolean(invoice),
      href: invoice?.id ? `/invoices/${invoice.id}${businessQuery}` : null,
    },
    {
      label: "Sent",
      complete: invoiceWasSent,
      href: invoice?.id ? `/invoices/${invoice.id}${businessQuery}#send-invoice` : null,
    },
    {
      label: "Paid",
      complete: invoiceIsPaid,
      href: invoice?.id ? `/invoices/${invoice.id}${businessQuery}` : null,
    },
  ];

  return (
    <div
      aria-label="Queue lifecycle status"
      className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-black"
    >
      {stages.map((stage, index) => {
        const content = (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition ${
              stage.complete
                ? "border-emerald-300/35 bg-emerald-400/12 text-emerald-100"
                : "border-white/10 bg-black/25 text-zinc-400"
            }`}
          >
            <span aria-hidden="true">{stage.complete ? "✓" : "○"}</span>
            <span>{stage.label}</span>
          </span>
        );

        return (
          <span key={stage.label} className="inline-flex items-center gap-1.5">
            {stage.href && stage.complete ? (
              <Link
                href={stage.href}
                className="rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-300/60"
              >
                {content}
              </Link>
            ) : (
              content
            )}
            {index < stages.length - 1 ? (
              <span aria-hidden="true" className="text-zinc-600">
                |
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
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

function queueFilterIcon(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("completed")) return "C";
  if (normalized.includes("scheduled")) return "S";
  if (normalized.includes("pending") || normalized.includes("estimate")) {
    return "E";
  }
  if (normalized.includes("remediation")) return "R";
  if (normalized.includes("history")) return "H";
  if (normalized.includes("due")) return "D";
  if (normalized.includes("active")) return "W";

  return label.slice(0, 1).toUpperCase();
}

function LifecyclePill({
  label,
  value,
  detail,
  emptyValue = "-",
  alert = false,
}: {
  label: string;
  value: string | null;
  detail?: string;
  emptyValue?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`queue-lifecycle-pill rounded-2xl border px-4 py-3 ${
        alert
          ? "queue-lifecycle-pill-alert border-amber-400/35 bg-amber-500/10"
          : value
          ? "queue-lifecycle-pill-filled border-sky-500/25 bg-sky-500/10"
          : "queue-lifecycle-pill-empty border-zinc-700 bg-zinc-950/55"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 font-semibold text-zinc-100">
        {value || emptyValue}
      </p>
      {detail ? (
        <p className="mt-1 text-xs font-semibold text-amber-200">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
