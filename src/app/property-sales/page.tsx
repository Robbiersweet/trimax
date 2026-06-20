import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type QueueItem = {
  id: string;
  property: string | null;
  unit: string | null;
  status: string | null;
  priority: string | null;
  paint_type: string | null;
  unit_layout: string | null;
  wall_paint_color: string | null;
  flooring: string | null;
  move_out_date: string | null;
  ready_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  smoked_in: boolean | null;
  prior_renovation: boolean | null;
  renovation_needed: boolean | null;
  notes: string | null;
  linked_estimate_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Estimate = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  estimate_amount: string | number | null;
  status: string | null;
  created_at: string | null;
};

type Invoice = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  created_at: string | null;
};

type JobSession = {
  id: string;
  property_name: string | null;
  unit_label: string | null;
  job_type: string | null;
  started_at: string | null;
  ended_at: string | null;
  total_minutes: number | null;
  invoice_id: string | null;
};

type PipelineStatus =
  | "New Request"
  | "Pending Estimate"
  | "Approved"
  | "Scheduled"
  | "In Progress"
  | "Completed"
  | "Invoiced";

type PipelineCard = QueueItem & {
  pipelineStatus: PipelineStatus;
};

const pipelineStatuses: PipelineStatus[] = [
  "New Request",
  "Pending Estimate",
  "Approved",
  "Scheduled",
  "In Progress",
  "Completed",
  "Invoiced",
];

const demoQueueItems: QueueItem[] = [
  {
    id: "demo-evergreen-a102",
    property: "Evergreen Apartments",
    unit: "A102",
    status: "new request",
    priority: "high",
    paint_type: "Full Repaint",
    unit_layout: "2x1",
    wall_paint_color: "Sherwin-Williams Agreeable Gray",
    flooring: "Keep vinyl, replace carpet",
    move_out_date: "2026-06-18",
    ready_date: "2026-06-21",
    scheduled_date: null,
    completed_date: null,
    smoked_in: true,
    prior_renovation: false,
    renovation_needed: false,
    notes: "Manager wants this unit turned first for a waiting tenant.",
    linked_estimate_id: null,
    created_at: "2026-06-18T09:00:00Z",
    updated_at: "2026-06-18T14:25:00Z",
  },
  {
    id: "demo-evergreen-b204",
    property: "Evergreen Apartments",
    unit: "B204",
    status: "pending estimate",
    priority: "normal",
    paint_type: "Touch Ups",
    unit_layout: "1x1",
    wall_paint_color: "Swiss Coffee",
    flooring: "Keep carpet",
    move_out_date: "2026-06-16",
    ready_date: "2026-06-20",
    scheduled_date: null,
    completed_date: null,
    smoked_in: false,
    prior_renovation: false,
    renovation_needed: false,
    notes: "Only bedroom and bath need paint. Photos pending.",
    linked_estimate_id: "demo-est-1",
    created_at: "2026-06-16T17:00:00Z",
    updated_at: "2026-06-19T08:10:00Z",
  },
  {
    id: "demo-evergreen-c118",
    property: "Evergreen Apartments",
    unit: "C118",
    status: "approved",
    priority: "normal",
    paint_type: "Classic Paint",
    unit_layout: "2x2",
    wall_paint_color: "Roman Column",
    flooring: "Replace carpet",
    move_out_date: "2026-06-12",
    ready_date: "2026-06-17",
    scheduled_date: null,
    completed_date: null,
    smoked_in: false,
    prior_renovation: true,
    renovation_needed: false,
    notes: "Approved by leasing office. Waiting for schedule slot.",
    linked_estimate_id: "demo-est-2",
    created_at: "2026-06-12T12:00:00Z",
    updated_at: "2026-06-19T16:30:00Z",
  },
  {
    id: "demo-evergreen-d305",
    property: "Evergreen Apartments",
    unit: "D305",
    status: "scheduled",
    priority: "normal",
    paint_type: "Full Repaint",
    unit_layout: "3x2",
    wall_paint_color: "Nebulous White",
    flooring: "Keep vinyl",
    move_out_date: "2026-06-10",
    ready_date: "2026-06-15",
    scheduled_date: "2026-06-22",
    completed_date: null,
    smoked_in: false,
    prior_renovation: false,
    renovation_needed: false,
    notes: "Scheduled for Monday morning. Materials staged.",
    linked_estimate_id: "demo-est-3",
    created_at: "2026-06-10T08:30:00Z",
    updated_at: "2026-06-20T09:15:00Z",
  },
  {
    id: "demo-evergreen-e210",
    property: "Evergreen Apartments",
    unit: "E210",
    status: "in progress",
    priority: "normal",
    paint_type: "Full Repaint",
    unit_layout: "2x2",
    wall_paint_color: "Agreeable Gray",
    flooring: "Replace carpet",
    move_out_date: "2026-06-07",
    ready_date: "2026-06-13",
    scheduled_date: "2026-06-19",
    completed_date: null,
    smoked_in: true,
    prior_renovation: false,
    renovation_needed: true,
    notes: "Heavy prep. Primer approved before finish coat.",
    linked_estimate_id: "demo-est-4",
    created_at: "2026-06-07T10:20:00Z",
    updated_at: "2026-06-20T15:40:00Z",
  },
  {
    id: "demo-evergreen-f009",
    property: "Evergreen Apartments",
    unit: "F009",
    status: "completed",
    priority: "normal",
    paint_type: "Classic Paint",
    unit_layout: "1x1",
    wall_paint_color: "Roman Column",
    flooring: "Keep carpet",
    move_out_date: "2026-06-01",
    ready_date: "2026-06-04",
    scheduled_date: "2026-06-05",
    completed_date: "2026-06-06",
    smoked_in: false,
    prior_renovation: false,
    renovation_needed: false,
    notes: "Completed and ready for final office walk.",
    linked_estimate_id: "demo-est-5",
    created_at: "2026-06-01T09:00:00Z",
    updated_at: "2026-06-06T17:00:00Z",
  },
  {
    id: "demo-evergreen-g404",
    property: "Evergreen Apartments",
    unit: "G404",
    status: "invoiced",
    priority: "normal",
    paint_type: "Full Repaint",
    unit_layout: "2x1",
    wall_paint_color: "Greek Villa",
    flooring: "Replace carpet",
    move_out_date: "2026-05-24",
    ready_date: "2026-05-28",
    scheduled_date: "2026-05-29",
    completed_date: "2026-06-01",
    smoked_in: false,
    prior_renovation: false,
    renovation_needed: false,
    notes: "Invoice sent with completion photos ready for manager review.",
    linked_estimate_id: "demo-est-6",
    created_at: "2026-05-24T09:00:00Z",
    updated_at: "2026-06-02T12:00:00Z",
  },
];

