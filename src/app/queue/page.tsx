import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import QueueClickableCard from "../components/QueueClickableCard";
import PriorityPlanner, {
  type PriorityPlannerItem,
} from "../components/PriorityPlanner";
import PersistentDetails from "../components/PersistentDetails";
import StatusBadge from "../components/StatusBadge";
import RoleVisible from "../components/RoleVisible";
import Toast from "../components/Toast";
import { supabase } from "../lib/supabase";
import { tbdDisplay } from "../lib/tbd";
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
  split_parent_invoice_id: string | null;
  split_sequence: number | null;
  split_count: number | null;
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
  job_type?: string | null;
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
  const normalized = normalizeStatus(value);

  if (normalized === "invoice created" || normalized === "invoiced") {
    return "Ready to Send";
  }

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
    "invoice created": 6,
    "ready to send": 6,
    invoiced: 6,
    "invoice sent": 7,
    paid: 8,
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

  return status === "completed" || Boolean(item.completed_date);
}

function isClosedForOperations(
  item: QueueItemWithEstimate,
  activeQueueItemIds: Set<string>
) {
  void activeQueueItemIds;

  return isClosedQueueItem(item);
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

function invoiceWasSent(
  invoice: LinkedInvoice | null | undefined,
  invoiceIdsWithSendProof: Set<string>
) {
  if (!invoice) {
    return false;
  }

  return (
    invoiceIdsWithSendProof.has(invoice.id) ||
    ["sent", "paid"].includes(normalizeStatus(invoice.status))
  );
}

function derivedQueueStatusFromInvoicePackage({
  invoice,
  splitChildren,
  invoiceIdsWithSendProof,
}: {
  invoice: LinkedInvoice | null | undefined;
  splitChildren: LinkedInvoice[];
  invoiceIdsWithSendProof: Set<string>;
}) {
  if (!invoice) {
    return null;
  }

  const hasSplitChildren = splitChildren.length > 0;
  const invoicePackageWasSent =
    invoiceWasSent(invoice, invoiceIdsWithSendProof) ||
    (hasSplitChildren &&
      splitChildren.every((child) =>
        invoiceWasSent(child, invoiceIdsWithSendProof)
      ));
  const invoicePackageIsPaid =
    isInvoicePaid(invoice) ||
    (hasSplitChildren && splitChildren.every((child) => isInvoicePaid(child)));

  if (invoicePackageIsPaid) {
    return "Paid";
  }

  if (invoicePackageWasSent) {
    return "Invoice Sent";
  }

  return "Invoice Created";
}

function queueLifecycleDisplayStatus(status: string) {
  return normalizeStatus(status) === "invoice created"
    ? "Ready to Send"
    : status;
}

function serviceTypeForQueueItem(item: QueueItemWithEstimate) {
  return (
    item.paint_type ||
    tbdDisplay(item.flooring) ||
    item.renovation_needed_details ||
    item.notes ||
    "Turn"
  );
}

function primaryQueueAction({
  item,
  linkedEstimate,
  linkedInvoice,
  lifecycleStatus,
  activeSession,
  businessSlug,
}: {
  item: QueueItemWithEstimate;
  linkedEstimate: LinkedEstimate | null;
  linkedInvoice: LinkedInvoice | null;
  lifecycleStatus: string;
  activeSession: QueueJobSession | null;
  businessSlug: string;
}) {
  if (activeSession) {
    return {
      label: "Resume Job",
      href: `/queue/${item.id}?business=${businessSlug}#job-session`,
    };
  }

  if (!linkedEstimate) {
    return {
      label: "Create Estimate",
      href: `/estimates/new?queueId=${item.id}&business=${businessSlug}`,
    };
  }

  if (!linkedInvoice) {
    return {
      label: "Create Invoice",
      href: `/estimates/${linkedEstimate.id}?business=${businessSlug}`,
    };
  }

  if (["invoice created", "invoiced", "ready to send"].includes(normalizeStatus(lifecycleStatus))) {
    return {
      label: "Send Invoice",
      href: `/invoices/${linkedInvoice.id}?business=${businessSlug}#send-invoice`,
    };
  }

  if (!isClosedQueueItem(item)) {
    return {
      label: "Start Job",
      href: `/queue/${item.id}?business=${businessSlug}#job-session`,
    };
  }

  return {
    label: "Open Item",
    href: `/queue/${item.id}?business=${businessSlug}`,
  };
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

function priorityPlannerHref(businessSlug: string, property?: string) {
  const params = new URLSearchParams({
    business: businessSlug,
    view: "priority-planner",
    sort: "priority",
  });

  if (property && property !== "all") {
    params.set("property", property);
  }

  return `/queue?${params.toString()}`;
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
          .select("id, queue_item_id, started_at, ended_at, total_minutes, job_type")
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
  let linkedSplitChildInvoices: LinkedInvoice[] = [];
  let invoiceSendProofs: InvoiceSendProof[] = [];

  if (linkedEstimateIds.length > 0) {
    const { data } = await supabase
      .from("estimates")
      .select("id, display_id")
      .in("id", linkedEstimateIds);

    linkedEstimates = data ?? [];

    const { data: invoiceData, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, estimate_id, display_id, status, amount_paid, invoice_amount, split_parent_invoice_id, split_sequence, split_count")
      .in("estimate_id", linkedEstimateIds)
      .order("created_at", { ascending: false });

    if (invoiceError) {
      console.warn("Queue linked invoices could not be loaded:", invoiceError.message);
    }

    linkedInvoices = (invoiceData ?? []) as LinkedInvoice[];

    const linkedInvoiceIds = linkedInvoices.map((invoice) => invoice.id);

    if (linkedInvoiceIds.length > 0) {
      const { data: splitChildData, error: splitChildError } = await supabase
        .from("invoices")
        .select("id, estimate_id, display_id, status, amount_paid, invoice_amount, split_parent_invoice_id, split_sequence, split_count")
        .in("split_parent_invoice_id", linkedInvoiceIds)
        .order("split_sequence", { ascending: true });

      if (splitChildError) {
        console.warn(
          "Queue split child invoices could not be loaded:",
          splitChildError.message
        );
      } else {
        linkedSplitChildInvoices = (splitChildData ?? []) as LinkedInvoice[];
      }
    }

    const proofInvoiceIds = Array.from(
      new Set([
        ...linkedInvoiceIds,
        ...linkedSplitChildInvoices.map((invoice) => invoice.id),
      ])
    );

    if (proofInvoiceIds.length > 0) {
      const { data: sendProofData, error: sendProofError } = await supabase
        .from("activity_logs")
        .select("entity_id")
        .eq("business_id", selectedBusiness?.id)
        .eq("entity_type", "invoice")
        .in("entity_id", proofInvoiceIds)
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
  const splitChildrenByParentInvoiceId = new Map<string, LinkedInvoice[]>();

  linkedInvoices.forEach((invoice) => {
    if (invoice.estimate_id && !invoiceByEstimateId.has(invoice.estimate_id)) {
      invoiceByEstimateId.set(invoice.estimate_id, invoice);
    }
  });

  linkedSplitChildInvoices.forEach((invoice) => {
    if (!invoice.split_parent_invoice_id) {
      return;
    }

    const children =
      splitChildrenByParentInvoiceId.get(invoice.split_parent_invoice_id) ?? [];
    children.push(invoice);
    splitChildrenByParentInvoiceId.set(invoice.split_parent_invoice_id, children);
  });

  const invoiceIdsWithSendProof = new Set(
    invoiceSendProofs
      .map((proof) => proof.entity_id)
      .filter((id): id is string => Boolean(id))
  );
  const queueItemsWithLifecycle = queueItems.map((item) => {
    const linkedInvoice = item.linked_estimate_id
      ? invoiceByEstimateId.get(item.linked_estimate_id) ?? null
      : null;
    const splitChildren = linkedInvoice
      ? splitChildrenByParentInvoiceId.get(linkedInvoice.id) ?? []
      : [];
    const derivedStatus = derivedQueueStatusFromInvoicePackage({
      invoice: linkedInvoice,
      splitChildren,
      invoiceIdsWithSendProof,
    });

    return derivedStatus
      ? {
          ...item,
          status: derivedStatus,
        }
      : item;
  });
  const breakdownSessionIds = new Set(
    jobSessionBreakdowns.map((breakdown) => breakdown.job_session_id)
  );
  const activeSessionByQueueItemId = new Map(
    jobSessions
      .filter(
        (session) =>
          !session.ended_at && typeof session.queue_item_id === "string"
      )
      .map((session) => [session.queue_item_id as string, session])
  );
  const activeQueueItemIds = new Set(activeSessionByQueueItemId.keys());
  const propertyScopedQueueItems = queueItemsWithLifecycle.filter((item) => {
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
      queueItemsWithLifecycle
        .map((item) => item.property?.trim())
        .filter((property): property is string => Boolean(property))
        .map((property) => [propertyKey(property), property])
    ).entries()
  ).sort((first, second) => first[1].localeCompare(second[1]));

  const statusCountSource =
    viewFilter === "history"
      ? propertyScopedQueueItems
      : propertyScopedQueueItems.filter(
          (item) => !isClosedForOperations(item, activeQueueItemIds)
        );
  const statuses = Array.from(
    new Set(
      statusCountSource.map((item) =>
        normalizeStatus(item.status)
      )
    )
  ).sort((first, second) => first.localeCompare(second));

  const statusCounts = statusCountSource.reduce(
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
    (item) =>
      !isClosedForOperations(item, activeQueueItemIds) &&
      isRemediationItem(item)
  ).length;
  const needsEstimateCount =
    propertyScopedQueueItems.filter(needsEstimate).length;
  const activeWorkCount = propertyScopedQueueItems.filter(
    (item) => !isClosedForOperations(item, activeQueueItemIds)
  ).length;
  const propertyScopedQueueItemIds = new Set(
    propertyScopedQueueItems.map((item) => item.id)
  );
  const unscheduledActiveCount = propertyScopedQueueItems.filter(
    (item) =>
      !isClosedForOperations(item, activeQueueItemIds) && !item.scheduled_date
  ).length;
  const overdueUnscheduledCount = propertyScopedQueueItems.filter((item) => {
    const dueDays = daysUntil(item.ready_date);

    return (
      !isClosedForOperations(item, activeQueueItemIds) &&
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
        !isClosedForOperations(item, activeQueueItemIds) &&
        typeof item.priority_order === "number" &&
        Number.isFinite(item.priority_order)
    )
    .sort((first, second) => compareQueueItems(first, second, "priority"));
  const priorityPlannerItems = propertyScopedQueueItems
    .filter((item) => !isClosedForOperations(item, activeQueueItemIds))
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
    (item) =>
      !isClosedForOperations(item, activeQueueItemIds) &&
      !item.projected_completion_date
  );
  const delayedItems = propertyScopedQueueItems.filter(
    (item) =>
      !isClosedForOperations(item, activeQueueItemIds) &&
      Boolean(item.delay_reason)
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
    if (
      !item.linked_estimate_id ||
      isClosedForOperations(item, activeQueueItemIds)
    ) {
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
      !isClosedForOperations(item, activeQueueItemIds) &&
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
      isClosedForOperations(item, activeQueueItemIds) ||
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
    if (viewFilter !== "history" && isClosedForOperations(item, activeQueueItemIds)) {
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
      label: "All History",
      value: "history",
      icon: "H",
      count: propertyScopedQueueItems.length,
    },
  ];
  const isPriorityPlannerView = viewFilter === "priority-planner";

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
            <div className="flex flex-wrap gap-3">
              <Link href={`/new-request${businessQuery}`}>
                <Button>+ New Queue Item</Button>
              </Link>
              {isPriorityPlannerView ? (
                <Link href={`/queue${businessQuery}`}>
                  <Button variant="secondary">Back to Queue</Button>
                </Link>
              ) : (
                <Link href={priorityPlannerHref(businessSlug, propertyFilter)}>
                  <Button variant="secondary">Priority Planner</Button>
                </Link>
              )}
            </div>
          </RoleVisible>
        </div>

        {isPriorityPlannerView ? (
          <>
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

            {propertyFilter === "all" ? (
              <Card className="border-sky-500/25 bg-sky-500/10 p-5">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-200">
                  Priority Planner
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  Choose a property first
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {propertyPlannerOptions.length === 0 ? (
                    <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-zinc-300">
                      No properties are available yet.
                    </p>
                  ) : (
                    propertyPlannerOptions.map(([key, label]) => (
                      <Link
                        key={key}
                        href={priorityPlannerHref(businessSlug, key)}
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
            ) : null}
          </>
        ) : (
          <>
        <PersistentDetails
          storageKey={`trimax.queue.dispatch.${businessSlug}`}
          title="Secondary"
          subtitle="Dispatch / Workload"
          summaryMeta={
            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-100">
              Labor Proof
            </span>
          }
          className="queue-dispatch-radar rounded-2xl border border-emerald-500/20 bg-zinc-950/70 p-3"
        >
          <Link
            href={`/job-sessions?business=${businessSlug}`}
            className="mb-3 inline-flex rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-100 transition hover:-translate-y-0.5 hover:border-emerald-200"
          >
            Labor Proof
          </Link>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
              </Link>
            ))}
          </div>
        </PersistentDetails>

        <PersistentDetails
          storageKey={`trimax.queue.attention.${businessSlug}.${propertyFilter}`}
          title="Secondary"
          subtitle={`Attention / ${activePropertyLabel}`}
          summaryMeta={
            <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-black text-cyan-100">
              {overdueItems.length + dueTodayItems.length + managerPriorityItems.length} items
            </span>
          }
          className="queue-operations-summary rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-3"
        >
          <div className="grid gap-4 xl:grid-cols-[1.05fr_1.1fr_0.85fr]">
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
                      Nothing urgent.
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
        </PersistentDetails>

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

        <Card className="p-3 sm:p-4">
          <form
            action="/queue#queue-results"
            className="grid gap-3 md:grid-cols-[1fr_auto]"
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

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
          <p className="text-sm font-black text-white">
            {activeView.title}
          </p>
          <p className="text-sm font-semibold text-zinc-300">
            {displayQueueItems.length} of {propertyScopedQueueItems.length}
          </p>
        </div>

        <div id="queue-results" className="grid scroll-mt-6 gap-3">
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
                ? estimateById.get(item.linked_estimate_id) ?? null
                : null;
              const linkedInvoice = linkedEstimate?.id
                ? invoiceByEstimateId.get(linkedEstimate.id) ?? null
                : null;
              const splitChildren = linkedInvoice
                ? splitChildrenByParentInvoiceId.get(linkedInvoice.id) ?? []
                : [];
              const activeSession =
                activeSessionByQueueItemId.get(item.id) ?? null;
              const lifecycleStatus =
                derivedQueueStatusFromInvoicePackage({
                  invoice: linkedInvoice,
                  splitChildren,
                  invoiceIdsWithSendProof,
                }) ??
                (linkedEstimate
                  ? "Estimate Created"
                  : item.status || "Pending Estimate");
              const primaryAction = primaryQueueAction({
                item,
                linkedEstimate,
                linkedInvoice,
                lifecycleStatus,
                activeSession,
                businessSlug,
              });
              const serviceType = serviceTypeForQueueItem(item);
              const dueDate = item.ready_date || item.scheduled_date || "No date";

              return (
                <QueueClickableCard
                  key={item.id}
                  href={`/queue/${item.id}${businessQuery}`}
                  label={`Open queue item ${displayUnit || item.unit || item.id}`}
                  className="queue-list-card queue-dispatch-card p-2.5 sm:p-3"
                >
                  <div className="grid min-w-0 gap-2 md:grid-cols-[4.25rem_minmax(4.5rem,0.6fr)_minmax(7rem,1.15fr)_minmax(6rem,0.75fr)_minmax(7rem,0.9fr)_auto] md:items-center">
                    <CompactQueueField
                      label="Priority"
                      value={
                        item.priority_order
                          ? `#${item.priority_order}`
                          : item.priority || "-"
                      }
                    />
                    <div className="min-w-0">
                      <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-zinc-500">
                        Unit
                      </p>
                      <p className="mt-0.5 break-words text-lg font-black leading-6 text-white">
                        {displayUnit || "-"}
                      </p>
                    </div>
                    <CompactQueueField label="Work" value={serviceType} />
                    <CompactQueueField label="Needed" value={dueDate} />
                    <div className="min-w-0">
                      <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-zinc-500">
                        Status
                      </p>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                        {activeSession ? (
                          <span className="rounded-full border border-emerald-300/35 bg-emerald-400/15 px-2 py-1 text-xs font-black text-emerald-100">
                            Running
                          </span>
                        ) : null}
                        <StatusBadge
                          status={queueLifecycleDisplayStatus(lifecycleStatus)}
                        />
                      </div>
                    </div>
                    <Link
                      href={primaryAction.href}
                      className="rounded-2xl bg-sky-500 px-4 py-3 text-center text-sm font-black text-white transition hover:bg-sky-400 md:justify-self-end"
                    >
                      {primaryAction.label}
                    </Link>
                  </div>

                  <details
                    className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                    data-queue-row-control="true"
                  >
                    <summary className="cursor-pointer list-none text-xs font-black uppercase tracking-[0.16em] text-zinc-400">
                      More
                    </summary>
                    <div className="mt-2 grid min-w-0 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <CompactQueueField
                        label="Property"
                        value={item.property || "Unknown Property"}
                      />
                      <CompactQueueField
                        label="Move Out"
                        value={item.move_out_date || "Not set"}
                      />
                      <CompactQueueField
                        label="Flooring"
                        value={tbdDisplay(item.flooring)}
                      />
                      <CompactQueueField
                        label="ETA"
                        value={item.projected_completion_date || "Not set"}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {linkedEstimate ? (
                        <Link
                          href={`/estimates/${linkedEstimate.id}?business=${businessSlug}`}
                          className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-sky-300"
                        >
                          Estimate
                        </Link>
                      ) : null}
                      {linkedInvoice ? (
                        <Link
                          href={`/invoices/${linkedInvoice.id}?business=${businessSlug}`}
                          className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-sky-300"
                        >
                          Invoice
                        </Link>
                      ) : null}
                    </div>
                  </details>
                </QueueClickableCard>
              );
            })
          )}
        </div>
          </>
        )}
      </div>
    </AppShell>
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

function CompactQueueField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-bold leading-5 text-zinc-100">
        {value || "-"}
      </p>
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
