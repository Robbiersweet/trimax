import Link from "next/link";
import AppShell from "./components/AppShell";
import Card from "./components/Card";
import Button from "./components/Button";
import StatusBadge from "./components/StatusBadge";
import RoleVisible from "./components/RoleVisible";
import { supabase } from "./lib/supabase";
import { maybeCanonicalApartmentUnitLabel } from "./utils/unitLabels";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type QueueItem = {
  id: string;
  property: string | null;
  unit: string | null;
  unit_layout: string | null;
  paint_type: string | null;
  flooring: string | null;
  status: string | null;
  move_out_date: string | null;
  ready_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  smoked_in: boolean | null;
  notes: string | null;
  linked_estimate_id: string | null;
  created_at: string | null;
};

type Invoice = {
  id: string;
  display_id: string | null;
  project_title: string | null;
  customer_name: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  deposit_requested_amount?: string | number | null;
  deposit_status?: string | null;
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  updated_at: string | null;
  created_at: string | null;
  split_parent_invoice_id: string | null;
};

type ActivityLog = {
  id: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

const DASHBOARD_ACTIVITY_SNAPSHOT_LIMIT = 80;

function parseMoney(value: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  return Number(value?.replace(/[^0-9.-]+/g, "") || 0);
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function invoiceCollectionAmountDue(invoice: Invoice) {
  const invoiceTotal = parseMoney(invoice.invoice_amount);
  const amountPaid = parseMoney(invoice.amount_paid);
  const fullAmountDue = Math.max(invoiceTotal - amountPaid, 0);
  const depositAmount = parseMoney(invoice.deposit_requested_amount ?? null);

  return hasActiveDepositRequest(invoice)
    ? Math.max(depositAmount - amountPaid, 0)
    : fullAmountDue;
}

function hasActiveDepositRequest(invoice: Invoice) {
  return (
    String(invoice.deposit_status ?? "none").toLowerCase() === "requested" &&
    parseMoney(invoice.deposit_requested_amount ?? null) > 0
  );
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

function daysPastDue(value: string | null) {
  const dueDate = dateValue(value);

  if (!dueDate) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const difference = today.getTime() - dueDate.getTime();

  return Math.floor(difference / 86_400_000);
}

function formatShortDate(value: string | null) {
  const date = dateValue(value);

  if (!date) {
    return "-";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function monthName(value: number) {
  return new Date(2026, value, 1).toLocaleString("en-US", {
    month: "long",
  });
}

function firstUnitLabelFromText(value: string | null | undefined) {
  const normalized = maybeCanonicalApartmentUnitLabel(value ?? "");

  if (normalized) {
    return normalized;
  }

  const match = (value ?? "").match(/\b([A-Z])\s*-?\s*0?(\d{1,2})\b/i);

  return match ? maybeCanonicalApartmentUnitLabel(`${match[1]}${match[2]}`) : null;
}

function compactPatternText(...values: (string | null | undefined)[]) {
  return values
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) =>
      value
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\bunit\s+[a-z]\d{1,2}\b/gi, "unit")
        .replace(/\b[a-z]\d{1,2}\b/gi, "unit")
        .toLowerCase()
    )
    .join(" / ");
}

function dateYear(value: string | null) {
  const date = dateValue(value);

  return date ? date.getFullYear() : null;
}

function invoiceBelongsToYear(invoice: Invoice, year: number) {
  return (
    dateYear(invoice.issue_date) === year ||
    (!invoice.issue_date && dateYear(invoice.due_date) === year) ||
    (!invoice.issue_date &&
      !invoice.due_date &&
      dateYear(invoice.created_at) === year)
  );
}

function normalizeStatus(value: string | null) {
  return (value || "Pending Estimate").trim().toLowerCase();
}

function invoiceStatusKey(value: string | null) {
  return (value || "Draft").trim().toLowerCase();
}

function isCollectibleInvoiceStatus(value: string | null) {
  const status = invoiceStatusKey(value);

  return status !== "paid" && status !== "draft";
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    "queue_item.created": "Queue Created",
    "queue_item.scheduled": "Work Scheduled",
    "queue_item.completed": "Work Completed",
    "estimate.created": "Estimate Created",
    "estimate.updated": "Estimate Updated",
    "estimate.converted_to_invoice": "Estimate Converted",
    "estimate.deleted": "Estimate Deleted",
    "invoice.created": "Invoice Created",
    "invoice.updated": "Invoice Updated",
    "invoice.status_updated": "Invoice Updated",
    "invoice.email_sent": "Invoice Emailed",
    "invoice.payment_reminder_sent": "Payment Reminder Sent",
    "invoice.deposit_requested": "Deposit Requested",
    "invoice.deposit_cleared": "Deposit Cleared",
    "invoice.batch_payment_applied": "Payment Applied",
    "invoice.recurring_draft_created": "Recurring Draft Created",
    "invoice.split_created": "Split Invoices Created",
    "access_request.created": "Access Request Created",
    "estimate.email_sent": "Estimate Emailed",
    "import.clients_csv_completed": "Client CSV Import",
    "import.invoices_csv_completed": "Invoice CSV Import",
  };

  return labels[action] ?? action;
}

function activityHref(log: ActivityLog, businessSlug: string) {
  if (!log.entity_id) {
    return `/activity?business=${businessSlug}`;
  }

  if (log.entity_type === "queue_item") {
    return `/queue/${log.entity_id}?business=${businessSlug}`;
  }

  if (log.entity_type === "estimate") {
    return `/estimates/${log.entity_id}?business=${businessSlug}`;
  }

  if (log.entity_type === "invoice") {
    return `/invoices/${log.entity_id}?business=${businessSlug}`;
  }

  if (log.entity_type === "access_request") {
    return `/settings?business=${businessSlug}`;
  }

  if (log.entity_type === "import_batch") {
    return `/imports?business=${businessSlug}`;
  }

  return `/activity?business=${businessSlug}`;
}

function activityDetailValue(
  details: ActivityLog["details"],
  key: string
) {
  const value = details?.[key];

  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function activityMoneyValue(
  details: ActivityLog["details"],
  key: string
) {
  const value = details?.[key];

  if (typeof value === "number") {
    return formatMoney(value);
  }

  if (typeof value === "string" && value.trim()) {
    return formatMoney(parseMoney(value));
  }

  return null;
}

function activityProofDetail(log: ActivityLog) {
  const recipient = activityDetailValue(log.details, "recipient_email");
  const ccEmail = activityDetailValue(log.details, "cc_email");
  const pdfAttached = log.details?.pdf_attached === true;
  const depositAmount = activityMoneyValue(log.details, "depositAmount");
  const paymentAmount = activityMoneyValue(log.details, "amountApplied");

  if (recipient) {
    const parts = [`To ${recipient}`];

    if (ccEmail) {
      parts.push(`CC ${ccEmail}`);
    }

    if (pdfAttached) {
      parts.push("PDF attached");
    }

    return parts.join(" / ");
  }

  if (paymentAmount) {
    return `${paymentAmount} applied`;
  }

  if (depositAmount) {
    return `${depositAmount} requested`;
  }

  return log.actor_email ? `Logged by ${log.actor_email}` : "Logged in Trimax";
}

function relativeTime(value: string | null) {
  if (!value) {
    return "Recently";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  const differenceMinutes = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 60_000)
  );

  if (differenceMinutes < 1) {
    return "Just now";
  }

  if (differenceMinutes < 60) {
    return `${differenceMinutes} min ago`;
  }

  const differenceHours = Math.floor(differenceMinutes / 60);

  if (differenceHours < 24) {
    return `${differenceHours} hr ago`;
  }

  const differenceDays = Math.floor(differenceHours / 24);

  return `${differenceDays} day${differenceDays === 1 ? "" : "s"} ago`;
}

function isClosedQueueStatus(value: string | null) {
  return ["completed", "invoiced", "paid"].includes(normalizeStatus(value));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ business?: string }>;
}) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : {};
  const requestedBusinessSlug =
    resolvedSearchParams.business;

  const { data: businessData } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .order("name", { ascending: true });

  const businesses =
    (businessData ?? []) as Business[];

  const selectedBusiness =
    businesses.find(
      (business) =>
        business.slug === requestedBusinessSlug
    ) ??
    businesses.find(
      (business) => business.slug === "rnl-creations"
    ) ??
    businesses[0] ??
    null;

  const selectedBusinessSlug =
    selectedBusiness?.slug ?? "rnl-creations";

  let queueItems: QueueItem[] = [];
  let invoices: Invoice[] = [];
  let activityLogs: ActivityLog[] = [];

  if (selectedBusiness) {
    const [
      queueResponse,
      invoiceResponse,
      activityResponse,
    ] = await Promise.all([
      supabase
        .from("queue_items")
        .select(
          "id, property, unit, unit_layout, paint_type, flooring, status, move_out_date, ready_date, scheduled_date, completed_date, smoked_in, notes, linked_estimate_id, created_at"
        )
        .eq("business_id", selectedBusiness.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("invoices")
        .select(
          "id, display_id, project_title, customer_name, invoice_amount, amount_paid, deposit_requested_amount, deposit_status, status, issue_date, due_date, updated_at, created_at, split_parent_invoice_id"
        )
        .eq("business_id", selectedBusiness.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("activity_logs")
        .select(
          "id, actor_email, action, entity_type, entity_id, entity_label, details, created_at"
        )
        .eq("business_id", selectedBusiness.id)
        .order("created_at", { ascending: false })
        .limit(DASHBOARD_ACTIVITY_SNAPSHOT_LIMIT),
    ]);

    queueItems =
      (queueResponse.data ?? []) as QueueItem[];
    invoices =
      (invoiceResponse.data ?? []) as Invoice[];
    activityLogs =
      (activityResponse.data ?? []) as ActivityLog[];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(today.getDate() + 7);

  const queueSummary = queueItems.reduce(
    (summary, item) => {
      const status = normalizeStatus(item.status);
      const isClosed = isClosedQueueStatus(item.status);
      const readyDate = dateValue(item.ready_date);

      if (status !== "scheduled" && !isClosed) {
        summary.active.push(item);
      }

      if (item.status === "Scheduled" || Boolean(item.scheduled_date)) {
        summary.scheduled.push(item);
      }

      if (
        Boolean(readyDate) &&
        readyDate! >= today &&
        readyDate! <= sevenDaysFromNow &&
        !item.scheduled_date &&
        status !== "scheduled" &&
        status !== "completed"
      ) {
        summary.readySoonUnscheduled.push(item);
      }

      if (
        item.smoked_in ||
        (item.notes || "").toLowerCase().includes("smok")
      ) {
        summary.remediation.push(item);
      }

      if (!item.linked_estimate_id && !isClosed) {
        summary.needingEstimate.push(item);
      }

      return summary;
    },
    {
      active: [] as QueueItem[],
      scheduled: [] as QueueItem[],
      readySoonUnscheduled: [] as QueueItem[],
      remediation: [] as QueueItem[],
      needingEstimate: [] as QueueItem[],
    }
  );
  const activeQueueItems = queueSummary.active;
  const scheduledQueueItems = queueSummary.scheduled;
  const readySoonUnscheduled = queueSummary.readySoonUnscheduled;
  const remediationQueueItems = queueSummary.remediation;
  const queueItemsNeedingEstimate = queueSummary.needingEstimate;

  const splitParentInvoiceIds = new Set(
    invoices
      .map((invoice) => invoice.split_parent_invoice_id)
      .filter((id): id is string => Boolean(id))
  );
  const billableInvoices = invoices.filter(
    (invoice) => !splitParentInvoiceIds.has(invoice.id)
  );
  const recentBillableInvoices = [...billableInvoices]
    .sort((first, second) => {
      const firstDate = new Date(
        first.updated_at ?? first.created_at ?? "1970-01-01"
      ).getTime();
      const secondDate = new Date(
        second.updated_at ?? second.created_at ?? "1970-01-01"
      ).getTime();

      return secondDate - firstDate;
    })
    .slice(0, 3);

  const openInvoices = billableInvoices.filter((invoice) =>
    isCollectibleInvoiceStatus(invoice.status)
  );

  const openInvoicesWithAmounts = openInvoices
    .map((invoice) => {
      return {
        ...invoice,
        amountDue: invoiceCollectionAmountDue(invoice),
        daysLate: daysPastDue(invoice.due_date),
      };
    })
    .filter((invoice) => invoice.amountDue > 0);

  const workingYear = new Date().getFullYear();
  const workingYearLabel = String(workingYear);
  const workingYearInvoices = billableInvoices.filter((invoice) =>
    invoiceBelongsToYear(invoice, workingYear)
  );
  const workingYearOpenInvoicesWithAmounts = openInvoicesWithAmounts;
  const historicalOpenInvoicesWithAmounts =
    openInvoicesWithAmounts.filter(
      (invoice) => !invoiceBelongsToYear(invoice, workingYear)
    );

  const outstandingRevenueTotal =
    workingYearOpenInvoicesWithAmounts.reduce(
      (total, invoice) =>
        total + invoice.amountDue,
      0
    );

  const invoicedRevenueTotal = workingYearInvoices.reduce(
    (total, invoice) =>
      total + parseMoney(invoice.invoice_amount),
    0
  );

  const ytdRevenueTotal = workingYearInvoices
    .filter((invoice) => invoice.status === "Paid")
    .reduce(
      (total, invoice) =>
        total + parseMoney(invoice.invoice_amount),
      0
    );

  const outstandingRevenue = formatMoney(
    outstandingRevenueTotal
  );
  const ytdRevenue = formatMoney(ytdRevenueTotal);

  const mostOverdueInvoices = workingYearOpenInvoicesWithAmounts
    .filter((invoice) => (invoice.daysLate ?? -1) >= 0)
    .sort((first, second) => {
      return (second.daysLate ?? 0) - (first.daysLate ?? 0);
    })
    .slice(0, 5);
  const pastDueInvoices = workingYearOpenInvoicesWithAmounts.filter(
    (invoice) => (invoice.daysLate ?? -1) > 0
  );
  const pastDueTotal = pastDueInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const depositRequestInvoices = workingYearOpenInvoicesWithAmounts
    .filter(hasActiveDepositRequest)
    .sort((first, second) => second.amountDue - first.amountDue);
  const depositRequestTotal = depositRequestInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const largestOpenInvoice =
    [...workingYearOpenInvoicesWithAmounts].sort(
      (first, second) => second.amountDue - first.amountDue
    )[0] ?? null;
  const customerBalances = Array.from(
    workingYearOpenInvoicesWithAmounts
      .reduce(
        (
          groups,
          invoice
        ): Map<
          string,
          {
            customerName: string;
            count: number;
            total: number;
            oldestDue: string | null;
          }
        > => {
          const customerName = invoice.customer_name ?? "Unknown Customer";
          const current = groups.get(customerName) ?? {
            customerName,
            count: 0,
            total: 0,
            oldestDue: null,
          };
          const oldestDue =
            current.oldestDue && invoice.due_date
              ? current.oldestDue < invoice.due_date
                ? current.oldestDue
                : invoice.due_date
              : current.oldestDue ?? invoice.due_date;

          groups.set(customerName, {
            customerName,
            count: current.count + 1,
            total: current.total + invoice.amountDue,
            oldestDue,
          });

          return groups;
        },
        new Map<
          string,
          {
            customerName: string;
            count: number;
            total: number;
            oldestDue: string | null;
          }
        >()
      )
      .values()
  )
    .sort((first, second) => second.total - first.total)
    .slice(0, 3);
  const topCustomerBalance = customerBalances[0] ?? null;

  const collectionRate =
    invoicedRevenueTotal > 0
      ? Math.round((ytdRevenueTotal / invoicedRevenueTotal) * 100)
      : 0;
  const revenueFlowMax = Math.max(
    invoicedRevenueTotal,
    ytdRevenueTotal,
    outstandingRevenueTotal,
    pastDueTotal,
    1
  );
  const revenueFlowItems = [
    {
      label: "Invoiced",
      value: invoicedRevenueTotal,
      detail: `${collectionRate}% collected`,
      tone: "invoice",
    },
    {
      label: "Paid",
      value: ytdRevenueTotal,
      detail: "Cleared this year",
      tone: "paid",
    },
    {
      label: "Open",
      value: outstandingRevenueTotal,
      detail: `${workingYearOpenInvoicesWithAmounts.length} open`,
      tone: "open",
    },
    {
      label: "Past Due",
      value: pastDueTotal,
      detail: `${pastDueInvoices.length} late`,
      tone: "late",
    },
  ].map((item) => ({
    ...item,
    percent: Math.max(5, Math.round((item.value / revenueFlowMax) * 100)),
  }));
  const cashLaneTotal = Math.max(
    ytdRevenueTotal +
      outstandingRevenueTotal +
      depositRequestTotal +
      pastDueTotal,
    1
  );
  const cashLaneItems = [
    {
      label: "Paid",
      value: ytdRevenueTotal,
      tone: "paid",
    },
    {
      label: "Open",
      value: outstandingRevenueTotal,
      tone: "open",
    },
    {
      label: "Deposits",
      value: depositRequestTotal,
      tone: "deposit",
    },
    {
      label: "Past Due",
      value: pastDueTotal,
      tone: "late",
    },
  ].map((item) => ({
    ...item,
    percent: Math.max(4, Math.round((item.value / cashLaneTotal) * 100)),
  }));
  const paidInvoicesWithTiming = workingYearInvoices
    .filter((invoice) => invoice.status === "Paid" && invoice.updated_at)
    .map((invoice) => {
      const dueDate = dateValue(invoice.due_date);
      const paidDate = invoice.updated_at
        ? new Date(invoice.updated_at)
        : null;

      if (!dueDate || !paidDate || Number.isNaN(paidDate.getTime())) {
        return null;
      }

      paidDate.setHours(0, 0, 0, 0);

      return Math.round((paidDate.getTime() - dueDate.getTime()) / 86_400_000);
    })
    .filter((days): days is number => days !== null);
  const averagePaymentTiming =
    paidInvoicesWithTiming.length > 0
      ? Math.round(
          paidInvoicesWithTiming.reduce((total, days) => total + days, 0) /
            paidInvoicesWithTiming.length
        )
      : null;
  const repeatedInvoiceAmountPattern = Array.from(
    workingYearInvoices
      .reduce(
        (
          groups,
          invoice
        ): Map<number, { amount: number; count: number; total: number }> => {
          const amount = Math.round(parseMoney(invoice.invoice_amount) * 100) / 100;

          if (amount <= 0) {
            return groups;
          }

          const current = groups.get(amount) ?? {
            amount,
            count: 0,
            total: 0,
          };

          groups.set(amount, {
            amount,
            count: current.count + 1,
            total: current.total + amount,
          });

          return groups;
        },
        new Map<number, { amount: number; count: number; total: number }>()
      )
      .values()
  )
    .filter((pattern) => pattern.count >= 3)
    .sort((first, second) => second.count - first.count)[0];
  const queueEstimateBottleneckRate =
    activeQueueItems.length > 0
      ? Math.round((queueItemsNeedingEstimate.length / activeQueueItems.length) * 100)
      : 0;
  const priorityInvoice =
    mostOverdueInvoices[0] ??
    depositRequestInvoices[0] ??
    largestOpenInvoice;
  const priorityCustomerBalance = customerBalances[0] ?? null;
  const priorityPaymentParams = new URLSearchParams({
    business: selectedBusinessSlug,
    customer:
      priorityCustomerBalance?.customerName ??
      priorityInvoice?.customer_name ??
      "",
  });
  const commandCenterItems = [
    {
      label: "Collect",
      title: priorityCustomerBalance
        ? `Collect from ${priorityCustomerBalance.customerName}`
        : "Open payment workspace",
      metric: priorityCustomerBalance
        ? formatMoney(priorityCustomerBalance.total)
        : outstandingRevenue,
      detail: priorityCustomerBalance
        ? `${priorityCustomerBalance.count} open invoice${
            priorityCustomerBalance.count === 1 ? "" : "s"
          } ready to reconcile.`
        : "Review open balances and apply incoming checks.",
      href: `/payments?${priorityPaymentParams.toString()}`,
      action: "Open Payments",
      tone: "collect",
    },
    {
      label: "Remind",
      title:
        pastDueInvoices.length > 0
          ? "Send late payment reminders"
          : "No late reminders due",
      metric: String(pastDueInvoices.length),
      detail:
        pastDueInvoices.length > 0
          ? `${formatMoney(pastDueTotal)} is past due across open invoices.`
          : "The overdue reminder queue is clear right now.",
      href: `/invoices?business=${selectedBusinessSlug}&view=aging`,
      action: "Review Aging",
      tone: "remind",
    },
    {
      label: "Capture",
      title: "Photograph a check",
      metric: String(workingYearOpenInvoicesWithAmounts.length),
      detail:
        "Open the camera-ready check workflow and match payments to invoices.",
      href: `/payments?business=${selectedBusinessSlug}#check-capture`,
      action: "Capture Check",
      tone: "capture",
    },
    {
      label: "Create",
      title: "Send the next invoice",
      metric: workingYearLabel,
      detail:
        "Create an invoice, request a deposit, or turn approved work into billable revenue.",
      href: `/invoices/new?business=${selectedBusinessSlug}`,
      action: "New Invoice",
      tone: "create",
    },
  ];
  const queueFocusHeadline =
    readySoonUnscheduled.length > 0
      ? "Schedule ready units first"
      : queueItemsNeedingEstimate.length > 0
        ? "Finish queue estimates"
        : remediationQueueItems.length > 0
          ? "Watch remediation risk"
          : scheduledQueueItems.length > 0
            ? "Work is already scheduled"
            : "Queue is calm";
  const queueFocusDetail =
    readySoonUnscheduled.length > 0
      ? `${readySoonUnscheduled.length} unit${
          readySoonUnscheduled.length === 1 ? "" : "s"
        } are due within 7 days and not scheduled.`
      : queueItemsNeedingEstimate.length > 0
        ? `${queueItemsNeedingEstimate.length} queue item${
            queueItemsNeedingEstimate.length === 1 ? "" : "s"
          } still need an estimate before billing can move.`
        : remediationQueueItems.length > 0
          ? `${remediationQueueItems.length} item${
              remediationQueueItems.length === 1 ? "" : "s"
            } have smoker or remediation notes.`
          : scheduledQueueItems.length > 0
            ? `${scheduledQueueItems.length} job${
                scheduledQueueItems.length === 1 ? "" : "s"
              } are on the schedule.`
            : "No active queue work needs immediate attention.";
  const queueActionItems = [
    {
      label: "Needs Estimate",
      value: queueItemsNeedingEstimate.length,
      detail: "Queue work not linked to an estimate",
      href: `/queue?business=${selectedBusinessSlug}&view=needs-estimate`,
      tone: "sky",
    },
    {
      label: "Ready Soon",
      value: readySoonUnscheduled.length,
      detail: "Due within 7 days and unscheduled",
      href: `/queue?business=${selectedBusinessSlug}&view=ready-soon`,
      tone: "amber",
    },
    {
      label: "Scheduled",
      value: scheduledQueueItems.length,
      detail: "Jobs already on the calendar",
      href: `/queue?business=${selectedBusinessSlug}&status=scheduled`,
      tone: "emerald",
    },
    {
      label: "Remediation",
      value: remediationQueueItems.length,
      detail: "Smoker or extra-prep watch list",
      href: `/queue?business=${selectedBusinessSlug}&view=remediation`,
      tone: "rose",
    },
  ];
  const recentQueueItems = queueItems.slice(0, 3);
  const propertyHandoffItems = activeQueueItems
    .map((item) => {
      const readyDays = daysPastDue(item.ready_date);
      const readyDate = dateValue(item.ready_date);
      const status = normalizeStatus(item.status);
      const needsSchedule = !item.scheduled_date;
      const needsEstimate = !item.linked_estimate_id;
      const readySoon =
        readyDate !== null &&
        readyDays !== null &&
        readyDays >= -7 &&
        readyDays <= 7;
      const tone = needsSchedule
        ? readySoon
          ? "amber"
          : "sky"
        : needsEstimate
          ? "violet"
          : "emerald";
      const action = needsSchedule
        ? "Schedule"
        : needsEstimate
          ? "Estimate"
          : status.includes("completed")
            ? "Done"
            : "Open";
      const detail = needsSchedule
        ? readySoon
          ? `Paint due ${formatShortDate(item.ready_date)}`
          : "Needs a work date"
        : needsEstimate
          ? "Estimate not linked yet"
          : `Scheduled ${formatShortDate(item.scheduled_date)}`;
      const urgencyBucket = needsSchedule
        ? readySoon
          ? 0
          : 1
        : needsEstimate
          ? 2
          : 3;
      const sortScore =
        urgencyBucket * 10_000_000_000_000 +
        (readyDate?.getTime() ?? Number.MAX_SAFE_INTEGER);

      return {
        ...item,
        action,
        detail,
        sortScore,
        tone,
      };
    })
    .sort((first, second) => first.sortScore - second.sortScore)
    .slice(0, 4);
  const mobilePriorityItems = [
    {
      label: "Collect",
      value: outstandingRevenue,
      detail: "Open revenue",
      href: `/payments?${priorityPaymentParams.toString()}`,
      tone: "collect",
    },
    {
      label: "Queue",
      value: String(activeQueueItems.length),
      detail: "Active items",
      href: `/queue?business=${selectedBusinessSlug}`,
      tone: "queue",
    },
    {
      label: "Late",
      value: String(pastDueInvoices.length),
      detail: formatMoney(pastDueTotal),
      href: `/invoices?business=${selectedBusinessSlug}&view=aging`,
      tone: "late",
    },
    {
      label: "Checks",
      value: String(workingYearOpenInvoicesWithAmounts.length),
      detail: "Match payments",
      href: `/payments?business=${selectedBusinessSlug}#check-capture`,
      tone: "checks",
    },
  ];
  const dashboardFocusItems = [
    {
      label: "Collect",
      title: priorityCustomerBalance
        ? priorityCustomerBalance.customerName
        : priorityInvoice?.customer_name ?? "Open payment workspace",
      metric: priorityCustomerBalance
        ? formatMoney(priorityCustomerBalance.total)
        : priorityInvoice
          ? formatMoney(invoiceCollectionAmountDue(priorityInvoice))
          : outstandingRevenue,
      detail: priorityCustomerBalance
        ? `${priorityCustomerBalance.count} open invoice${
            priorityCustomerBalance.count === 1 ? "" : "s"
          } ready for payment review.`
        : "Open balances and deposit requests are ready to reconcile.",
      href: `/payments?${priorityPaymentParams.toString()}`,
      tone: "collect",
    },
    {
      label: "Queue",
      title: queueFocusHeadline,
      metric: String(activeQueueItems.length),
      detail: queueFocusDetail,
      href: `/queue?business=${selectedBusinessSlug}`,
      tone: "queue",
    },
    {
      label: "Follow Up",
      title:
        pastDueInvoices.length > 0
          ? "Late reminders"
          : depositRequestInvoices.length > 0
            ? "Deposit requests"
            : "Check capture",
      metric:
        pastDueInvoices.length > 0
          ? String(pastDueInvoices.length)
          : depositRequestInvoices.length > 0
            ? String(depositRequestInvoices.length)
            : String(workingYearOpenInvoicesWithAmounts.length),
      detail:
        pastDueInvoices.length > 0
          ? `${formatMoney(pastDueTotal)} is past due and ready for reminder review.`
          : depositRequestInvoices.length > 0
            ? `${formatMoney(depositRequestTotal)} is waiting on active deposit requests.`
            : "Use check capture when a payment arrives and Trimax will suggest invoice matches.",
      href:
        pastDueInvoices.length > 0
          ? `/invoices?business=${selectedBusinessSlug}&view=aging`
          : depositRequestInvoices[0]
            ? `/invoices/${depositRequestInvoices[0].id}?business=${selectedBusinessSlug}`
            : `/payments?business=${selectedBusinessSlug}#check-capture`,
      tone:
        pastDueInvoices.length > 0
          ? "late"
          : depositRequestInvoices.length > 0
            ? "deposit"
            : "checks",
    },
  ];
  const proofActions = new Set([
    "estimate.created",
    "estimate.updated",
    "estimate.converted_to_invoice",
    "estimate.email_sent",
    "invoice.created",
    "invoice.updated",
    "invoice.status_updated",
    "invoice.email_sent",
    "invoice.payment_reminder_sent",
    "invoice.deposit_requested",
    "invoice.deposit_cleared",
    "invoice.batch_payment_applied",
    "invoice.recurring_draft_created",
    "invoice.split_created",
  ]);
  const communicationProofLogs = activityLogs
    .filter((log) => proofActions.has(log.action))
    .slice(0, 3);
  const reminderInvoiceIds = new Set(
    activityLogs
      .filter((log) => log.action === "invoice.payment_reminder_sent")
      .map((log) => log.entity_id)
      .filter(Boolean)
  );
  const pastDueWithoutReminderCount = pastDueInvoices.filter(
    (invoice) => !reminderInvoiceIds.has(invoice.id)
  ).length;
  const customerEmailWithoutPdfCount = activityLogs.filter(
    (log) =>
      [
        "estimate.email_sent",
        "invoice.email_sent",
        "invoice.payment_reminder_sent",
      ].includes(log.action) && log.details?.pdf_attached !== true
  ).length;
  const paymentWithoutImageProofCount = activityLogs.filter(
    (log) =>
      log.action === "invoice.batch_payment_applied" &&
      !log.details?.paymentAttachmentId &&
      !log.details?.paymentImagePath
  ).length;
  const totalRiskFlags =
    pastDueWithoutReminderCount +
    customerEmailWithoutPdfCount +
    paymentWithoutImageProofCount;
  const auditHealthLabel =
    totalRiskFlags === 0
      ? "Records look complete"
      : totalRiskFlags <= 2
        ? "Items need review"
        : "Records need attention";
  const auditHealthDetail =
    totalRiskFlags === 0
      ? "Invoices, reminders, PDFs, and payment photos look accounted for in the current dashboard snapshot."
      : `${totalRiskFlags} item${
          totalRiskFlags === 1 ? "" : "s"
        } should be checked before month-end or a client follow-up.`;
  const riskRadarItems = [
    {
      label: "Reminder Needed",
      value: pastDueWithoutReminderCount,
      detail:
        pastDueWithoutReminderCount > 0
          ? "Past-due invoices without a logged reminder"
          : "Past-due reminders are up to date",
      action:
        pastDueWithoutReminderCount > 0 ? "Review aging" : "Up to date",
      href: `/invoices?business=${selectedBusinessSlug}&view=aging`,
      tone: pastDueWithoutReminderCount > 0 ? "rose" : "emerald",
    },
    {
      label: "PDF Missing",
      value: customerEmailWithoutPdfCount,
      detail:
        customerEmailWithoutPdfCount > 0
          ? "Sent messages that may need invoice PDF proof"
          : "Recent sends include PDF attachments",
      action:
        customerEmailWithoutPdfCount > 0 ? "Open activity" : "Up to date",
      href: `/activity?business=${selectedBusinessSlug}&type=invoice&q=pdf`,
      tone: customerEmailWithoutPdfCount > 0 ? "amber" : "emerald",
    },
    {
      label: "Payment Photo Missing",
      value: paymentWithoutImageProofCount,
      detail:
        paymentWithoutImageProofCount > 0
          ? "Payments recorded without check or stub images"
          : "Payment photos are attached where needed",
      action:
        paymentWithoutImageProofCount > 0 ? "Review payments" : "Up to date",
      href: `/activity?business=${selectedBusinessSlug}&type=payment`,
      tone: paymentWithoutImageProofCount > 0 ? "sky" : "emerald",
    },
  ];
  const activityActionCounts = activityLogs.reduce(
    (counts, log) => {
      counts[log.action] = (counts[log.action] ?? 0) + 1;

      return counts;
    },
    {} as Record<string, number>
  );
  const sentWithPdfCount = activityLogs.filter(
    (log) =>
      [
        "estimate.email_sent",
        "invoice.email_sent",
        "invoice.payment_reminder_sent",
      ].includes(log.action) && log.details?.pdf_attached === true
  ).length;
  const paymentWithImageProofCount = activityLogs.filter(
    (log) =>
      log.action === "invoice.batch_payment_applied" &&
      (log.details?.paymentAttachmentId || log.details?.paymentImagePath)
  ).length;
  const proofFlightRecorderSteps = [
    {
      label: "Estimate",
      title: "Scope priced",
      value:
        (activityActionCounts["estimate.created"] ?? 0) +
        (activityActionCounts["estimate.updated"] ?? 0) +
        (activityActionCounts["estimate.converted_to_invoice"] ?? 0) +
        (activityActionCounts["estimate.email_sent"] ?? 0),
      detail: "Estimate changes and sends",
      href: `/activity?business=${selectedBusinessSlug}&type=estimate`,
      tone: "violet",
    },
    {
      label: "Invoice",
      title: "Billing trail",
      value:
        (activityActionCounts["invoice.created"] ?? 0) +
        (activityActionCounts["invoice.updated"] ?? 0) +
        (activityActionCounts["invoice.status_updated"] ?? 0) +
        (activityActionCounts["invoice.email_sent"] ?? 0) +
        (activityActionCounts["invoice.split_created"] ?? 0) +
        (activityActionCounts["invoice.recurring_draft_created"] ?? 0),
      detail: "Invoices created, sent, and changed",
      href: `/activity?business=${selectedBusinessSlug}&type=invoice`,
      tone: "sky",
    },
    {
      label: "Reminder",
      title: "Follow-up trail",
      value: activityActionCounts["invoice.payment_reminder_sent"] ?? 0,
      detail: "Late reminders recorded",
      href: `/activity?business=${selectedBusinessSlug}&type=invoice&q=reminder`,
      tone: "rose",
    },
    {
      label: "Payment",
      title: "Money tracked",
      value:
        (activityActionCounts["invoice.batch_payment_applied"] ?? 0) +
        (activityActionCounts["invoice.deposit_requested"] ?? 0) +
        (activityActionCounts["invoice.deposit_cleared"] ?? 0),
      detail: "Payments and deposit actions",
      href: `/activity?business=${selectedBusinessSlug}&type=payment`,
      tone: "emerald",
    },
    {
      label: "Proof",
      title: "Evidence attached",
      value: sentWithPdfCount + paymentWithImageProofCount,
      detail: "PDFs and payment photos",
      href: `/activity?business=${selectedBusinessSlug}`,
      tone: "cyan",
    },
  ];
  const proofFlightRecorderTotal = proofFlightRecorderSteps.reduce(
    (total, step) => total + step.value,
    0
  );
  const proofFlightRecorderWindowLabel =
    activityLogs.length >= DASHBOARD_ACTIVITY_SNAPSHOT_LIMIT
      ? `Recent ${DASHBOARD_ACTIVITY_SNAPSHOT_LIMIT}+ records`
      : `${activityLogs.length} recent record${
          activityLogs.length === 1 ? "" : "s"
        } scanned`;
  const patternRecognitionItems: {
    label: string;
    title: string;
    detail: string;
    action: string;
    href: string;
    signal: string;
    tone: string;
  }[] = [];
  const unitTurnoverPatterns = Array.from(
    queueItems
      .reduce(
        (
          groups,
          item
        ): Map<
          string,
          {
            property: string;
            unit: string;
            moveOutDates: Date[];
            latestItemId: string;
          }
        > => {
          const unit = firstUnitLabelFromText(item.unit);
          const moveOutDate = dateValue(item.move_out_date);

          if (!unit || !moveOutDate) {
            return groups;
          }

          const property = item.property ?? "Property";
          const key = `${property.toLowerCase()}::${unit}`;
          const current = groups.get(key) ?? {
            property,
            unit,
            moveOutDates: [] as Date[],
            latestItemId: item.id,
          };
          const previousLatestTime =
            current.moveOutDates.length > 0
              ? Math.max(...current.moveOutDates.map((date) => date.getTime()))
              : 0;

          current.moveOutDates.push(moveOutDate);

          if (!current.latestItemId || moveOutDate.getTime() > previousLatestTime) {
            current.latestItemId = item.id;
          }

          groups.set(key, current);

          return groups;
        },
        new Map<
          string,
          {
            property: string;
            unit: string;
            moveOutDates: Date[];
            latestItemId: string;
          }
        >()
      )
      .values()
  )
    .map((pattern) => {
      const sortedDates = [...pattern.moveOutDates].sort(
        (first, second) => first.getTime() - second.getTime()
      );
      const intervals = sortedDates
        .slice(1)
        .map((date, index) =>
          Math.round(
            (date.getTime() - sortedDates[index].getTime()) / 86_400_000
          )
        );
      const averageDays =
        intervals.length > 0
          ? Math.round(
              intervals.reduce((total, days) => total + days, 0) /
                intervals.length
            )
          : null;

      return {
        ...pattern,
        averageDays,
        count: sortedDates.length,
      };
    })
    .filter(
      (pattern) =>
        pattern.count >= 2 &&
        pattern.averageDays !== null &&
        pattern.averageDays >= 240 &&
        pattern.averageDays <= 520
    )
    .sort((first, second) => {
      const firstDistance = Math.abs((first.averageDays ?? 365) - 365);
      const secondDistance = Math.abs((second.averageDays ?? 365) - 365);

      return firstDistance - secondDistance;
    });
  const seasonalServicePatterns = Array.from(
    [
      ...queueItems.map((item) => ({
        customer: item.property ?? "Property",
        date: dateValue(item.ready_date ?? item.move_out_date ?? item.created_at),
        href: `/queue/${item.id}?business=${selectedBusinessSlug}`,
        service: compactPatternText(item.paint_type, item.flooring, item.notes),
      })),
      ...billableInvoices.map((invoice) => ({
        customer: invoice.customer_name ?? "Customer",
        date: dateValue(invoice.issue_date ?? invoice.due_date ?? invoice.created_at),
        href: `/invoices/${invoice.id}?business=${selectedBusinessSlug}`,
        service: compactPatternText(invoice.project_title),
      })),
    ]
      .reduce(
        (
          groups,
          record
        ): Map<
          string,
          {
            customer: string;
            service: string;
            month: number;
            count: number;
            href: string;
          }
        > => {
          if (!record.date || record.service.length < 8) {
            return groups;
          }

          const month = record.date.getMonth();
          const key = `${record.customer.toLowerCase()}::${record.service}::${month}`;
          const current = groups.get(key) ?? {
            customer: record.customer,
            service: record.service,
            month,
            count: 0,
            href: record.href,
          };

          groups.set(key, {
            ...current,
            count: current.count + 1,
            href: record.href,
          });

          return groups;
        },
        new Map<
          string,
          {
            customer: string;
            service: string;
            month: number;
            count: number;
            href: string;
          }
        >()
      )
      .values()
  )
    .filter((pattern) => pattern.count >= 2)
    .sort((first, second) => second.count - first.count);

  if (unitTurnoverPatterns[0]) {
    const pattern = unitTurnoverPatterns[0];
    const averageDays = pattern.averageDays ?? 365;

    patternRecognitionItems.push({
      label: "Turnover Memory",
      title: `${pattern.unit} appears to turn about yearly`,
      detail: `${pattern.property} has ${pattern.count} saved move-outs for this unit, averaging about ${averageDays} days between turns. Trimax can flag this unit earlier when that window approaches again.`,
      action: "Open matching unit",
      href: `/queue/${pattern.latestItemId}?business=${selectedBusinessSlug}`,
      signal: `${Math.round(averageDays / 30)} mo`,
      tone: "turnover",
    });
  }

  if (seasonalServicePatterns[0]) {
    const pattern = seasonalServicePatterns[0];

    patternRecognitionItems.push({
      label: "Seasonal Memory",
      title: `${pattern.customer} repeats similar work in ${monthName(
        pattern.month
      )}`,
      detail: `${pattern.count} saved records share a similar work fingerprint in ${monthName(
        pattern.month
      )}. This is the kind of pattern Trimax can use to remind you before the call comes in.`,
      action: "Review matching work",
      href: pattern.href,
      signal: `${pattern.count}x`,
      tone: "seasonal",
    });
  }

  if (
    topCustomerBalance &&
    outstandingRevenueTotal > 0 &&
    topCustomerBalance.total / outstandingRevenueTotal >= 0.45
  ) {
    patternRecognitionItems.push({
      label: "Cash Pattern",
      title: `${topCustomerBalance.customerName} drives most open revenue`,
      detail: `${Math.round(
        (topCustomerBalance.total / outstandingRevenueTotal) * 100
      )}% of open revenue is concentrated in this customer, so payment follow-up here moves the needle fastest.`,
      action: "Open payment target",
      href: `/payments?business=${selectedBusinessSlug}&customer=${encodeURIComponent(
        topCustomerBalance.customerName
      )}`,
      signal: formatMoney(topCustomerBalance.total),
      tone: "cash",
    });
  }

  if (repeatedInvoiceAmountPattern) {
    patternRecognitionItems.push({
      label: "Billing Pattern",
      title: `${formatMoney(repeatedInvoiceAmountPattern.amount)} repeats often`,
      detail: `${repeatedInvoiceAmountPattern.count} invoices share this amount. Trimax can treat this as a recurring unit-price signal when reviewing checks and invoice batches.`,
      action: "Review invoices",
      href: `/invoices?business=${selectedBusinessSlug}`,
      signal: `${repeatedInvoiceAmountPattern.count}x`,
      tone: "invoice",
    });
  }

  if (queueEstimateBottleneckRate >= 50 && queueItemsNeedingEstimate.length > 0) {
    patternRecognitionItems.push({
      label: "Queue Pattern",
      title: "Estimates are the current bottleneck",
      detail: `${queueEstimateBottleneckRate}% of active queue work still needs pricing before it can become billable revenue.`,
      action: "Open estimate queue",
      href: `/queue?business=${selectedBusinessSlug}&view=needs-estimate`,
      signal: `${queueEstimateBottleneckRate}%`,
      tone: "queue",
    });
  }

  if (readySoonUnscheduled.length >= 2) {
    patternRecognitionItems.push({
      label: "Schedule Pattern",
      title: "Due-soon work is stacking up",
      detail: `${readySoonUnscheduled.length} units are due within 7 days without a schedule date. That pattern usually turns into last-minute pressure.`,
      action: "Schedule work",
      href: `/queue?business=${selectedBusinessSlug}&view=ready-soon`,
      signal: `${readySoonUnscheduled.length}`,
      tone: "schedule",
    });
  }

  if (averagePaymentTiming !== null) {
    patternRecognitionItems.push({
      label: "Payment Pattern",
      title:
        averagePaymentTiming > 0
          ? "Payments are landing after due dates"
          : "Payments are landing on time",
      detail:
        averagePaymentTiming > 0
          ? `Paid invoices average ${averagePaymentTiming} day${
              averagePaymentTiming === 1 ? "" : "s"
            } after their due date. Reminder timing may be worth tightening.`
          : `Paid invoices average ${Math.abs(averagePaymentTiming)} day${
              Math.abs(averagePaymentTiming) === 1 ? "" : "s"
            } before or on the due date.`,
      action: "Open reports",
      href: `/reports?business=${selectedBusinessSlug}`,
      signal:
        averagePaymentTiming > 0
          ? `+${averagePaymentTiming}d`
          : `${averagePaymentTiming}d`,
      tone: averagePaymentTiming > 0 ? "late" : "proof",
    });
  }

  if (totalRiskFlags === 0 && proofFlightRecorderTotal > 0) {
    patternRecognitionItems.push({
      label: "Proof Pattern",
      title: "Recent proof trail is clean",
      detail: "Recent sends, reminders, payments, and attachment checks are lining up without obvious proof gaps.",
      action: "Open activity",
      href: `/activity?business=${selectedBusinessSlug}`,
      signal: "Clean",
      tone: "proof",
    });
  }

  const visiblePatternRecognitionItems = patternRecognitionItems.slice(0, 4);
  const patternMemoryNodes = [
    {
      label: "Units",
      value: unitTurnoverPatterns.length,
      detail: "turnover rhythms",
      tone: "turnover",
    },
    {
      label: "Season",
      value: seasonalServicePatterns.length,
      detail: "recurring service windows",
      tone: "seasonal",
    },
    {
      label: "Billing",
      value: repeatedInvoiceAmountPattern?.count ?? 0,
      detail: "repeated invoice amounts",
      tone: "invoice",
    },
    {
      label: "Proof",
      value: proofFlightRecorderTotal,
      detail: "logged evidence events",
      tone: "proof",
    },
  ];
  const workflowMapNodes = [
    {
      label: "Queue",
      title: "Work enters Trimax",
      detail: `${activeQueueItems.length} active`,
      action: "Open Queue",
      href: `/queue?business=${selectedBusinessSlug}`,
      tone: "queue",
    },
    {
      label: "Schedule",
      title: "Plan the work",
      detail: `${scheduledQueueItems.length} scheduled`,
      action: "Open Schedule",
      href: `/schedule?business=${selectedBusinessSlug}`,
      tone: "schedule",
    },
    {
      label: "Estimate",
      title: "Price the job",
      detail: `${queueItemsNeedingEstimate.length} need estimate`,
      action: "Build Estimates",
      href: `/queue?business=${selectedBusinessSlug}&view=needs-estimate`,
      tone: "estimate",
    },
    {
      label: "Invoice",
      title: "Send the bill",
      detail: `${workingYearOpenInvoicesWithAmounts.length} open`,
      action: "Open Invoices",
      href: `/invoices?business=${selectedBusinessSlug}`,
      tone: "invoice",
    },
    {
      label: "Payment",
      title: "Match the check",
      detail: outstandingRevenue,
      action: "Match Payments",
      href: `/payments?${priorityPaymentParams.toString()}`,
      tone: "payment",
    },
    {
      label: "Proof",
      title: "Keep records ready",
      detail: `${totalRiskFlags} to check`,
      action: "Open Proof",
      href: `/activity?business=${selectedBusinessSlug}`,
      tone: "proof",
    },
  ];
  const topPriorityStackCandidates: {
    action: string;
    confidence: number;
    detail: string;
    href: string;
    label: string;
    metric: string;
    reason: string;
    score: number;
    tone: string;
  }[] = [];

  if (priorityInvoice) {
    const priorityInvoiceAmountDue = invoiceCollectionAmountDue(priorityInvoice);
    const priorityInvoiceDaysLate = daysPastDue(priorityInvoice.due_date) ?? -1;
    const isPriorityDeposit = hasActiveDepositRequest(priorityInvoice);

    topPriorityStackCandidates.push({
      action: isPriorityDeposit ? "Open deposit" : "Open invoice",
      confidence:
        priorityInvoiceDaysLate > 0
          ? 96
          : isPriorityDeposit
            ? 88
            : 74,
      detail:
        priorityInvoice.customer_name ??
        priorityInvoice.project_title ??
        "Customer balance",
      href: `/invoices/${priorityInvoice.id}?business=${selectedBusinessSlug}`,
      label:
        priorityInvoiceDaysLate > 0
          ? "Past-due collection"
          : isPriorityDeposit
            ? "Deposit follow-up"
            : "Largest open invoice",
      metric: formatMoney(priorityInvoiceAmountDue),
      reason:
        priorityInvoiceDaysLate > 0
          ? `${priorityInvoiceDaysLate} day${
              priorityInvoiceDaysLate === 1 ? "" : "s"
            } late and still collectible`
          : isPriorityDeposit
            ? "Active deposit request is still open"
            : "Highest unpaid balance in the current workspace",
      score:
        (priorityInvoiceDaysLate > 0 ? 900 : isPriorityDeposit ? 760 : 520) +
        Math.min(priorityInvoiceAmountDue / 100, 140),
      tone:
        priorityInvoiceDaysLate > 0
          ? "rose"
          : isPriorityDeposit
            ? "emerald"
            : "sky",
    });
  }

  if (readySoonUnscheduled[0]) {
    const item = readySoonUnscheduled[0];

    topPriorityStackCandidates.push({
      action: "Schedule",
      confidence: 91,
      detail: `${item.property || "Property"} - Unit ${
        maybeCanonicalApartmentUnitLabel(item.unit) || "-"
      }`,
      href: `/queue/${item.id}?business=${selectedBusinessSlug}`,
      label: "Ready unit waiting",
      metric: formatShortDate(item.ready_date),
      reason: "Paint due soon and no scheduled date is saved",
      score: 720,
      tone: "amber",
    });
  }

  if (queueItemsNeedingEstimate[0]) {
    const item = queueItemsNeedingEstimate[0];

    topPriorityStackCandidates.push({
      action: "Build estimate",
      confidence: 84,
      detail: `${item.property || "Property"} - Unit ${
        maybeCanonicalApartmentUnitLabel(item.unit) || "-"
      }`,
      href: `/queue/${item.id}?business=${selectedBusinessSlug}`,
      label: "Estimate needed",
      metric: String(queueItemsNeedingEstimate.length),
      reason: "Queue work cannot become billable until it is priced",
      score: 680,
      tone: "violet",
    });
  }

  if (totalRiskFlags > 0) {
    topPriorityStackCandidates.push({
      action: "Review proof",
      confidence: Math.min(98, 78 + totalRiskFlags * 4),
      detail: auditHealthDetail,
      href: `/activity?business=${selectedBusinessSlug}`,
      label: "Proof gap",
      metric: String(totalRiskFlags),
      reason: "Missing proof can slow follow-up, payment review, or audits",
      score: 640 + totalRiskFlags * 20,
      tone: "rose",
    });
  }

  if (workingYearOpenInvoicesWithAmounts.length > 0) {
    topPriorityStackCandidates.push({
      action: "Capture check",
      confidence: 69,
      detail: "Match incoming payments to the best open invoices.",
      href: `/payments?business=${selectedBusinessSlug}#check-capture`,
      label: "Payment matching",
      metric: String(workingYearOpenInvoicesWithAmounts.length),
      reason: "Open balances are ready for check-stub matching",
      score: 420,
      tone: "emerald",
    });
  }

  const topPriorityStack = topPriorityStackCandidates
    .sort((first, second) => second.score - first.score)
    .slice(0, 4);
  const leadingPriorityMove = topPriorityStack[0] ?? null;
  const priorityStackAverageConfidence =
    topPriorityStack.length > 0
      ? Math.round(
          topPriorityStack.reduce((total, item) => total + item.confidence, 0) /
            topPriorityStack.length,
        )
      : 0;
  const priorityStackSignal = leadingPriorityMove
    ? {
        confidence: priorityStackAverageConfidence,
        detail:
          topPriorityStack.length > 1
            ? `Trimax is ranking this above ${
                topPriorityStack.length - 1
              } other move${
                topPriorityStack.length === 2 ? "" : "s"
              } because ${
                leadingPriorityMove.reason.charAt(0).toLowerCase() +
                leadingPriorityMove.reason.slice(1)
              }.`
            : `Trimax is treating this as the clearest next move because ${
                leadingPriorityMove.reason.charAt(0).toLowerCase() +
                leadingPriorityMove.reason.slice(1)
              }.`,
        label:
          leadingPriorityMove.tone === "rose"
            ? "Cash risk"
            : leadingPriorityMove.tone === "amber"
              ? "Schedule pressure"
              : leadingPriorityMove.tone === "emerald"
                ? "Collection path"
                : leadingPriorityMove.tone === "violet"
                  ? "Pricing bottleneck"
                  : "Best next move",
        tone: leadingPriorityMove.tone,
      }
    : null;
  const intelligenceBriefItems: {
    label: string;
    title: string;
    detail: string;
    href: string;
    action: string;
    tone: string;
  }[] = [];

  if (pastDueInvoices.length > 0) {
    intelligenceBriefItems.push({
      label: "Cash",
      title: `${formatMoney(pastDueTotal)} is past due`,
      detail: `${pastDueInvoices.length} invoice${
        pastDueInvoices.length === 1 ? "" : "s"
      } should be handled before new billing work pulls attention away.`,
      href: `/invoices?business=${selectedBusinessSlug}&view=aging`,
      action: "Review aging",
      tone: "rose",
    });
  } else if (depositRequestInvoices.length > 0) {
    intelligenceBriefItems.push({
      label: "Cash",
      title: `${formatMoney(depositRequestTotal)} in active deposit requests`,
      detail: "Deposit requests are open and ready to follow up without marking the whole invoice paid.",
      href:
        depositRequestInvoices[0]?.id
          ? `/invoices/${depositRequestInvoices[0].id}?business=${selectedBusinessSlug}`
          : `/invoices?business=${selectedBusinessSlug}&collection=open`,
      action: "Open deposit",
      tone: "emerald",
    });
  } else {
    intelligenceBriefItems.push({
      label: "Cash",
      title: `${collectionRate}% of ${workingYearLabel} invoicing is paid`,
      detail:
        workingYearOpenInvoicesWithAmounts.length > 0
          ? `${workingYearOpenInvoicesWithAmounts.length} open balance${
              workingYearOpenInvoicesWithAmounts.length === 1 ? "" : "s"
            } still need payment attention.`
          : "No open invoice balance needs immediate collection attention.",
      href: `/payments?business=${selectedBusinessSlug}`,
      action: "Open payments",
      tone: "sky",
    });
  }

  if (readySoonUnscheduled.length > 0) {
    intelligenceBriefItems.push({
      label: "Queue",
      title: `${readySoonUnscheduled.length} due-soon unit${
        readySoonUnscheduled.length === 1 ? "" : "s"
      } not scheduled`,
      detail: "These are the queue items most likely to create a schedule scramble.",
      href: `/queue?business=${selectedBusinessSlug}&view=ready-soon`,
      action: "Schedule work",
      tone: "amber",
    });
  } else if (queueItemsNeedingEstimate.length > 0) {
    intelligenceBriefItems.push({
      label: "Queue",
      title: `${queueItemsNeedingEstimate.length} queue item${
        queueItemsNeedingEstimate.length === 1 ? "" : "s"
      } need estimates`,
      detail: "Estimate gaps block invoice creation, so this is the cleanest operational next step.",
      href: `/queue?business=${selectedBusinessSlug}&view=needs-estimate`,
      action: "Build estimates",
      tone: "violet",
    });
  } else {
    intelligenceBriefItems.push({
      label: "Queue",
      title: "Queue pressure is low",
      detail:
        activeQueueItems.length > 0
          ? `${activeQueueItems.length} active item${
              activeQueueItems.length === 1 ? "" : "s"
            } remain visible, with no urgent schedule gap detected.`
          : "No active queue work is asking for immediate attention.",
      href: `/queue?business=${selectedBusinessSlug}`,
      action: "Open queue",
      tone: "emerald",
    });
  }

  intelligenceBriefItems.push({
    label: "Proof",
    title: auditHealthLabel,
    detail: auditHealthDetail,
    href:
      totalRiskFlags > 0
        ? `/activity?business=${selectedBusinessSlug}`
        : `/reports?business=${selectedBusinessSlug}`,
    action: totalRiskFlags > 0 ? "Review proof" : "Open reports",
    tone: totalRiskFlags > 0 ? "rose" : "emerald",
  });
  const workflowMapStats = [
    {
      label: "Collection",
      value: `${collectionRate}% paid`,
      href: `/payments?${priorityPaymentParams.toString()}`,
      tone:
        collectionRate >= 90
          ? "emerald"
          : collectionRate >= 65
            ? "sky"
            : "amber",
    },
    {
      label: "Queue",
      value:
        readySoonUnscheduled.length > 0
          ? `${readySoonUnscheduled.length} ready soon`
          : `${activeQueueItems.length} active`,
      href: `/queue?business=${selectedBusinessSlug}`,
      tone:
        readySoonUnscheduled.length > 0
          ? "amber"
          : activeQueueItems.length > 0
            ? "sky"
            : "emerald",
    },
    {
      label: "Audit",
      value:
        totalRiskFlags === 0
          ? "clean"
          : `${totalRiskFlags} to check`,
      href: `/activity?business=${selectedBusinessSlug}`,
      tone: totalRiskFlags === 0 ? "emerald" : "rose",
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="dashboard-masthead flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="dashboard-masthead-kicker text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Dashboard
            </h1>

            <p className="mt-2 text-zinc-400">
              Operations overview for{" "}
              {selectedBusiness?.name ??
                "your business"}
              .
            </p>
          </div>

          <Link
            href={`/settings?business=${selectedBusinessSlug}`}
            className="dashboard-workspace-pill rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm transition hover:-translate-y-0.5 hover:border-sky-400/60"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Workspace
            </p>

            <p className="mt-1 font-semibold text-orange-300">
              {selectedBusiness?.name ?? "Trimax"}
            </p>
          </Link>
        </div>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          <section className="dashboard-mobile-priority lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="dashboard-mobile-priority-kicker dashboard-readable-label text-xs font-black uppercase tracking-[0.18em]">
                  Priority Rail
                </p>

                <h2 className="mt-1 text-lg font-black">
                  Start here
                </h2>
              </div>

              <Link
                href={`/reports?business=${selectedBusinessSlug}`}
                className="dashboard-mobile-priority-link rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-sky-100"
              >
                Reports
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {mobilePriorityItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  data-tone={item.tone}
                  className="dashboard-mobile-priority-card rounded-2xl border p-4 transition active:scale-[0.98]"
                >
                  <p className="text-xs font-black uppercase tracking-[0.14em]">
                    {item.label}
                  </p>

                  <p className="mt-2 truncate text-2xl font-black">
                    {item.value}
                  </p>

                  <p className="mt-1 text-xs font-semibold opacity-80">
                    {item.detail}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </RoleVisible>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={["property_manager"]}
        >
          <Card className="dashboard-property-team dark-surface overflow-hidden border-emerald-500/25 bg-gradient-to-br from-zinc-950 via-slate-950 to-zinc-900">
            <div className="dashboard-property-team-grid">
              <div>
                <p className="dashboard-property-team-kicker text-sm font-black uppercase tracking-[0.24em] text-emerald-200">
                  Property Team View
                </p>

                <h2 className="mt-3 text-3xl font-black tracking-tight text-white">
                  Queue and schedule at a glance
                </h2>

                <p className="mt-3 max-w-3xl text-zinc-300">
                  Property-team users see active units, ready dates, scheduled
                  work, and property reports here. Accounting tools stay
                  reserved for owner, admin, and accounting roles.
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href={`/queue?business=${selectedBusinessSlug}`}>
                    <Button>Open Queue</Button>
                  </Link>

                  <Link href={`/new-request?business=${selectedBusinessSlug}`}>
                    <Button variant="secondary">Add Queue Item</Button>
                  </Link>

                  <Link href={`/schedule?business=${selectedBusinessSlug}`}>
                    <Button variant="secondary">Open Schedule</Button>
                  </Link>
                </div>
              </div>

              <div className="dashboard-property-team-panel rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="grid grid-cols-2 gap-3">
                  {queueActionItems.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="dashboard-property-team-metric rounded-xl border border-white/10 bg-white/5 p-3 transition hover:-translate-y-0.5 hover:border-emerald-300/60"
                    >
                      <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-zinc-400">
                        {item.label}
                      </p>

                      <p className="mt-2 text-2xl font-black text-white">
                        {item.value}
                      </p>

                      <p className="mt-1 text-xs font-semibold text-zinc-300">
                        {item.detail}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="dashboard-property-handoff mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">
                    Morning Handoff
                  </p>

                  <h3 className="mt-1 text-xl font-black text-white">
                    What needs their attention next
                  </h3>
                </div>

                <Link
                  href={`/schedule?business=${selectedBusinessSlug}`}
                  className="rounded-full border border-white/10 px-3 py-2 text-xs font-black text-emerald-100 transition hover:border-emerald-300/60"
                >
                  Open Schedule
                </Link>
              </div>

              <div className="dashboard-property-handoff-lane mt-4">
                {propertyHandoffItems.length > 0 ? (
                  propertyHandoffItems.map((item, index) => (
                    <Link
                      key={item.id}
                      href={`/queue/${item.id}?business=${selectedBusinessSlug}`}
                      data-tone={item.tone}
                      className="dashboard-property-handoff-card"
                    >
                      <span className="dashboard-property-handoff-rank">
                        {index + 1}
                      </span>

                      <span className="min-w-0">
                        <strong>
                          {maybeCanonicalApartmentUnitLabel(item.unit) ??
                            item.unit ??
                            "Unit"}
                        </strong>
                        <em>{item.detail}</em>
                      </span>

                      <span className="dashboard-property-handoff-action">
                        {item.action}
                      </span>
                    </Link>
                  ))
                ) : (
                  <div className="dashboard-property-handoff-empty">
                    No active unit needs handoff attention right now.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                    Recent Queue Work
                  </p>

                  <p className="mt-1 text-sm text-zinc-300">
                    The latest units they can open and update.
                  </p>
                </div>

                <Link
                  href={`/queue?business=${selectedBusinessSlug}`}
                  className="rounded-full border border-white/10 px-3 py-2 text-xs font-black text-emerald-100 transition hover:border-emerald-300/60"
                >
                  View All
                </Link>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {recentQueueItems.length > 0 ? (
                  recentQueueItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/queue/${item.id}?business=${selectedBusinessSlug}`}
                      className="dashboard-property-team-item rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:-translate-y-0.5 hover:border-emerald-300/60"
                    >
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                        Unit{" "}
                        {maybeCanonicalApartmentUnitLabel(item.unit) ?? "-"}
                      </p>

                      <h3 className="mt-2 text-lg font-black text-white">
                        {item.property ?? "Property"}
                      </h3>

                      <p className="mt-1 text-sm text-zinc-300">
                        {item.paint_type ||
                          item.flooring ||
                          item.status ||
                          "Queue item"}
                      </p>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold text-zinc-300">
                        <span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                          Ready {formatShortDate(item.ready_date)}
                        </span>
                        <span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                          Scheduled {formatShortDate(item.scheduled_date)}
                        </span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-sm text-zinc-300 lg:col-span-3">
                    No queue items are active right now.
                  </div>
                )}
              </div>
            </div>
          </Card>
        </RoleVisible>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          <Card className="dashboard-hero-card dark-surface border-sky-500/30 bg-gradient-to-br from-zinc-900 to-zinc-950">
            <div className="dashboard-hero-hud mb-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.26em]">
                  Platinum Command Signal
                </p>

                <p className="mt-1 text-sm text-zinc-300">
                  {auditHealthLabel} for {selectedBusiness?.name ?? "Trimax"}.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <Link
                  href={`/activity?business=${selectedBusinessSlug}`}
                  className="dashboard-hero-signal rounded-xl border border-white/10 bg-black/20 px-3 py-2 transition hover:-translate-y-0.5 hover:border-sky-300/60"
                >
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-zinc-400">
                    Audit
                  </p>
                  <p className="mt-1 text-sm font-black text-white">
                    {totalRiskFlags} flag{totalRiskFlags === 1 ? "" : "s"}
                  </p>
                </Link>

                <Link
                  href={`/payments?business=${selectedBusinessSlug}`}
                  className="dashboard-hero-signal rounded-xl border border-white/10 bg-black/20 px-3 py-2 transition hover:-translate-y-0.5 hover:border-sky-300/60"
                >
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-zinc-400">
                    Collection
                  </p>
                  <p className="mt-1 text-sm font-black text-white">
                    {collectionRate}% paid
                  </p>
                </Link>

                <Link
                  href={`/queue?business=${selectedBusinessSlug}`}
                  className="dashboard-hero-signal rounded-xl border border-white/10 bg-black/20 px-3 py-2 transition hover:-translate-y-0.5 hover:border-sky-300/60"
                >
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-zinc-400">
                    Queue
                  </p>
                  <p className="mt-1 text-sm font-black text-white">
                    {activeQueueItems.length} active
                  </p>
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="dashboard-readable-label text-sm uppercase tracking-[0.3em]">
                  Open Revenue
                </p>

                <h2 className="mt-3 text-5xl font-black tracking-tight text-white">
                  {outstandingRevenue}
                </h2>

                <p className="mt-3 text-zinc-400">
                  Open invoices and active deposit requests, including imported
                  FreshBooks balances.
                </p>

                {historicalOpenInvoicesWithAmounts.length > 0 ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    {historicalOpenInvoicesWithAmounts.length} older open
                    invoice
                    {historicalOpenInvoicesWithAmounts.length === 1
                      ? ""
                      : "s"}{" "}
                    included in this dashboard total.
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <Link
                  href={`/invoices?business=${selectedBusinessSlug}&collection=open`}
                  className="dashboard-hero-signal rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:-translate-y-0.5 hover:border-sky-300/60"
                >
                  <p className="text-zinc-400">
                    Open Now
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    {workingYearOpenInvoicesWithAmounts.length}
                  </p>
                </Link>

                <Link
                  href={`/reports?business=${selectedBusinessSlug}#revenue-by-client`}
                  className="dashboard-hero-signal rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:-translate-y-0.5 hover:border-sky-300/60"
                >
                  <p className="text-zinc-400">
                    {workingYearLabel} Paid
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    {ytdRevenue}
                  </p>
                </Link>
              </div>
            </div>
          </Card>
        </RoleVisible>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          <Card className="dashboard-autopilot-brief dark-surface overflow-hidden border-sky-500/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-slate-950">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="dashboard-section-label text-sm uppercase tracking-[0.3em]">
                  Autopilot Brief
                </p>

                <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                  Trimax read the room
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                  A compact readout of the strongest cash, queue, and proof
                  signals in this workspace right now.
                </p>
              </div>

              <Link
                href={`/?business=${selectedBusinessSlug}#dashboard-accounting`}
                className="dashboard-autopilot-command rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-black text-sky-100 transition hover:border-sky-300 hover:bg-sky-400/15"
              >
                Open command center
              </Link>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {intelligenceBriefItems.map((item) => (
                <Link
                  key={`${item.label}-${item.title}`}
                  href={item.href}
                  data-tone={item.tone}
                  className="dashboard-autopilot-card rounded-2xl border p-4 transition hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.2em]">
                      {item.label}
                    </p>

                    <span className="dashboard-autopilot-pulse h-2.5 w-2.5 rounded-full" />
                  </div>

                  <h3 className="mt-4 text-lg font-black text-white">
                    {item.title}
                  </h3>

                  <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-300">
                    {item.detail}
                  </p>

                  <p className="mt-4 text-sm font-black">
                    {item.action}
                    <span aria-hidden="true"> &gt;</span>
                  </p>
                </Link>
              ))}
            </div>
          </Card>
        </RoleVisible>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          <Card
            id="dashboard-pattern-radar"
            className="dashboard-pattern-radar dark-surface scroll-mt-6 overflow-hidden border-sky-500/20 bg-zinc-950"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="dashboard-section-label text-sm uppercase tracking-[0.3em]">
                  Pattern Radar
                </p>

                <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                  Recurring patterns Trimax noticed
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                  Trimax watches for apartment turnover rhythm, seasonal service
                  calls, repeated work fingerprints, and the operational patterns
                  that can help you get ahead of the next request.
                </p>
              </div>

              <Link
                href={`/reports?business=${selectedBusinessSlug}`}
                className="dashboard-pattern-radar-link rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white transition hover:-translate-y-0.5 hover:border-sky-300/60"
              >
                Open reports
              </Link>
            </div>

            <div className="dashboard-memory-orbit mt-5">
              <div className="dashboard-memory-core">
                <span>Trimax</span>
                <strong>Pattern Memory</strong>
                <em>{visiblePatternRecognitionItems.length} active signals</em>
              </div>

              <div className="dashboard-memory-node-grid">
                {patternMemoryNodes.map((node) => (
                  <div
                    key={node.label}
                    data-tone={node.tone}
                    className="dashboard-memory-node"
                  >
                    <span>{node.label}</span>
                    <strong>{node.value}</strong>
                    <em>{node.detail}</em>
                  </div>
                ))}
              </div>
            </div>

            <div className="dashboard-pattern-radar-grid mt-5">
              {visiblePatternRecognitionItems.length > 0 ? (
                visiblePatternRecognitionItems.map((item) => (
                  <Link
                    key={`${item.label}-${item.title}`}
                    href={item.href}
                    data-tone={item.tone}
                    className="dashboard-pattern-card rounded-2xl border p-4 transition hover:-translate-y-0.5"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="dashboard-pattern-label block text-xs font-black uppercase tracking-[0.18em]">
                          {item.label}
                        </span>
                        <strong className="mt-2 block text-lg leading-6">
                          {item.title}
                        </strong>
                      </span>

                      <span className="dashboard-pattern-signal rounded-full border px-3 py-1 text-xs font-black">
                        {item.signal}
                      </span>
                    </span>

                    <span className="mt-3 block text-sm leading-6">
                      {item.detail}
                    </span>

                    <span className="dashboard-pattern-action mt-4 inline-flex items-center gap-2 text-sm font-black">
                      {item.action}
                      <span aria-hidden="true">-&gt;</span>
                    </span>
                  </Link>
                ))
              ) : (
                <div className="dashboard-pattern-empty rounded-2xl border border-dashed p-4 text-sm leading-6">
                  No strong pattern needs attention right now. Trimax will
                  surface one here when a unit, customer, service type, or
                  seasonal request starts repeating.
                </div>
              )}
            </div>
          </Card>
        </RoleVisible>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          <Card className="dashboard-workflow-map dark-surface overflow-hidden border-sky-500/20 bg-zinc-950">
            <div className="grid gap-6 xl:grid-cols-[0.72fr_1fr] xl:items-center">
              <div>
                <p className="dashboard-workflow-label dashboard-section-label text-sm uppercase tracking-[0.3em]">
                  Workflow Map
                </p>

                <h2 className="mt-2 text-3xl font-black tracking-tight text-white">
                  See the whole job-to-cash path
                </h2>

                <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-300">
                  A compact visual map of how Trimax moves work from queue
                  intake to scheduling, estimates, invoices, payment matching,
                  and proof records.
                </p>

                <div className="dashboard-workflow-stat-strip mt-5 grid gap-2 sm:grid-cols-3">
                  {workflowMapStats.map((stat) => (
                    <Link
                      key={stat.label}
                      href={stat.href}
                      data-tone={stat.tone}
                      className="dashboard-workflow-stat rounded-2xl border px-3 py-2 transition hover:-translate-y-0.5"
                    >
                      <span>{stat.label}</span>
                      <strong>{stat.value}</strong>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="dashboard-workflow-stage" aria-label="Trimax workflow map">
                <div className="dashboard-workflow-core">
                  <p>Trimax</p>
                  <span>Operations Core</span>
                </div>

                <div className="dashboard-workflow-orbit">
                  {workflowMapNodes.map((node) => (
                    <Link
                      key={node.label}
                      href={node.href}
                      data-tone={node.tone}
                      className="dashboard-workflow-node"
                    >
                      <span className="dashboard-workflow-node-label">
                        {node.label}
                      </span>
                      <strong>{node.title}</strong>
                      <span>{node.detail}</span>
                      <span className="dashboard-workflow-node-action">
                        {node.action} <span aria-hidden="true">-&gt;</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </RoleVisible>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          <section id="dashboard-focus" className="dashboard-focus-strip scroll-mt-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="dashboard-section-label text-sm uppercase tracking-[0.3em]">
                  Today&apos;s Focus
                </p>

                <h2 className="mt-1 text-2xl font-black tracking-tight">
                  Three moves worth your attention
                </h2>
              </div>

              <p className="max-w-xl text-sm leading-6 text-zinc-400">
                Trimax keeps the dashboard centered on the work that moves
                money, schedules, and customer follow-up forward.
              </p>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.72fr]">
              <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                {dashboardFocusItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    data-tone={item.tone}
                    className="dashboard-focus-card rounded-2xl border p-4 transition hover:-translate-y-0.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-[0.18em]">
                        {item.label}
                      </p>

                      <span className="dashboard-focus-metric rounded-full border px-3 py-1 text-sm font-black">
                        {item.metric}
                      </span>
                    </div>

                    <h3 className="mt-4 line-clamp-2 text-lg font-black">
                      {item.title}
                    </h3>

                    <p className="mt-2 line-clamp-3 text-sm leading-6">
                      {item.detail}
                    </p>
                  </Link>
                ))}
              </div>

              <div className="dashboard-priority-stack rounded-2xl border p-4">
                {leadingPriorityMove ? (
                  <Link
                    href={leadingPriorityMove.href}
                    data-tone={leadingPriorityMove.tone}
                    className="dashboard-next-best-move mb-3 block rounded-2xl border p-3 transition hover:-translate-y-0.5"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block text-xs font-black uppercase tracking-[0.2em]">
                          Trimax Command Signal
                        </span>
                        <strong className="mt-1 block text-lg">
                          {leadingPriorityMove.action}
                        </strong>
                      </span>

                      <span className="dashboard-next-best-confidence rounded-full border px-3 py-1 text-xs font-black">
                        {leadingPriorityMove.confidence}%
                      </span>
                    </span>

                    <span className="mt-2 block text-sm leading-5">
                      {leadingPriorityMove.reason}
                    </span>
                  </Link>
                ) : null}

                {priorityStackSignal ? (
                  <div
                    className="dashboard-priority-signal mb-4 rounded-2xl border p-3"
                    data-tone={priorityStackSignal.tone}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="dashboard-priority-signal-orb"
                        />
                        <span className="min-w-0">
                          <span className="dashboard-priority-signal-label block text-[0.65rem] font-black uppercase tracking-[0.18em]">
                            Mountain Signal
                          </span>
                          <strong className="mt-1 block truncate text-sm">
                            {priorityStackSignal.label}
                          </strong>
                        </span>
                      </span>

                      <span className="dashboard-priority-signal-confidence rounded-full border px-2.5 py-1 text-xs font-black">
                        {priorityStackSignal.confidence}% aligned
                      </span>
                    </div>

                    <p className="mt-3 text-xs leading-5">
                      {priorityStackSignal.detail}
                    </p>
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em]">
                      Priority Stack
                    </p>
                    <h3 className="mt-1 text-lg font-black">
                      Highest leverage first
                    </h3>
                  </div>

                  <span className="dashboard-priority-stack-count rounded-full border px-3 py-1 text-sm font-black">
                    {topPriorityStack.length}
                  </span>
                </div>

                <div className="mt-4 space-y-2.5">
                  {topPriorityStack.length > 0 ? (
                    topPriorityStack.map((item, index) => (
                      <Link
                        key={`${item.label}-${item.href}`}
                        href={item.href}
                        data-tone={item.tone}
                        className="dashboard-priority-stack-item group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border p-3 transition hover:-translate-y-0.5"
                      >
                        <span className="dashboard-priority-stack-rank grid h-9 w-9 place-items-center rounded-full text-sm font-black">
                          {index + 1}
                        </span>

                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black">
                            {item.label}
                          </span>
                          <span className="mt-0.5 block truncate text-xs font-semibold">
                            {item.detail}
                          </span>
                          <span className="dashboard-priority-stack-reason mt-1 block text-[0.68rem] font-bold">
                            {item.reason}
                          </span>
                          <span
                            className="dashboard-priority-confidence-track mt-2 block"
                            aria-label={`${item.confidence}% recommendation confidence`}
                          >
                            <span
                              className="dashboard-priority-confidence-fill block"
                              style={{ width: `${item.confidence}%` }}
                            />
                          </span>
                        </span>

                        <span className="text-right">
                          <span className="block text-sm font-black">
                            {item.metric}
                          </span>
                          <span className="dashboard-priority-stack-confidence mt-0.5 block text-[0.68rem] font-black">
                            {item.confidence}%
                          </span>
                          <span className="mt-0.5 block text-[0.68rem] font-black uppercase tracking-[0.12em]">
                            {item.action}
                          </span>
                        </span>
                      </Link>
                    ))
                  ) : (
                    <div className="dashboard-priority-stack-empty rounded-2xl border border-dashed p-4 text-sm leading-6">
                      Nothing is pressing right now. The workspace is clean and
                      ready for the next job, invoice, or payment.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </RoleVisible>

        <Card
          id="dashboard-queue"
          className="dashboard-queue-command dark-surface hidden scroll-mt-6 overflow-hidden border-sky-500/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950/20 lg:block"
        >
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr] xl:items-start">
            <div>
              <p className="dashboard-section-label text-sm uppercase tracking-[0.3em]">
                Queue Command
              </p>

              <h2 className="mt-2 text-3xl font-black tracking-tight text-white">
                {queueFocusHeadline}
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
                {queueFocusDetail} This keeps apartment turns visible without
                making the dashboard feel like a full queue page.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={`/queue?business=${selectedBusinessSlug}`}
                  className="rounded-full bg-sky-400 px-5 py-3 text-sm font-black text-zinc-950 shadow-lg shadow-sky-500/20 transition hover:-translate-y-0.5 hover:bg-sky-300"
                >
                  Open Queue
                </Link>

                <Link
                  href={`/new-request?business=${selectedBusinessSlug}`}
                  className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-sky-300/50 hover:bg-white/10"
                >
                  New Queue Item
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {queueActionItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  data-tone={item.tone}
                  className="dashboard-queue-command-card rounded-2xl border border-zinc-800 bg-black/30 p-4 transition hover:-translate-y-0.5 hover:border-sky-300/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-400">
                      {item.label}
                    </p>

                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black text-white">
                      {item.value}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-5 text-zinc-300">
                    {item.detail}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          {recentQueueItems.length > 0 ? (
            <div className="dashboard-queue-mini-list mt-5 grid gap-3 lg:grid-cols-3">
              {recentQueueItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/queue/${item.id}?business=${selectedBusinessSlug}`}
                  className="dashboard-feature-card dark-surface rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-sky-400/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">
                        {item.property || "Property"} - Unit{" "}
                        {maybeCanonicalApartmentUnitLabel(item.unit) || "-"}
                      </p>

                      <p className="mt-1 truncate text-sm text-zinc-400">
                        {item.paint_type || "Paint TBD"} /{" "}
                        {item.flooring || "Flooring TBD"}
                      </p>
                    </div>

                    <StatusBadge status={item.status || "Pending"} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300">
                      Due {formatShortDate(item.ready_date)}
                    </span>

                    <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300">
                      Scheduled {formatShortDate(item.scheduled_date)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : null}
        </Card>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          <Card
            id="dashboard-accounting"
            className="dashboard-command-center dark-surface scroll-mt-6 overflow-hidden border-sky-500/20 bg-zinc-950"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="dashboard-command-label text-sm uppercase tracking-[0.3em]">
                  Today&apos;s Command Center
                </p>

                <h2 className="mt-2 text-3xl font-black tracking-tight text-white">
                  The next best accounting moves
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                  Start with collection, reminders, check capture, or a new
                  invoice without hunting through the dashboard.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                <p className="text-zinc-400">Open revenue</p>
                <p className="mt-1 text-xl font-black text-white">
                  {outstandingRevenue}
                </p>
              </div>
            </div>

            <div className="dashboard-revenue-flow mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.2em]">
                    Money Flow
                  </p>

                  <h3 className="mt-1 text-lg font-black text-white">
                    Revenue status at a glance
                  </h3>
                </div>

                <Link
                  href={`/reports?business=${selectedBusinessSlug}#money-flow`}
                  className="dashboard-readable-link text-sm font-black transition"
                >
                  Open reports
                </Link>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-4">
                {revenueFlowItems.map((item) => (
                  <Link
                    key={item.label}
                    href={
                      item.tone === "late"
                        ? `/invoices?business=${selectedBusinessSlug}&view=aging`
                        : item.tone === "paid"
                          ? `/reports?business=${selectedBusinessSlug}`
                          : item.tone === "open"
                            ? `/payments?business=${selectedBusinessSlug}`
                            : `/invoices?business=${selectedBusinessSlug}`
                    }
                    data-tone={item.tone}
                    className="dashboard-revenue-flow-card rounded-2xl border p-4 transition hover:-translate-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-[0.16em]">
                        {item.label}
                      </p>

                      <span>{item.detail}</span>
                    </div>

                    <p className="mt-4 text-2xl font-black">
                      {formatMoney(item.value)}
                    </p>

                    <div className="dashboard-revenue-flow-track mt-4">
                      <span
                        className="dashboard-revenue-flow-bar"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  </Link>
                ))}
              </div>

              <div
                className="dashboard-cash-lane mt-4"
                aria-label="Cash position visual summary"
              >
                <div className="dashboard-cash-lane-track">
                  {cashLaneItems.map((item) => (
                    <span
                      key={item.label}
                      data-tone={item.tone}
                      className="dashboard-cash-lane-segment"
                      style={{ flexBasis: `${item.percent}%` }}
                      title={`${item.label}: ${formatMoney(item.value)}`}
                    />
                  ))}
                </div>

                <div className="dashboard-cash-lane-legend">
                  {cashLaneItems.map((item) => (
                    <Link
                      key={item.label}
                      href={
                        item.tone === "paid"
                          ? `/reports?business=${selectedBusinessSlug}`
                          : item.tone === "late"
                            ? `/invoices?business=${selectedBusinessSlug}&view=aging`
                            : item.tone === "deposit"
                              ? `/invoices?business=${selectedBusinessSlug}&collection=open`
                              : `/payments?business=${selectedBusinessSlug}`
                      }
                      data-tone={item.tone}
                    >
                      <span />
                      <strong>{item.label}</strong>
                      <em>{formatMoney(item.value)}</em>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {commandCenterItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  data-tone={item.tone}
                  className="dashboard-command-card group rounded-2xl border border-zinc-800 bg-black/30 p-4 transition hover:-translate-y-0.5 hover:border-sky-300/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="dashboard-readable-card-label text-xs font-black uppercase tracking-[0.24em]">
                      {item.label}
                    </p>

                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black text-white">
                      {item.metric}
                    </span>
                  </div>

                  <h3 className="mt-4 text-lg font-black text-white">
                    {item.title}
                  </h3>

                  <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-300">
                    {item.detail}
                  </p>

                  <p className="dashboard-readable-link mt-4 inline-flex items-center gap-2 text-sm font-black transition group-hover:text-white">
                    {item.action}
                    <span aria-hidden="true">&gt;</span>
                  </p>
                </Link>
              ))}
            </div>

            <div className="dashboard-proof-flight mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.24em]">
                    Proof Flight Recorder
                  </p>

                  <h3 className="mt-1 text-lg font-black text-white">
                    Every job-to-cash move leaves a trail
                  </h3>

                  <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-300">
                    Trimax does more than store invoices. It connects the work,
                    customer messages, reminders, payments, PDFs, and check
                    proof into one defensible record.
                  </p>
                </div>

                <Link
                  href={`/activity?business=${selectedBusinessSlug}`}
                  className="dashboard-proof-flight-total rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm transition hover:-translate-y-0.5 hover:border-cyan-300/60"
                >
                  <span>Tracked events</span>
                  <strong>{proofFlightRecorderTotal}</strong>
                  <em>{proofFlightRecorderWindowLabel}</em>
                </Link>
              </div>

              <div className="dashboard-proof-flight-line mt-5">
                {proofFlightRecorderSteps.map((step, index) => (
                  <Link
                    key={step.label}
                    href={step.href}
                    data-tone={step.tone}
                    className="dashboard-proof-flight-step"
                  >
                    <span className="dashboard-proof-flight-index">
                      {index + 1}
                    </span>
                    <span className="dashboard-proof-flight-copy">
                      <span>{step.label}</span>
                      <strong>{step.title}</strong>
                      <em>{step.detail}</em>
                    </span>
                    <span className="dashboard-proof-flight-count">
                      {step.value}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="dashboard-proof-strip mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.24em]">
                    Recent Activity
                  </p>

                  <h3 className="mt-1 text-lg font-black text-white">
                    Recent customer emails and payment records
                  </h3>
                </div>

                <Link
                  href={`/activity?business=${selectedBusinessSlug}`}
                  className="dashboard-readable-link text-sm font-black transition"
                >
                  Open activity
                </Link>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {communicationProofLogs.map((log) => (
                  <Link
                    key={log.id}
                    href={activityHref(log, selectedBusinessSlug)}
                    className="dashboard-proof-card rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5 hover:border-sky-300/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="dashboard-readable-card-label text-xs font-black uppercase tracking-[0.18em]">
                        {activityLabel(log.action)}
                      </p>

                      <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-black text-white">
                        {relativeTime(log.created_at)}
                      </span>
                    </div>

                    <p className="mt-3 line-clamp-1 font-black text-white">
                      {log.entity_label ?? "Workspace activity"}
                    </p>

                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-300">
                      {activityProofDetail(log)}
                    </p>
                  </Link>
                ))}

                {communicationProofLogs.length === 0 ? (
                  <p className="dashboard-proof-card rounded-2xl border border-dashed border-white/15 bg-black/20 p-4 text-sm leading-6 text-zinc-300 lg:col-span-3">
                    Send an invoice, estimate, reminder, deposit request, or
                    payment batch and Trimax will show the latest proof here.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="dashboard-risk-radar mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.24em]">
                    Records To Check
                  </p>

                  <h3 className="mt-1 text-lg font-black text-white">
                    {auditHealthLabel}
                  </h3>

                  <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-300">
                    {auditHealthDetail}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="dashboard-risk-health rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black text-white">
                    {totalRiskFlags} flag{totalRiskFlags === 1 ? "" : "s"}
                  </span>

                  <Link
                    href={`/activity?business=${selectedBusinessSlug}`}
                    className="dashboard-readable-link text-sm font-black transition"
                  >
                    Audit trail
                  </Link>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {riskRadarItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    data-tone={item.tone}
                    className="dashboard-risk-card rounded-2xl border border-white/10 bg-zinc-950/70 p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="dashboard-readable-card-label text-xs font-black uppercase tracking-[0.18em]">
                        {item.label}
                      </p>

                      <span className="dashboard-risk-count rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black text-white">
                        {item.value}
                      </span>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-zinc-300">
                      {item.detail}
                    </p>

                    <p className="dashboard-readable-link mt-3 text-sm font-black">
                      {item.action}
                      <span aria-hidden="true"> &gt;</span>
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </Card>

        </RoleVisible>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          {customerBalances.length > 0 ? (
            <Card className="dashboard-collection-targets dark-surface border-green-500/20 bg-green-500/5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-green-300">
                    Collection Targets
                  </p>

                  <h2 className="mt-2 text-2xl font-bold">
                    Customers with unpaid balances
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                    Active collection targets include imported FreshBooks
                    balances and deposit requests.
                  </p>
                </div>

                <Link href={`/payments?business=${selectedBusinessSlug}`}>
                  <Button variant="secondary">Open Payments</Button>
                </Link>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {customerBalances.map((customer) => {
                  const paymentParams = new URLSearchParams({
                    business: selectedBusinessSlug,
                    customer: customer.customerName,
                  });
                  const invoiceParams = new URLSearchParams({
                    business: selectedBusinessSlug,
                    customer: customer.customerName,
                    collection: "open",
                    year: workingYearLabel,
                  });

                  return (
                    <div
                      key={customer.customerName}
                      className="dashboard-collection-target-card rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <Link
                            href={`/invoices?${invoiceParams.toString()}`}
                            className="font-semibold text-white transition hover:text-green-300"
                          >
                            {customer.customerName}
                          </Link>
                          <p className="mt-1 text-sm text-zinc-500">
                            {customer.count} open invoice
                            {customer.count === 1 ? "" : "s"}
                          </p>
                        </div>

                        <p className="text-xl font-black text-green-300">
                          {formatMoney(customer.total)}
                        </p>
                      </div>

                      <p className="mt-3 text-sm text-zinc-400">
                        Oldest due date: {formatShortDate(customer.oldestDue)}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <Link
                          href={`/payments?${paymentParams.toString()}`}
                          className="rounded-full bg-green-400 px-4 py-2 text-sm font-black text-black transition hover:bg-green-300"
                        >
                          Record Payment
                        </Link>

                        <Link
                          href={`/invoices?${invoiceParams.toString()}`}
                          className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-orange-400 hover:text-orange-300"
                        >
                          View Invoices
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </RoleVisible>

        <section id="dashboard-workstream" className="dashboard-workstream-section scroll-mt-6">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="dashboard-section-label text-sm uppercase tracking-[0.3em]">
                Accounting Pulse
              </p>

              <h2 className="mt-1 text-2xl font-black tracking-tight">
                Recent invoice movement
              </h2>
            </div>

            <p className="max-w-2xl text-sm leading-6 text-zinc-400">
              The newest billable records stay close at hand so collection,
              reminders, printing, and payment entry are always one move away.
            </p>
          </div>

          <RoleVisible
            businessSlug={selectedBusinessSlug}
            allow={[
              "owner",
              "admin",
              "accountant",
            ]}
          >
            <Card className="dashboard-workstream-card">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                    Invoice Pulse
                  </p>

                  <h2 className="mt-2 text-2xl font-bold">
                    Recent Invoices
                  </h2>
                </div>

                <Link
                  href={`/invoices?business=${selectedBusinessSlug}`}
                  className="text-sm font-semibold text-orange-400"
                >
                  View all
                </Link>
              </div>

              <div className="mt-4 space-y-3">
                {recentBillableInvoices.map((invoice) => {
                    const amountDue = invoiceCollectionAmountDue(invoice);
                    const isDepositRequest = hasActiveDepositRequest(invoice);
                    const daysLate = daysPastDue(invoice.due_date);
                    const isLate =
                      amountDue > 0 &&
                      daysLate !== null &&
                      daysLate > 0;

                    const paymentParams = new URLSearchParams({
                      business: selectedBusinessSlug,
                      customer: invoice.customer_name ?? "",
                    });

                    return (
                      <div
                        key={invoice.id}
                        className="dashboard-feature-card dark-surface rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-orange-400">
                                {invoice.display_id ??
                                  "Invoice"}
                              </p>

                              <StatusBadge status={invoice.status || "Draft"} />

                              {isDepositRequest ? (
                                <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                                  Deposit request
                                </span>
                              ) : null}

                              {isLate ? (
                                <span className="rounded-full border border-pink-500/35 bg-pink-500/10 px-3 py-1 text-xs font-semibold text-pink-200">
                                  {daysLate} day
                                  {daysLate === 1 ? "" : "s"} late
                                </span>
                              ) : null}
                            </div>

                            <Link
                              href={`/invoices/${invoice.id}?business=${selectedBusinessSlug}`}
                              className="font-semibold transition hover:text-orange-300"
                            >
                              {invoice.project_title ||
                                "Untitled Invoice"}
                            </Link>

                            <p className="mt-1 text-sm text-zinc-400">
                              {invoice.customer_name ||
                                "Unknown Customer"}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="font-bold text-orange-400">
                              {formatMoney(amountDue)}
                            </p>

                            <p className="text-sm text-zinc-400">
                              {isDepositRequest
                                ? "Deposit Due"
                                : "Collection Due"}
                            </p>

                            <p className="mt-2 text-xs text-zinc-500">
                              Due {formatShortDate(invoice.due_date)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3 border-t border-zinc-800 pt-4">
                          <Link
                            href={`/invoices/${invoice.id}?business=${selectedBusinessSlug}`}
                            className="app-button-primary rounded-full px-4 py-2 text-sm font-black"
                          >
                            Open
                          </Link>

                          <Link
                            href={`/invoices/${invoice.id}/print?business=${selectedBusinessSlug}`}
                            className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-orange-400 hover:text-orange-300"
                          >
                            Print
                          </Link>

                          {amountDue > 0 ? (
                            <Link
                              href={`/payments?${paymentParams.toString()}`}
                              className="payment-action-button dashboard-payment-action rounded-full border px-4 py-2 text-sm font-semibold transition"
                            >
                              Record Payment
                            </Link>
                          ) : null}

                          {isLate ? (
                            <Link
                              href={`/invoices/${invoice.id}?business=${selectedBusinessSlug}#late-payment-reminder`}
                              className="rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-black text-rose-800 transition hover:border-rose-400 hover:bg-rose-100"
                            >
                              Send Reminder
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                {billableInvoices.length === 0 && (
                  <p className="text-sm text-zinc-400">
                    No invoices for this business yet.
                  </p>
                )}
              </div>
            </Card>
          </RoleVisible>
        </section>
      </div>
    </AppShell>
  );
}