const demoEstimates: Estimate[] = [
  {
    id: "demo-est-1",
    display_id: "EST-9101",
    customer_name: "Evergreen Apartments",
    project_title: "Evergreen Apartments - Unit B204",
    estimate_amount: 725,
    status: "sent",
    created_at: "2026-06-19T08:20:00Z",
  },
  {
    id: "demo-est-2",
    display_id: "EST-9102",
    customer_name: "Evergreen Apartments",
    project_title: "Evergreen Apartments - Unit C118",
    estimate_amount: 1099,
    status: "approved",
    created_at: "2026-06-19T16:20:00Z",
  },
];

const demoInvoices: Invoice[] = [
  {
    id: "demo-inv-1",
    display_id: "INV-9104",
    customer_name: "Evergreen Apartments",
    project_title: "Evergreen Apartments - Unit G404",
    invoice_amount: 1295,
    amount_paid: 0,
    status: "sent",
    issue_date: "2026-06-02",
    due_date: "2026-07-02",
    created_at: "2026-06-02T12:00:00Z",
  },
  {
    id: "demo-inv-2",
    display_id: "INV-9098",
    customer_name: "Evergreen Apartments",
    project_title: "Evergreen Apartments - Unit F009",
    invoice_amount: 925,
    amount_paid: 925,
    status: "paid",
    issue_date: "2026-06-06",
    due_date: "2026-07-06",
    created_at: "2026-06-06T18:00:00Z",
  },
];

const demoSessions: JobSession[] = [
  {
    id: "demo-session-1",
    property_name: "Evergreen Apartments",
    unit_label: "G404",
    job_type: "Full Repaint",
    started_at: "2026-05-29T15:00:00Z",
    ended_at: "2026-06-01T23:00:00Z",
    total_minutes: 840,
    invoice_id: "demo-inv-1",
  },
  {
    id: "demo-session-2",
    property_name: "Evergreen Apartments",
    unit_label: "F009",
    job_type: "Classic Paint",
    started_at: "2026-06-05T15:00:00Z",
    ended_at: "2026-06-06T20:00:00Z",
    total_minutes: 360,
    invoice_id: "demo-inv-2",
  },
];

function propertySlugToLabel(value: string | undefined) {
  if (!value) {
    return "North Creek Apartments";
  }

  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function propertyLabelToSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseMoney(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number(String(value).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function monthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function daysBetween(start: string | null, end: string | null) {
  if (!start || !end) {
    return null;
  }

  const startDate = new Date(start).getTime();
  const endDate = new Date(end).getTime();

  if (!Number.isFinite(startDate) || !Number.isFinite(endDate) || endDate < startDate) {
    return null;
  }

  return Math.round((endDate - startDate) / 86400000);
}

function minutesToHours(minutes: number) {
  if (!minutes) {
    return "No labor data";
  }

  return `${(minutes / 60).toFixed(minutes >= 600 ? 1 : 2)} hrs`;
}

function statusForQueueItem(item: QueueItem): PipelineStatus {
  const status = (item.status || "").toLowerCase();

  if (status.includes("invoice") || status.includes("paid")) {
    return "Invoiced";
  }

  if (status.includes("complete")) {
    return "Completed";
  }

  if (status.includes("progress") || status.includes("started")) {
    return "In Progress";
  }

  if (status.includes("schedule") || item.scheduled_date) {
    return "Scheduled";
  }

  if (status.includes("approved")) {
    return "Approved";
  }

  if (status.includes("estimate") || !item.linked_estimate_id) {
    return "Pending Estimate";
  }

  return "New Request";
}

function normalizeText(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function matchesPropertyName(
  itemValue: string | null | undefined,
  propertyLabel: string
) {
  const itemText = normalizeText(itemValue);
  const labelText = normalizeText(propertyLabel);

  if (!itemText || !labelText) {
    return false;
  }

  return itemText === labelText || itemText.includes(labelText);
}

function unitMatchesDocument(unit: string | null, title: string | null) {
  if (!unit || !title) {
    return false;
  }

  return title.toLowerCase().includes(unit.toLowerCase());
}

function extractUnitLabelFromTitle(title: string | null | undefined) {
  if (!title) {
    return null;
  }

  const explicitUnit = title.match(/\bunit\s+([a-z]?\d{2,4}[a-z]?)\b/i);

  if (explicitUnit?.[1]) {
    return explicitUnit[1].toUpperCase();
  }

  const compactUnit = title.match(/\b([a-z]\d{2,4}[a-z]?)\b/i);
  return compactUnit?.[1]?.toUpperCase() ?? null;
}

function notesPreview(value: string | null | undefined) {
  if (!value?.trim()) {
    return "No notes yet.";
  }

  return value.trim().length > 96 ? `${value.trim().slice(0, 96)}...` : value.trim();
}

async function loadBusiness(businessSlug: string) {
  const { data } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .maybeSingle();

  return data as Business | null;
}

async function loadLivePropertyData(
  business: Business,
  propertyLabel: string
) {
  const [queueResult, estimateResult, invoiceResult, sessionResult] =
    await Promise.all([
      supabase
        .from("queue_items")
        .select(
          "id, property, unit, status, priority, paint_type, unit_layout, wall_paint_color, flooring, move_out_date, ready_date, scheduled_date, completed_date, smoked_in, prior_renovation, renovation_needed, notes, linked_estimate_id, created_at, updated_at"
        )
        .eq("business_id", business.id)
        .ilike("property", `%${propertyLabel}%`)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(120),
      supabase
        .from("estimates")
        .select(
          "id, display_id, customer_name, project_title, estimate_amount, status, created_at"
        )
        .eq("business_id", business.id)
        .ilike("customer_name", `%${propertyLabel}%`)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("invoices")
        .select(
          "id, display_id, customer_name, project_title, invoice_amount, amount_paid, status, issue_date, due_date, created_at"
        )
        .eq("business_id", business.id)
        .ilike("customer_name", `%${propertyLabel}%`)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("job_sessions")
        .select(
          "id, property_name, unit_label, job_type, started_at, ended_at, total_minutes, invoice_id"
        )
        .eq("business_id", business.id)
        .ilike("property_name", `%${propertyLabel}%`)
        .order("started_at", { ascending: false })
        .limit(80),
    ]);

  return {
    queueItems: ((queueResult.data ?? []) as QueueItem[]).filter((item) =>
      matchesPropertyName(item.property, propertyLabel)
    ),
    estimates: ((estimateResult.data ?? []) as Estimate[]).filter((estimate) =>
      matchesPropertyName(estimate.customer_name, propertyLabel)
    ),
    invoices: ((invoiceResult.data ?? []) as Invoice[]).filter((invoice) =>
      matchesPropertyName(invoice.customer_name, propertyLabel)
    ),
    sessions: ((sessionResult.data ?? []) as JobSession[]).filter((session) =>
      matchesPropertyName(session.property_name, propertyLabel)
    ),
    hasSessionTable: !sessionResult.error,
  };
}

function buildPropertyOptions(queueItems: QueueItem[], currentProperty: string) {
  const names = new Set<string>();
  names.add(currentProperty);

  for (const item of queueItems) {
    if (item.property?.trim()) {
      names.add(item.property.trim());
    }
  }

  return Array.from(names).sort((left, right) => left.localeCompare(right));
}

function buildUnitHistory(
  queueItems: QueueItem[],
  estimates: Estimate[],
  invoices: Invoice[],
  sessions: JobSession[]
) {
  const units = new Map<string, QueueItem[]>();

  for (const item of queueItems) {
    const unit = item.unit?.trim();

    if (!unit) {
      continue;
    }

    const existing = units.get(unit) ?? [];
    existing.push(item);
    units.set(unit, existing);
  }

  return Array.from(units.entries())
    .map(([unit, items]) => {
      const sortedItems = [...items].sort((left, right) => {
        const leftTime = new Date(left.updated_at ?? left.created_at ?? 0).getTime();
        const rightTime = new Date(right.updated_at ?? right.created_at ?? 0).getTime();
        return rightTime - leftTime;
      });
      const latest = sortedItems[0];
      const unitEstimates = estimates.filter((estimate) =>
        unitMatchesDocument(unit, estimate.project_title)
      );
      const unitInvoices = invoices.filter((invoice) =>
        unitMatchesDocument(unit, invoice.project_title)
      );
      const unitSessions = sessions.filter(
        (session) => normalizeText(session.unit_label) === normalizeText(unit)
      );
      const totalMinutes = unitSessions.reduce(
        (total, session) => total + (session.total_minutes ?? 0),
        0
      );

      return {
        unit,
        latest,
        estimate: unitEstimates[0] ?? null,
        invoice: unitInvoices[0] ?? null,
        sessionCount: unitSessions.length,
        totalMinutes,
      };
    })
    .sort((left, right) => {
      const leftTime = new Date(
        left.latest.updated_at ?? left.latest.created_at ?? 0
      ).getTime();
      const rightTime = new Date(
        right.latest.updated_at ?? right.latest.created_at ?? 0
      ).getTime();
      return rightTime - leftTime;
    });
}

export default async function PropertySalesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    property?: string;
    demo?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const isDemo = resolvedSearchParams.demo === "evergreen";
  const propertyLabel = isDemo
    ? "Evergreen Apartments"
    : propertySlugToLabel(resolvedSearchParams.property);

  const business = await loadBusiness(businessSlug);
  const liveData =
    !isDemo && business
      ? await loadLivePropertyData(business, propertyLabel)
      : null;

  const queueItems = isDemo ? demoQueueItems : liveData?.queueItems ?? [];
  const estimates = isDemo ? demoEstimates : liveData?.estimates ?? [];
  const invoices = isDemo ? demoInvoices : liveData?.invoices ?? [];
  const sessions = isDemo ? demoSessions : liveData?.sessions ?? [];

  const pipelineCards: PipelineCard[] = queueItems.map((item) => ({
    ...item,
    pipelineStatus: statusForQueueItem(item),
  }));
  const currentMonth = monthKey(new Date());
  const completedThisMonth = queueItems.filter(
    (item) =>
      item.completed_date &&
      monthKey(new Date(item.completed_date)) === currentMonth
  );
  const openRequests = pipelineCards.filter(
    (item) =>
      item.pipelineStatus !== "Completed" && item.pipelineStatus !== "Invoiced"
  );
  const pendingEstimateCount = pipelineCards.filter(
    (item) => item.pipelineStatus === "Pending Estimate"
  ).length;
  const approvedScheduledCount = pipelineCards.filter(
    (item) =>
      item.pipelineStatus === "Approved" || item.pipelineStatus === "Scheduled"
  ).length;
  const inProgressCount = pipelineCards.filter(
    (item) => item.pipelineStatus === "In Progress"
  ).length;
  const completionDays = completedThisMonth
    .map((item) => daysBetween(item.ready_date ?? item.move_out_date, item.completed_date))
    .filter((value): value is number => value !== null);
  const averageCompletionDays =
    completionDays.length > 0
      ? completionDays.reduce((total, value) => total + value, 0) /
        completionDays.length
      : null;
  const billedThisMonth = invoices
    .filter((invoice) => {
      const dateValue = invoice.issue_date ?? invoice.created_at;
      return dateValue && monthKey(new Date(dateValue)) === currentMonth;
    })
    .reduce((total, invoice) => total + parseMoney(invoice.invoice_amount), 0);
  const totalLaborMinutes = sessions.reduce(
    (total, session) => total + (session.total_minutes ?? 0),
    0
  );
  const revenuePerLaborHour =
    totalLaborMinutes > 0
      ? invoices.reduce(
          (total, invoice) => total + parseMoney(invoice.invoice_amount),
          0
        ) /
        (totalLaborMinutes / 60)
      : null;
  const unitHistory = buildUnitHistory(queueItems, estimates, invoices, sessions);
  const propertyOptions = buildPropertyOptions(queueItems, propertyLabel);
  const propertySlug = propertyLabelToSlug(propertyLabel);
  const hasBillingWithoutTurnPipeline =
    !isDemo && pipelineCards.length === 0 && invoices.length > 0;
  const hasNoTurnPipeline = pipelineCards.length === 0;
  const noPipelineMessage = hasBillingWithoutTurnPipeline
    ? "New queue requests will appear here as soon as management adds units for this property. Existing invoice totals still stay in the overview so sales and billing stay honest."
    : "New queue requests will appear here as soon as management adds units for this property.";
  const recentBillingSignals = invoices.slice(0, 4).map((invoice) => ({
    id: invoice.id,
    displayId: invoice.display_id ?? "Invoice",
    unitLabel: extractUnitLabelFromTitle(invoice.project_title),
    amount: parseMoney(invoice.invoice_amount),
    status: invoice.status ?? "invoice",
    date: invoice.issue_date ?? invoice.created_at,
  }));
  const salesConfidenceCards = [
    {
      label: "Live Visibility",
      title: "Managers see every turn without chasing texts",
      detail:
        openRequests.length > 0
          ? `${openRequests.length} open turn ${openRequests.length === 1 ? "request is" : "requests are"} visible from request to billing.`
          : "New turn requests will appear here as soon as the property starts using the workflow.",
    },
    {
      label: "Proof Ready",
      title: "Photos, notes, estimates, invoices, and labor stay together",
      detail:
        unitHistory.length > 0
          ? `${unitHistory.length} unit ${unitHistory.length === 1 ? "record is" : "records are"} building property memory for future calls.`
          : "The dashboard is ready to build unit memory as jobs move through Trimax.",
    },
    {
      label: "Fast Decisions",
      title: "Pricing and scheduling gaps are obvious",
      detail:
        pendingEstimateCount > 0
          ? `${pendingEstimateCount} ${pendingEstimateCount === 1 ? "request needs" : "requests need"} pricing before work can become billable.`
          : "No pricing bottleneck is visible for this property right now.",
    },
  ];
  const showcaseServices = [
    "Apartment Turns",
    "Interior Paint",
    "Fence Work",
    "Tree Work",
    "Outlet Repairs",
    "Proof Packets",
  ];
  const meetingDemoSteps = [
    {
      step: "1",
      title: "Show the pipeline",
      detail:
        "Walk through open requests, estimates, schedule status, active work, completed turns, and invoices from one property screen.",
    },
    {
      step: "2",
      title: "Open a unit memory",
      detail:
        "Point to paint color, notes, prior estimates, invoices, labor history, and photo placeholders so managers see proof staying attached.",
    },
    {
      step: "3",
      title: "Close with follow-up",
      detail:
        "Show how Trimax keeps next steps visible: reminders, payment proof, missing records, and the exact work R&L owns next.",
    },
  ];
  const managerProofPoints = [
    {
      label: "Status Proof",
      value:
        pipelineCards.length > 0
          ? `${pipelineCards.length} tracked turns`
          : invoices.length > 0
            ? `${invoices.length} billing records`
            : "Demo ready",
      detail:
        pipelineCards.length > 0
          ? "Each unit is visible from request to invoice."
          : invoices.length > 0
            ? "Billing is visible even before new queue work arrives."
            : "Use Evergreen mode to show a full sample pipeline.",
    },
    {
      label: "Response Proof",
      value:
        pendingEstimateCount > 0
          ? `${pendingEstimateCount} need pricing`
          : "No pricing backlog",
      detail:
        pendingEstimateCount > 0
          ? "Managers can see what needs a price before it can move."
          : "Nothing obvious is waiting on an estimate right now.",
    },
    {
      label: "Memory Proof",
      value:
        unitHistory.length > 0
          ? `${unitHistory.length} unit memories`
          : "Ready to remember",
      detail:
        unitHistory.length > 0
          ? "Prior colors, notes, invoices, and labor can be recalled."
          : "Unit history starts building as work moves through Trimax.",
    },
  ];

  const overviewCards = [
    {
      label: "Open Turns",
      value: String(openRequests.length),
      detail: "Units still moving through the turn pipeline",
    },
    {
      label: "Need Estimate",
      value: String(pendingEstimateCount),
      detail: "Requests not priced yet",
    },
    {
      label: "Approved / Scheduled",
      value: String(approvedScheduledCount),
      detail: "Ready for calendar or already on it",
    },
    {
      label: "In Progress",
      value: String(inProgressCount),
      detail: "Work actively moving",
    },
    {
      label: "Done This Month",
      value: String(completedThisMonth.length),
      detail: "Completed turns this month",
    },
    {
      label: "Avg Turn Time",
      value:
        averageCompletionDays === null
          ? "Learning"
          : `${averageCompletionDays.toFixed(1)} days`,
      detail: "Ready date to completed date",
    },
    {
      label: "Billed This Month",
      value: billedThisMonth ? formatMoney(billedThisMonth) : "No invoice data",
      detail: "Scoped to this property",
    },
    {
      label: "Revenue / Labor Hr",
      value:
        revenuePerLaborHour === null
          ? "Needs sessions"
          : formatMoney(revenuePerLaborHour),
      detail: "Invoice total compared to saved labor time",
    },
  ];

  return (
    <AppShell>
      <div className="property-sales-page space-y-6">
        <section className="property-sales-hero dark-surface rounded-3xl border border-sky-500/25 bg-gradient-to-br from-zinc-950 via-slate-950 to-cyan-950/30 p-5 shadow-2xl sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <p className="dashboard-readable-label text-sm font-black uppercase tracking-[0.26em]">
                Property Sales Dashboard
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
                {propertyLabel}
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-zinc-300">
                A manager-friendly view of every apartment turn, estimate,
                schedule move, invoice, and property history R&L can show during
                sales conversations.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-72 lg:grid-cols-1">
              <Link
                href={`/property-sales?business=${businessSlug}&property=${propertySlug}`}
                className={`rounded-2xl border px-4 py-3 text-sm font-black transition hover:-translate-y-0.5 ${
                  isDemo
                    ? "border-white/10 bg-white/5 text-sky-100 hover:border-sky-300/60"
                    : "border-sky-400/50 bg-sky-400/15 text-white"
                }`}
              >
                Live {propertyLabel === "Evergreen Apartments" ? "Property" : propertyLabel}
              </Link>
              <Link
                href={`/property-sales?business=${businessSlug}&demo=evergreen`}
                className={`rounded-2xl border px-4 py-3 text-sm font-black transition hover:-translate-y-0.5 ${
                  isDemo
                    ? "border-emerald-300/60 bg-emerald-400/15 text-white"
                    : "border-white/10 bg-white/5 text-emerald-100 hover:border-emerald-300/60"
                }`}
              >
                Demo Mode: Evergreen
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {overviewCards.map((card) => (
              <div
                key={card.label}
                className="property-sales-metric rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-100">
                  {card.label}
                </p>
                <p className="mt-3 text-3xl font-black text-white">{card.value}</p>
                <p className="mt-2 text-sm leading-5 text-zinc-400">{card.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <Card className="property-sales-client-command dark-surface border-cyan-500/20 bg-zinc-950">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:items-center">
            <div>
              <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.24em]">
                Contract Winning View
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-white">
                Sell organization, not just labor
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                Use this screen in a meeting to show how R&L turns any property
                request into a visible process: request, estimate, schedule,
                progress, proof, invoice, and payment follow-up.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {showcaseServices.map((service) => (
                  <span
                    key={service}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-zinc-100"
                  >
                    {service}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {salesConfidenceCards.map((card) => (
                <div
                  key={card.label}
                  className="property-sales-confidence-card rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.2em]">
                    {card.label}
                  </p>
                  <h3 className="mt-3 text-lg font-black text-white">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    {card.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="property-sales-meeting-strip mt-5 rounded-3xl border border-cyan-400/20 bg-black/20 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.22em]">
                  Meeting Mode
                </p>
                <h3 className="mt-2 text-2xl font-black text-white">
                  Three-minute walkthrough for prospects
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                  Use this as your sales script: show the manager what they get
                  before they ever ask for a status update, invoice copy, paint
                  color, or proof photo.
                </p>
              </div>
              <Link
                href={`/property-sales?business=${businessSlug}&demo=evergreen`}
                className="inline-flex items-center justify-center rounded-2xl border border-cyan-300/40 bg-cyan-400/10 px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:border-cyan-200"
              >
                Open Private Demo
              </Link>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {meetingDemoSteps.map((step) => (
                <div
                  key={step.title}
                  className="property-sales-meeting-step rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/10 text-sm font-black text-white">
                    {step.step}
                  </span>
                  <h4 className="mt-3 text-base font-black text-white">
                    {step.title}
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    {step.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card className="dark-surface property-sales-selector border-sky-500/20 bg-zinc-950">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.24em]">
                  Property Overview
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  Show managers exactly where every turn stands
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                  This page uses property-scoped reads and capped history lists
                  so sales demos stay fast without exposing unrelated customer data.
                </p>
              </div>

              <Link
                href={`/queue?business=${businessSlug}`}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:border-sky-300/60"
              >
                Open Work Queue
              </Link>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {propertyOptions.slice(0, 6).map((option) => (
                <Link
                  key={option}
                  href={`/property-sales?business=${businessSlug}&property=${propertyLabelToSlug(option)}`}
                  className={`rounded-full border px-3 py-2 text-xs font-black ${
                    option === propertyLabel && !isDemo
                      ? "border-sky-300/70 bg-sky-400/15 text-white"
                      : "border-white/10 bg-white/5 text-zinc-200"
                  }`}
                >
                  {option}
                </Link>
              ))}
              <Link
                href={`/property-sales?business=${businessSlug}&demo=evergreen`}
                className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-100"
              >
                Evergreen demo
              </Link>
            </div>

            {hasBillingWithoutTurnPipeline ? (
              <div className="property-sales-scope-note mt-5 rounded-2xl border p-4">
                <p className="text-sm font-black text-white">
                  Billing is visible, but no active turn cards are linked yet.
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Trimax found invoices for this property, while the turn pipeline
                  is waiting for queue items tied to this same property. This keeps
                  imported billing from being mistaken for active apartment turns.
                </p>
              </div>
            ) : null}
          </Card>

          <Card className="dark-surface border-emerald-500/20 bg-emerald-500/5">
            <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.24em]">
              Sales Proof
            </p>
            <h2 className="mt-2 text-xl font-black text-white">
              Apartment managers see the process
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Every card answers the manager question: what is open, what is
              priced, what is scheduled, what is done, and what has been billed?
            </p>
            <div className="mt-4 grid gap-3">
              {managerProofPoints.map((point) => (
                <div
                  key={point.label}
                  className="property-sales-proof-point rounded-2xl border border-white/10 bg-black/20 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.18em]">
                      {point.label}
                    </p>
                    <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-black text-white">
                      {point.value}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    {point.detail}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <Card className="dark-surface property-sales-pipeline overflow-hidden border-sky-500/20 bg-zinc-950">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.24em]">
                Unit Turn Pipeline
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                From move-out to invoice
              </h2>
            </div>
            <p className="text-sm font-bold text-zinc-400">
              {pipelineCards.length} turn cards
            </p>
          </div>

          {hasNoTurnPipeline ? (
            <div className="property-sales-empty-board mt-5 rounded-3xl border p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.22em]">
                    Live Pipeline Status
                  </p>
                  <h3 className="mt-2 text-xl font-black text-white">
                    No active turn records are linked to {propertyLabel} yet
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                    {noPipelineMessage}
                  </p>
                </div>
                <Link
                  href={`/queue?business=${businessSlug}`}
                  className="rounded-2xl border border-sky-300/40 bg-sky-400/15 px-4 py-3 text-center text-sm font-black text-white transition hover:-translate-y-0.5"
                >
                  Open Queue
                </Link>
              </div>

              {recentBillingSignals.length > 0 ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {recentBillingSignals.map((signal) => (
                    <Link
                      key={signal.id}
                      href={`/invoices/${signal.id}?business=${businessSlug}`}
                      className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 transition hover:-translate-y-0.5 hover:border-emerald-200/60"
                    >
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100">
                        Billing Signal
                      </p>
                      <h4 className="mt-2 text-lg font-black text-white">
                        {signal.displayId}
                      </h4>
                      <p className="mt-1 text-sm text-zinc-300">
                        {signal.unitLabel
                          ? `Unit ${signal.unitLabel}`
                          : propertyLabel}
                      </p>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <p className="text-xl font-black text-emerald-100">
                          {formatMoney(signal.amount)}
                        </p>
                        <p className="text-xs font-bold uppercase text-zinc-400">
                          {signal.status}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {pipelineCards.length > 0 ? (
            <div className="property-sales-kanban mt-5 grid grid-flow-col gap-3 overflow-x-auto pb-3">
              {pipelineStatuses.map((status) => {
                const cards = pipelineCards.filter(
                  (item) => item.pipelineStatus === status
                );

                return (
                  <section
                    key={status}
                    className="property-sales-column rounded-2xl border border-white/10 bg-black/20 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-black uppercase tracking-[0.18em] text-sky-100">
                        {status}
                      </h3>
                      <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs font-black text-white">
                        {cards.length}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-3">
                      {cards.length > 0 ? (
                        cards.map((item) => (
                          <Link
                            key={item.id}
                            href={`/queue/${item.id}?business=${businessSlug}`}
                            className="property-sales-unit-card rounded-2xl border border-white/10 bg-zinc-950/80 p-3 transition hover:-translate-y-0.5 hover:border-sky-300/60"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-bold text-zinc-400">
                                  {item.property ?? propertyLabel}
                                </p>
                                <p className="mt-1 text-xl font-black text-white">
                                  Unit {item.unit ?? "-"}
                                </p>
                              </div>
                              {item.smoked_in || item.renovation_needed ? (
                                <span className="rounded-full border border-orange-300/40 bg-orange-400/15 px-2 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em] text-orange-100">
                                  Heavy prep
                                </span>
                              ) : null}
                            </div>

                            <dl className="mt-3 grid gap-2 text-xs text-zinc-300">
                              <div>
                                <dt className="font-black uppercase tracking-[0.14em] text-zinc-500">
                                  Move-out
                                </dt>
                                <dd className="font-bold text-white">
                                  {formatDate(item.move_out_date)}
                                </dd>
                              </div>
                              <div>
                                <dt className="font-black uppercase tracking-[0.14em] text-zinc-500">
                                  Ready
                                </dt>
                                <dd className="font-bold text-white">
                                  {formatDate(item.ready_date)}
                                </dd>
                              </div>
                              <div>
                                <dt className="font-black uppercase tracking-[0.14em] text-zinc-500">
                                  Paint
                                </dt>
                                <dd>{item.paint_type ?? "-"}</dd>
                              </div>
                              <div>
                                <dt className="font-black uppercase tracking-[0.14em] text-zinc-500">
                                  Flooring
                                </dt>
                                <dd>{item.flooring ?? "-"}</dd>
                              </div>
                            </dl>

                            <p className="mt-3 text-xs leading-5 text-zinc-400">
                              {notesPreview(item.notes)}
                            </p>

                            <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3 text-[0.7rem] font-black uppercase tracking-[0.12em] text-zinc-500">
                              <span>{item.pipelineStatus}</span>
                              <span>
                                {formatDate(item.updated_at ?? item.created_at)}
                              </span>
                            </div>
                          </Link>
                        ))
                      ) : (
                        <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-zinc-500">
                          No {status.toLowerCase()} turns right now.
                        </p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : null}
        </Card>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
          <Card className="dark-surface border-emerald-500/20 bg-zinc-950">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.24em]">
                  Unit History
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  Unit memory that helps R&L look prepared
                </h2>
              </div>
              <p className="text-sm font-bold text-zinc-400">
                {unitHistory.length} units with recent records
              </p>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {unitHistory.slice(0, 6).map((history) => (
                <div
                  key={history.unit}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-100">
                        Unit {history.unit}
                      </p>
                      <h3 className="mt-2 text-xl font-black text-white">
                        {history.latest.paint_type ?? "Paint history"}
                      </h3>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-white">
                      {minutesToHours(history.totalMinutes)}
                    </span>
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                        Last paint date
                      </dt>
                      <dd className="mt-1 font-bold text-white">
                        {formatDate(history.latest.completed_date ?? history.latest.scheduled_date)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                        Color
                      </dt>
                      <dd className="mt-1 font-bold text-white">
                        {history.latest.wall_paint_color ?? "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                        Estimate
                      </dt>
                      <dd className="mt-1">
                        {history.estimate ? (
                          <Link
                            href={`/estimates/${history.estimate.id}?business=${businessSlug}`}
                            className="font-black text-sky-100 hover:text-white"
                          >
                            {history.estimate.display_id ?? "Open estimate"}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                        Invoice
                      </dt>
                      <dd className="mt-1">
                        {history.invoice ? (
                          <Link
                            href={`/invoices/${history.invoice.id}?business=${businessSlug}`}
                            className="font-black text-sky-100 hover:text-white"
                          >
                            {history.invoice.display_id ?? "Open invoice"}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-zinc-300">
                    {notesPreview(history.latest.notes)}
                  </p>
                </div>
              ))}

              {unitHistory.length === 0 && recentBillingSignals.length > 0 ? (
                <div className="grid gap-3 lg:col-span-2 lg:grid-cols-2">
                  {recentBillingSignals.map((signal) => (
                    <Link
                      key={signal.id}
                      href={`/invoices/${signal.id}?business=${businessSlug}`}
                      className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-4 transition hover:-translate-y-0.5 hover:border-sky-200/60"
                    >
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-100">
                        Invoice Memory
                      </p>
                      <h3 className="mt-2 text-xl font-black text-white">
                        {signal.unitLabel
                          ? `Unit ${signal.unitLabel}`
                          : signal.displayId}
                      </h3>
                      <dl className="mt-4 grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                            Invoice
                          </dt>
                          <dd className="mt-1 font-bold text-white">
                            {signal.displayId}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                            Amount
                          </dt>
                          <dd className="mt-1 font-bold text-white">
                            {formatMoney(signal.amount)}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-zinc-300">
                        Trimax found billing for this property. Add or link the
                        matching queue item when you want this to become a full
                        unit history card.
                      </p>
                    </Link>
                  ))}
                </div>
              ) : null}

              {unitHistory.length === 0 && recentBillingSignals.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-400">
                  No unit history exists for this property yet. New turn records
                  will begin building the property memory automatically.
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="dark-surface border-sky-500/20 bg-gradient-to-br from-zinc-950 to-slate-950">
            <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.24em]">
              Completion Photos
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Proof photos managers can review
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Reserve the exact proof moments managers care about: before,
              after, touch-up, and manager approval. Photo uploads can plug into
              these slots without redesigning the sales dashboard later.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {["Before", "After", "Touch-up", "Manager OK"].map((label) => (
                <div
                  key={label}
                  className="property-sales-photo-slot grid aspect-[4/3] place-items-center rounded-2xl border border-dashed border-sky-300/30 bg-sky-400/5 text-center text-sm font-black text-sky-100"
                >
                  <span>{label} photo</span>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-100">
                Performance Pass
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                <li>Property data is scoped by property name and capped.</li>
                <li>Recent estimates, invoices, and labor are limited lists.</li>
                <li>Demo mode uses private sample data only.</li>
                <li>
                  {liveData?.hasSessionTable === false
                    ? "Labor session table is not available yet, so labor metrics are skipped safely."
                    : "Labor metrics are included when session data exists."}
                </li>
              </ul>
            </div>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
