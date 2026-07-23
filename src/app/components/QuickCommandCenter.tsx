"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  NavPermissionKey,
  WorkspaceRole,
  canAccessNavItem,
  normalizeWorkspaceRole,
} from "../lib/rolePermissions";
import { logActivity } from "../lib/activityLog";
import { supabase } from "../lib/supabase";
import { appendUnitHistoryForQueueItem } from "../lib/unitHistory";
import { loadWorkspaceAccess } from "../lib/workspaceAccess";

type CommandTone =
  | "cash"
  | "queue"
  | "create"
  | "client"
  | "report"
  | "setup"
  | "security"
  | "system";

type CommandItem = {
  title: string;
  detail: string;
  href: string;
  tone: CommandTone;
  keywords: string[];
  source?: "static" | "record" | "fallback" | "smart" | "context";
  actionLabel?: string;
};

type CommandAction =
  | "open"
  | "pay"
  | "print"
  | "send"
  | "remind"
  | "edit"
  | "schedule"
  | "complete"
  | "convert"
  | "create";

type BusinessRecord = {
  id: string;
  slug: string | null;
};

type InvoiceSearchRecord = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  status: string | null;
};

type EstimateSearchRecord = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  status: string | null;
};

type QueueSearchRecord = {
  id: string;
  property: string | null;
  unit: string | null;
  status: string | null;
  priority: string | null;
  ready_date: string | null;
  projected_completion_date?: string | null;
  progress_stage?: string | null;
  percent_complete?: number | null;
  completed_date?: string | null;
  linked_estimate_id?: string | null;
};

type TypedEstimateRecord = {
  id: string;
  display_id: string | null;
  status: string | null;
};

type TypedInvoiceRecord = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  status: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  client_id: string | null;
};

type TypedCommandPreview = {
  kind:
    | "open_queue"
    | "set_eta"
    | "set_progress"
    | "create_estimate"
    | "create_invoice"
    | "send_invoice"
    | "show_queue_group";
  state: "ready" | "ambiguous" | "blocked" | "saving" | "done" | "error";
  unit: string;
  etaDate?: string;
  progressStage?: string;
  percentComplete?: number | null;
  markComplete?: boolean;
  group?: "overdue" | "at_risk" | "blocked";
  matches: QueueSearchRecord[];
  message: string;
  confirmLabel?: string;
  targetHref?: string;
  estimate?: TypedEstimateRecord | null;
  invoice?: TypedInvoiceRecord | null;
  recipientEmail?: string | null;
};

type ClientSearchRecord = {
  id: string;
  name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
};

type SmartInvoiceRecord = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  status: string | null;
  due_date: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
};

type SmartEstimateRecord = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  status: string | null;
  estimate_amount: string | number | null;
};

type SmartQueueRecord = {
  id: string;
  property: string | null;
  unit: string | null;
  status: string | null;
  priority: string | null;
  ready_date: string | null;
  scheduled_date: string | null;
};

const RECENT_COMMANDS_STORAGE_KEY = "trimax-recent-commands";
const COMMAND_EXAMPLES = [
  "pay INV 502",
  "send estimate",
  "schedule D01",
  "proof",
  "check photo",
  "who owes",
];

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

function commandSearchText(command: CommandItem) {
  const haystack = [
    command.title,
    command.detail,
    ...command.keywords,
  ]
    .join(" ")
    .toLowerCase();

  return haystack;
}

function permissionForHref(href: string): NavPermissionKey {
  if (href.startsWith("/queue") || href.startsWith("/new-request")) {
    return "queue";
  }

  if (href.startsWith("/technician")) {
    return "technician";
  }

  if (href.startsWith("/property-sales")) {
    return "property_sales";
  }

  if (
    href.startsWith("/property-intelligence") ||
    href.startsWith("/schedule")
  ) {
    return href.startsWith("/schedule") ? "schedule" : "queue";
  }

  if (href.startsWith("/estimates")) {
    return "estimates";
  }

  if (href.startsWith("/invoices") || href.startsWith("/recurring-invoices")) {
    return "invoices";
  }

  if (href.startsWith("/payments")) {
    return "payments";
  }

  if (href.startsWith("/clients")) {
    return "clients";
  }

  if (href.startsWith("/imports")) {
    return "imports";
  }

  if (href.startsWith("/services")) {
    return "services";
  }

  if (href.startsWith("/reports")) {
    return "reports";
  }

  if (href.startsWith("/activity")) {
    return "activity";
  }

  if (href.startsWith("/settings")) {
    return "settings";
  }

  return "dashboard";
}

function commandAllowedForRole(command: CommandItem, role: WorkspaceRole) {
  return canAccessNavItem(role, permissionForHref(command.href));
}

function queryTokens(query: string) {
  return query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function canonicalDocumentSearch(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, " ");
  const match = normalized.match(
    /^(INV|INVOICE|EST|ESTIMATE|Q|QUEUE|UNIT|CLIENT|CUSTOMER)\s*[-#:]?\s*(.+)$/
  );

  if (!match) {
    return {
      type: "general" as const,
      value: normalized,
    };
  }

  const rawType = match[1];
  const rawValue = match[2].trim();
  const type =
    rawType === "INV" || rawType === "INVOICE"
      ? "invoice"
      : rawType === "EST" || rawType === "ESTIMATE"
        ? "estimate"
        : rawType === "CLIENT" || rawType === "CUSTOMER"
          ? "client"
          : "queue";

  return {
    type,
    value: rawValue,
  };
}

function commandIntent(value: string): {
  action: CommandAction;
  lookup: ReturnType<typeof canonicalDocumentSearch>;
  cleanQuery: string;
} {
  const normalized = value.trim().replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();
  const actionPatterns: { action: CommandAction; pattern: RegExp }[] = [
    { action: "remind", pattern: /^(send\s+)?(late\s+)?reminder\s+/i },
    { action: "remind", pattern: /^remind\s+/i },
    { action: "send", pattern: /^(send|email|mail)\s+/i },
    { action: "pay", pattern: /^(pay|paid|payment|collect|record\s+payment)\s+/i },
    { action: "print", pattern: /^(print|pdf|download)\s+/i },
    { action: "edit", pattern: /^(edit|update|change)\s+/i },
    { action: "schedule", pattern: /^(schedule|calendar)\s+/i },
    { action: "complete", pattern: /^(complete|done|finish|close)\s+/i },
    { action: "convert", pattern: /^(convert|invoice\s+from)\s+/i },
    { action: "create", pattern: /^(create|new|add)\s+/i },
    { action: "open", pattern: /^(open|view|go\s+to)\s+/i },
  ];

  const matchedAction = actionPatterns.find(({ pattern }) =>
    pattern.test(normalized)
  );
  const action = matchedAction?.action ?? "open";
  const cleanQuery = matchedAction
    ? normalized.replace(matchedAction.pattern, "").trim()
    : normalized;

  if (!matchedAction) {
    const inlineActionPatterns: { action: CommandAction; pattern: RegExp }[] = [
      { action: "remind", pattern: /\b(remind|reminder|late)\b/i },
      { action: "send", pattern: /\b(send|email|mail)\b/i },
      { action: "pay", pattern: /\b(pay|paid|payment|collect)\b/i },
      { action: "print", pattern: /\b(print|pdf|download)\b/i },
      { action: "edit", pattern: /\b(edit|update|change)\b/i },
      { action: "schedule", pattern: /\b(schedule|calendar)\b/i },
      { action: "complete", pattern: /\b(complete|done|finish|close)\b/i },
      { action: "convert", pattern: /\b(convert)\b/i },
      { action: "create", pattern: /\b(create|new|add)\b/i },
    ];
    const inlineAction = inlineActionPatterns.find(({ pattern }) =>
      pattern.test(normalized)
    );

    if (inlineAction) {
      const inlineCleanQuery = normalized
        .replace(inlineAction.pattern, " ")
        .replace(/\s+/g, " ")
        .trim();

      return {
        action: inlineAction.action,
        lookup: canonicalDocumentSearch(inlineCleanQuery || normalized),
        cleanQuery: inlineCleanQuery,
      };
    }
  }

  if (!cleanQuery && lower.includes("invoice")) {
    return { action, lookup: canonicalDocumentSearch("invoice"), cleanQuery };
  }

  return {
    action,
    lookup: canonicalDocumentSearch(cleanQuery || normalized),
    cleanQuery,
  };
}

function normalizeLookupValue(value: string) {
  return value
    .trim()
    .replace(/^[-#:\s]+/, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function displayIdNeedle(value: string) {
  const normalized = normalizeLookupValue(value);
  const numeric = normalized.match(/\d+/)?.[0] ?? "";

  return numeric || normalized.replace(/[^A-Z0-9]+/g, "");
}

function queueUnitNeedles(value: string) {
  const normalized = normalizeLookupValue(value);
  const compact = normalized.replace(/[^A-Z0-9]+/g, "");
  const padded = compact.replace(/^([A-Z])([1-9])$/, "$10$2");
  const unpadded = compact.replace(/^([A-Z])0([1-9])$/, "$1$2");

  return Array.from(new Set([normalized, compact, padded, unpadded])).filter(
    Boolean
  );
}

function safeIlikeNeedle(value: string) {
  return value.replace(/[%_,]/g, "").trim();
}

function numberValue(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? 0).replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(numberValue(value));
}

function invoiceDueAmount(invoice: SmartInvoiceRecord) {
  return Math.max(
    numberValue(invoice.invoice_amount) - numberValue(invoice.amount_paid),
    0
  );
}

function queuePriorityScore(value: string | null | undefined) {
  const normalized = value?.toLowerCase() ?? "";

  if (normalized.includes("urgent")) {
    return 4;
  }

  if (normalized.includes("high")) {
    return 3;
  }

  if (normalized.includes("normal")) {
    return 2;
  }

  if (normalized.includes("low")) {
    return 1;
  }

  return 0;
}

function daysFromToday(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

function shortDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function canUseTypedCommands(role: WorkspaceRole) {
  return role === "owner" || role === "admin";
}

function typedCommandTitle(kind: TypedCommandPreview["kind"]) {
  switch (kind) {
    case "open_queue":
      return "Open Queue Item";
    case "set_eta":
      return "Set Robbie ETA";
    case "set_progress":
      return "Update Progress";
    case "create_estimate":
      return "Create Estimate";
    case "create_invoice":
      return "Create Invoice";
    case "send_invoice":
      return "Send Invoice";
    case "show_queue_group":
      return "Show Queue Items";
    default:
      return "Command";
  }
}

function isActiveQueueItem(item: QueueSearchRecord) {
  const status = item.status?.toLowerCase() ?? "";

  return (
    !item.completed_date &&
    !status.includes("complete") &&
    !status.includes("cancel") &&
    !status.includes("closed")
  );
}

function queueItemIsOverdue(item: QueueSearchRecord) {
  return isActiveQueueItem(item) && daysFromToday(item.ready_date) !== null
    ? (daysFromToday(item.ready_date) ?? 0) < 0
    : false;
}

function queueItemIsAtRisk(item: QueueSearchRecord) {
  if (!isActiveQueueItem(item) || !item.ready_date || !item.projected_completion_date) {
    return false;
  }

  const deadlineDays = daysFromToday(item.ready_date);
  const etaDays = daysFromToday(item.projected_completion_date);

  return deadlineDays !== null && etaDays !== null && etaDays > deadlineDays;
}

function queueItemIsBlocked(item: QueueSearchRecord) {
  return (
    isActiveQueueItem(item) &&
    (item.progress_stage?.toLowerCase().includes("blocked") ||
      item.status?.toLowerCase().includes("blocked") ||
      item.status?.toLowerCase().includes("waiting"))
  );
}

function parseDateCommandValue(value: string) {
  const trimmed = value.trim().replace(/[.。]+$/, "");

  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);

  if (slashMatch) {
    const [, month, day, rawYear] = slashMatch;
    const year = rawYear
      ? rawYear.length === 2
        ? `20${rawYear}`
        : rawYear
      : String(new Date().getFullYear());

    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(`${trimmed} ${new Date().getFullYear()}`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

const QUEUE_PROGRESS_OPTIONS = [
  { aliases: ["not started", "not-started"], label: "Not Started", percent: 0 },
  {
    aliases: ["walked", "reviewed", "walked reviewed", "walked / reviewed"],
    label: "Walked / Reviewed",
    percent: 0,
  },
  { aliases: ["prep started", "prepping", "prep"], label: "Prep Started", percent: 25 },
  { aliases: ["prep complete", "prep completed"], label: "Prep Complete", percent: 25 },
  {
    aliases: ["painting started", "paint started", "started painting"],
    label: "Painting Started",
    percent: 50,
  },
  {
    aliases: ["first coat complete", "first coat completed"],
    label: "First Coat Complete",
    percent: 75,
  },
  {
    aliases: ["final coat complete", "final coat completed"],
    label: "Final Coat Complete",
    percent: 90,
  },
  { aliases: ["touchups", "touch ups", "touch-up", "touchup"], label: "Touchups", percent: 90 },
  { aliases: ["complete", "completed", "done", "finished"], label: "Complete", percent: 100 },
  {
    aliases: ["blocked", "waiting", "blocked waiting", "blocked / waiting"],
    label: "Blocked / Waiting",
    percent: null,
  },
];

function normalizeProgressCommandValue(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^progress\s+(?:to\s+)?/, "")
    .replace(/^(?:to|as)\s+/, "")
    .replace(/[.]+$/, "")
    .replace(/\s+/g, " ");
  const match = QUEUE_PROGRESS_OPTIONS.find((option) =>
    option.aliases.includes(normalized)
  );

  if (!match) {
    return null;
  }

  return {
    progressStage: match.label,
    percentComplete: match.percent,
    markComplete: match.label === "Complete",
  };
}

// Manual QA: create invoice for unit D01, create invoice for D1, and make invoice for D01
// should show a typed queue preview; show/open invoice 190 should stay invoice record search.
function parseTypedCommand(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return null;
  }

  if (/^(?:show|open|view|find)\s+(?:overdue|past\s+due)\s+(?:units|queue|jobs|work)$/i.test(normalized)) {
    return {
      kind: "show_queue_group" as const,
      unit: "overdue",
      group: "overdue" as const,
    };
  }

  if (/^(?:show|open|view|find)\s+(?:at\s+risk|at-risk)\s+(?:units|queue|jobs|work)$/i.test(normalized)) {
    return {
      kind: "show_queue_group" as const,
      unit: "at risk",
      group: "at_risk" as const,
    };
  }

  if (/^(?:show|open|view|find)\s+(?:blocked|waiting)\s+(?:units|queue|jobs|work)$/i.test(normalized)) {
    return {
      kind: "show_queue_group" as const,
      unit: "blocked",
      group: "blocked" as const,
    };
  }

  const etaMatch = normalized.match(
    /^(?:set|update|change)\s+(?:robbie\s+)?(?:eta|projected\s+completion(?:\s+date)?)\s+(?:for\s+)?([a-z]\s*0?\d{1,2})\s+(?:to|as|on)\s+(.+)$/i
  );

  if (etaMatch) {
    const unit = queueUnitNeedles(etaMatch[1])[0] ?? etaMatch[1].toUpperCase();
    const etaDate = parseDateCommandValue(etaMatch[2]);

    if (!etaDate) {
      return {
        kind: "set_eta" as const,
        unit,
        etaDate: "",
        error: "I could not read that date. Try something like July 7 or 2026-07-07.",
      };
    }

    return {
      kind: "set_eta" as const,
      unit,
      etaDate,
    };
  }

  const openMatch = normalized.match(
    /^(?:show|open|view|find)(?:\s+unit)?\s+([a-z]\s*0?\d{1,2})$/i
  );

  if (openMatch) {
    return {
      kind: "open_queue" as const,
      unit: queueUnitNeedles(openMatch[1])[0] ?? openMatch[1].toUpperCase(),
    };
  }

  const estimateMatch = normalized.match(
    /^(?:create|make|new|add)\s+estimate\s+(?:for\s+)?(?:unit\s+)?([a-z]\s*0?\d{1,2})$/i
  );

  if (estimateMatch) {
    return {
      kind: "create_estimate" as const,
      unit: queueUnitNeedles(estimateMatch[1])[0] ?? estimateMatch[1].toUpperCase(),
    };
  }

  const invoiceMatch = normalized.match(
    /^(?:(?:create|make|new|add)\s+invoice\s+(?:for\s+)?(?:unit\s+)?|invoice\s+)([a-z]\s*0?\d{1,2})$/i
  );

  if (invoiceMatch) {
    return {
      kind: "create_invoice" as const,
      unit: queueUnitNeedles(invoiceMatch[1])[0] ?? invoiceMatch[1].toUpperCase(),
    };
  }

  const sendInvoiceMatch = normalized.match(
    /^(?:send|email|mail)\s+invoice\s+(?:for\s+)?(?:unit\s+)?([a-z]\s*0?\d{1,2})(?:\s+to\s+(.+))?$/i
  );

  if (sendInvoiceMatch) {
    return {
      kind: "send_invoice" as const,
      unit: queueUnitNeedles(sendInvoiceMatch[1])[0] ?? sendInvoiceMatch[1].toUpperCase(),
      recipientHint: sendInvoiceMatch[2]?.trim() ?? null,
    };
  }

  const progressMatch = normalized.match(
    /^(?:mark|set|update|change)\s+([a-z]\s*0?\d{1,2})\s+(.+)$/i
  );

  if (progressMatch) {
    const progress = normalizeProgressCommandValue(progressMatch[2]);

    if (!progress) {
      return null;
    }

    return {
      kind: "set_progress" as const,
      unit: queueUnitNeedles(progressMatch[1])[0] ?? progressMatch[1].toUpperCase(),
      ...progress,
    };
  }

  return null;
}

function invoiceActionCommand(
  invoice: InvoiceSearchRecord,
  business: string,
  action: CommandAction
): CommandItem {
  const label = invoice.display_id ?? "Invoice";
  const descriptor =
    [invoice.customer_name, invoice.project_title, invoice.status]
      .filter(Boolean)
      .join(" / ") || "Invoice record";
  const encodedLabel = encodeURIComponent(label);

  if (action === "pay") {
    return {
      title: `Record payment for ${label}`,
      detail: descriptor,
      href: `/payments?business=${business}&q=${encodedLabel}`,
      tone: "cash",
      keywords: ["pay", "payment", "collect", "invoice", label],
      source: "record",
      actionLabel: "Pay",
    };
  }

  if (action === "print") {
    return {
      title: `Print ${label}`,
      detail: descriptor,
      href: `/invoices/${invoice.id}/print?business=${business}`,
      tone: "report",
      keywords: ["print", "pdf", "invoice", label],
      source: "record",
      actionLabel: "Print",
    };
  }

  if (action === "send") {
    return {
      title: `Send ${label}`,
      detail: descriptor,
      href: `/invoices/${invoice.id}?business=${business}#send-invoice`,
      tone: "cash",
      keywords: ["send", "email", "invoice", label],
      source: "record",
      actionLabel: "Send",
    };
  }

  if (action === "remind") {
    return {
      title: `Send reminder for ${label}`,
      detail: descriptor,
      href: `/invoices/${invoice.id}?business=${business}#late-payment-reminder`,
      tone: "cash",
      keywords: ["remind", "reminder", "late", "overdue", "invoice", label],
      source: "record",
      actionLabel: "Remind",
    };
  }

  if (action === "edit") {
    return {
      title: `Edit ${label}`,
      detail: descriptor,
      href: `/invoices/${invoice.id}/edit?business=${business}`,
      tone: "setup",
      keywords: ["edit", "update", "invoice", label],
      source: "record",
      actionLabel: "Edit",
    };
  }

  return {
    title: label,
    detail: descriptor,
    href: `/invoices/${invoice.id}?business=${business}`,
    tone: "cash",
    keywords: [
      "invoice",
      invoice.display_id ?? "",
      invoice.customer_name ?? "",
      invoice.project_title ?? "",
    ],
    source: "record",
    actionLabel: "Open",
  };
}

function estimateActionCommand(
  estimate: EstimateSearchRecord,
  business: string,
  action: CommandAction
): CommandItem {
  const label = estimate.display_id ?? "Estimate";
  const descriptor =
    [estimate.customer_name, estimate.project_title, estimate.status]
      .filter(Boolean)
      .join(" / ") || "Estimate record";

  if (action === "print") {
    return {
      title: `Print ${label}`,
      detail: descriptor,
      href: `/estimates/${estimate.id}/print?business=${business}`,
      tone: "report",
      keywords: ["print", "pdf", "estimate", label],
      source: "record",
      actionLabel: "Print",
    };
  }

  if (action === "send") {
    return {
      title: `Send ${label}`,
      detail: descriptor,
      href: `/estimates/${estimate.id}?business=${business}#send-estimate`,
      tone: "create",
      keywords: ["send", "email", "estimate", label],
      source: "record",
      actionLabel: "Send",
    };
  }

  if (action === "edit") {
    return {
      title: `Edit ${label}`,
      detail: descriptor,
      href: `/estimates/${estimate.id}/edit?business=${business}`,
      tone: "setup",
      keywords: ["edit", "update", "estimate", label],
      source: "record",
      actionLabel: "Edit",
    };
  }

  if (action === "convert") {
    return {
      title: `Convert ${label} to invoice`,
      detail: descriptor,
      href: `/estimates/${estimate.id}?business=${business}`,
      tone: "create",
      keywords: ["convert", "invoice", "estimate", label],
      source: "record",
      actionLabel: "Convert",
    };
  }

  return {
    title: label,
    detail: descriptor,
    href: `/estimates/${estimate.id}?business=${business}`,
    tone: "create",
    keywords: [
      "estimate",
      estimate.display_id ?? "",
      estimate.customer_name ?? "",
      estimate.project_title ?? "",
    ],
    source: "record",
    actionLabel: "Open",
  };
}

function queueActionCommand(
  item: QueueSearchRecord,
  business: string,
  action: CommandAction
): CommandItem {
  const label = `Queue ${item.unit ?? "Item"}`;
  const descriptor =
    [
      item.property,
      item.status,
      item.priority ? `${item.priority} priority` : "",
      item.ready_date ? `Paint due ${item.ready_date}` : "",
    ]
      .filter(Boolean)
      .join(" / ") || "Queue item";

  if (action === "create" || action === "convert") {
    return {
      title: `Create estimate for ${label}`,
      detail: descriptor,
      href: `/estimates/new?queueId=${item.id}&business=${business}`,
      tone: "create",
      keywords: ["create", "estimate", "queue", "unit", item.unit ?? ""],
      source: "record",
      actionLabel: "Estimate",
    };
  }

  if (action === "edit") {
    return {
      title: `Edit ${label}`,
      detail: descriptor,
      href: `/queue/${item.id}/edit?business=${business}`,
      tone: "setup",
      keywords: ["edit", "queue", "unit", item.unit ?? ""],
      source: "record",
      actionLabel: "Edit",
    };
  }

  if (action === "schedule") {
    return {
      title: `Schedule ${label}`,
      detail: descriptor,
      href: `/queue/${item.id}?business=${business}#schedule-work`,
      tone: "queue",
      keywords: ["schedule", "calendar", "queue", "unit", item.unit ?? ""],
      source: "record",
      actionLabel: "Schedule",
    };
  }

  if (action === "complete") {
    return {
      title: `Complete ${label}`,
      detail: descriptor,
      href: `/queue/${item.id}?business=${business}#complete-work`,
      tone: "queue",
      keywords: ["complete", "done", "finish", "queue", "unit", item.unit ?? ""],
      source: "record",
      actionLabel: "Complete",
    };
  }

  return {
    title: label,
    detail: descriptor,
    href: `/queue/${item.id}?business=${business}`,
    tone: "queue",
    keywords: [
      "queue",
      "unit",
      item.unit ?? "",
      item.property ?? "",
      item.status ?? "",
    ],
    source: "record",
    actionLabel: "Open",
  };
}

function clientActionCommand(
  client: ClientSearchRecord,
  business: string,
  action: CommandAction
): CommandItem {
  const label = client.name ?? "Client";
  const descriptor =
    [client.contact_name, client.email, client.phone].filter(Boolean).join(" / ") ||
    "Client record";

  if (action === "create") {
    return {
      title: `New invoice for ${label}`,
      detail: descriptor,
      href: `/invoices/new?business=${business}&clientId=${client.id}`,
      tone: "create",
      keywords: ["new", "invoice", "client", "customer", label],
      source: "record",
      actionLabel: "Invoice",
    };
  }

  if (action === "edit") {
    return {
      title: `Edit ${label}`,
      detail: descriptor,
      href: `/clients/${client.id}/edit?business=${business}`,
      tone: "setup",
      keywords: ["edit", "client", "customer", label],
      source: "record",
      actionLabel: "Edit",
    };
  }

  return {
    title: label,
    detail: descriptor,
    href: `/clients/${client.id}?business=${business}`,
    tone: "client",
    keywords: [
      "client",
      "customer",
      client.name ?? "",
      client.contact_name ?? "",
      client.email ?? "",
    ],
    source: "record",
    actionLabel: "Open",
  };
}

function buildSmartCommands({
  business,
  invoices,
  estimates,
  queueItems,
}: {
  business: string;
  invoices: SmartInvoiceRecord[];
  estimates: SmartEstimateRecord[];
  queueItems: SmartQueueRecord[];
}) {
  const commands: CommandItem[] = [];
  const openInvoices = invoices.filter((invoice) => {
    const status = invoice.status?.toLowerCase() ?? "";

    return status !== "paid" && invoiceDueAmount(invoice) > 0;
  });
  const largestOpenInvoice = [...openInvoices].sort(
    (first, second) => invoiceDueAmount(second) - invoiceDueAmount(first)
  )[0];
  const overdueInvoices = openInvoices
    .map((invoice) => ({
      invoice,
      daysLate: -(daysFromToday(invoice.due_date) ?? 0),
    }))
    .filter(({ daysLate }) => daysLate > 0)
    .sort((first, second) => second.daysLate - first.daysLate);
  const draftInvoice = invoices.find(
    (invoice) => invoice.status?.toLowerCase() === "draft"
  );
  const draftEstimate = estimates.find(
    (estimate) => estimate.status?.toLowerCase() === "draft"
  );
  const approvedEstimate = estimates.find((estimate) =>
    ["approved", "accepted"].includes(estimate.status?.toLowerCase() ?? "")
  );
  const urgentQueueItem = [...queueItems]
    .filter((item) => item.status?.toLowerCase() !== "completed")
    .sort((first, second) => {
      const priorityDelta =
        queuePriorityScore(second.priority) - queuePriorityScore(first.priority);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return (
        (daysFromToday(first.ready_date) ?? 999) -
        (daysFromToday(second.ready_date) ?? 999)
      );
    })[0];
  const unscheduledQueueItem = queueItems.find(
    (item) => !item.scheduled_date && item.status?.toLowerCase() !== "completed"
  );
  const dueSoonQueueItem = queueItems
    .map((item) => ({
      item,
      daysUntilDue: daysFromToday(item.ready_date),
    }))
    .filter(
      ({ item, daysUntilDue }) =>
        !item.scheduled_date &&
        item.status?.toLowerCase() !== "completed" &&
        daysUntilDue !== null &&
        daysUntilDue <= 7
    )
    .sort((first, second) => {
      const firstDays = first.daysUntilDue ?? 999;
      const secondDays = second.daysUntilDue ?? 999;

      return firstDays - secondDays;
    })[0];

  if (overdueInvoices[0]) {
    const { invoice, daysLate } = overdueInvoices[0];
    const dueAmount =
      numberValue(invoice.invoice_amount) - numberValue(invoice.amount_paid);

    commands.push({
      title: `Send reminder for ${invoice.display_id ?? "oldest overdue invoice"}`,
      detail: `${invoice.customer_name ?? "Customer"} / ${formatMoney(
        dueAmount
      )} due / ${daysLate} day${daysLate === 1 ? "" : "s"} late`,
      href: `/invoices/${invoice.id}?business=${business}#late-payment-reminder`,
      tone: "cash",
      keywords: ["smart", "overdue", "late", "reminder", "collect"],
      source: "smart",
      actionLabel: "Remind",
    });
  }

  if (openInvoices.length > 0) {
    const openTotal = openInvoices.reduce(
      (total, invoice) => total + invoiceDueAmount(invoice),
      0
    );

    commands.push({
      title: "Collect open revenue",
      detail: `${openInvoices.length} open invoice${
        openInvoices.length === 1 ? "" : "s"
      } / ${formatMoney(openTotal)} still collectible`,
      href: `/payments?business=${business}`,
      tone: "cash",
      keywords: ["smart", "collect", "payment", "revenue", "check"],
      source: "smart",
      actionLabel: "Collect",
    });
  }

  if (largestOpenInvoice) {
    commands.push({
      title: `Open largest invoice ${largestOpenInvoice.display_id ?? ""}`.trim(),
      detail: `${largestOpenInvoice.customer_name ?? "Customer"} / ${formatMoney(
        invoiceDueAmount(largestOpenInvoice)
      )} still due`,
      href: `/invoices/${largestOpenInvoice.id}?business=${business}`,
      tone: "cash",
      keywords: [
        "smart",
        "largest",
        "biggest",
        "highest",
        "open",
        "invoice",
        "collect",
      ],
      source: "smart",
      actionLabel: "Open",
    });
  }

  if (draftInvoice) {
    commands.push({
      title: `Send draft ${draftInvoice.display_id ?? "invoice"}`,
      detail:
        [draftInvoice.customer_name, draftInvoice.project_title]
          .filter(Boolean)
          .join(" / ") || "Draft invoice ready for review",
      href: `/invoices/${draftInvoice.id}?business=${business}#send-invoice`,
      tone: "cash",
      keywords: ["smart", "draft", "invoice", "send"],
      source: "smart",
      actionLabel: "Send",
    });
  }

  if (draftEstimate) {
    commands.push({
      title: `Send estimate ${draftEstimate.display_id ?? ""}`.trim(),
      detail:
        [draftEstimate.customer_name, draftEstimate.project_title]
          .filter(Boolean)
          .join(" / ") || "Draft estimate ready for review",
      href: `/estimates/${draftEstimate.id}?business=${business}#send-estimate`,
      tone: "create",
      keywords: ["smart", "draft", "estimate", "send"],
      source: "smart",
      actionLabel: "Send",
    });
  }

  if (approvedEstimate) {
    commands.push({
      title: `Convert approved estimate ${
        approvedEstimate.display_id ?? ""
      }`.trim(),
      detail:
        [approvedEstimate.customer_name, approvedEstimate.project_title]
          .filter(Boolean)
          .join(" / ") || "Approved estimate is ready for invoice review",
      href: `/estimates/${approvedEstimate.id}?business=${business}`,
      tone: "create",
      keywords: [
        "smart",
        "approved",
        "accepted",
        "estimate",
        "convert",
        "invoice",
      ],
      source: "smart",
      actionLabel: "Convert",
    });
  }

  if (urgentQueueItem && queuePriorityScore(urgentQueueItem.priority) >= 3) {
    commands.push({
      title: `Open ${urgentQueueItem.priority ?? "priority"} queue ${
        urgentQueueItem.unit ?? "item"
      }`,
      detail: `${urgentQueueItem.property ?? "Queue"} / ${
        urgentQueueItem.ready_date
          ? `paint due ${shortDate(urgentQueueItem.ready_date)}`
          : urgentQueueItem.status ?? "active"
      }`,
      href: `/queue/${urgentQueueItem.id}?business=${business}`,
      tone: "queue",
      keywords: [
        "smart",
        "urgent",
        "high",
        "priority",
        "queue",
        "next",
        "unit",
      ],
      source: "smart",
      actionLabel: "Open",
    });
  }

  if (dueSoonQueueItem) {
    commands.push({
      title: `Schedule ${dueSoonQueueItem.item.unit ?? "next due unit"}`,
      detail: `${dueSoonQueueItem.item.property ?? "Queue"} / paint due ${shortDate(
        dueSoonQueueItem.item.ready_date
      )}`,
      href: `/queue/${dueSoonQueueItem.item.id}?business=${business}#schedule-work`,
      tone: "queue",
      keywords: ["smart", "schedule", "queue", "paint due"],
      source: "smart",
      actionLabel: "Schedule",
    });
  } else if (unscheduledQueueItem) {
    commands.push({
      title: `Schedule ${unscheduledQueueItem.unit ?? "queue item"}`,
      detail: `${unscheduledQueueItem.property ?? "Queue"} / ${
        unscheduledQueueItem.status ?? "not scheduled"
      }`,
      href: `/queue/${unscheduledQueueItem.id}?business=${business}#schedule-work`,
      tone: "queue",
      keywords: ["smart", "schedule", "queue", "unscheduled"],
      source: "smart",
      actionLabel: "Schedule",
    });
  }

  return commands;
}

function commandSearchScore(
  command: CommandItem,
  query: string,
  recentCommandHrefs: string[]
) {
  if (!query) {
    return recentCommandHrefs.includes(command.href) ? 100 : 10;
  }

  const title = command.title.toLowerCase();
  const haystack = commandSearchText(command);
  const tokens = queryTokens(query);

  if (tokens.length === 0) {
    return 0;
  }

  if (!tokens.every((token) => haystack.includes(token))) {
    return 0;
  }

  let score = 20;

  if (title === query) {
    score += 100;
  } else if (title.startsWith(query)) {
    score += 70;
  } else if (title.includes(query)) {
    score += 45;
  } else if (haystack.includes(query)) {
    score += 25;
  }

  score += tokens.filter((token) => title.includes(token)).length * 12;

  if (recentCommandHrefs.includes(command.href)) {
    score += 8;
  }

  return score;
}

function loadRecentCommandHrefs() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(RECENT_COMMANDS_STORAGE_KEY) ?? "[]"
    );

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function saveRecentCommandHref(href: string, currentHrefs: string[]) {
  const nextHrefs = [href, ...currentHrefs.filter((item) => item !== href)]
    .slice(0, 4);

  try {
    window.localStorage.setItem(
      RECENT_COMMANDS_STORAGE_KEY,
      JSON.stringify(nextHrefs)
    );
  } catch {
    // Recent command memory is a convenience, so storage failures are safe.
  }

  return nextHrefs;
}

function buildIntentShortcutCommands(
  query: string,
  business: string
): CommandItem[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  const commands: CommandItem[] = [];
  const hasAny = (...terms: string[]) =>
    terms.some((term) => normalized.includes(term));
  const hasAll = (...terms: string[]) =>
    terms.every((term) => normalized.includes(term));

  if (
    hasAny("what should i do", "next best", "today", "attention", "priority")
  ) {
    commands.push({
      title: "Show my next best moves",
      detail:
        "Jump to the dashboard focus map, proof checks, queue pressure, and accounting priorities.",
      href: `/?business=${business}#dashboard-focus`,
      tone: "system",
      keywords: ["intent", "today", "priority", "attention", "next"],
      source: "smart",
      actionLabel: "Focus",
    });
  }

  if (
    hasAny("overdue", "past due", "late", "reminder") ||
    hasAll("who", "owes")
  ) {
    commands.push({
      title: "Find money that needs follow-up",
      detail:
        "Open aging, overdue invoices, and late reminder workflows for collection.",
      href: `/invoices?business=${business}&view=aging`,
      tone: "cash",
      keywords: ["intent", "overdue", "late", "aging", "reminder", "collect"],
      source: "smart",
      actionLabel: "Collect",
    });
  }

  if (hasAny("check", "stub", "remittance", "photo", "camera", "capture")) {
    commands.push({
      title: "Capture and match a check",
      detail:
        "Open the payment camera workflow for check stubs and invoice matching.",
      href: `/payments?business=${business}#check-capture`,
      tone: "cash",
      keywords: ["intent", "check", "stub", "photo", "camera", "match"],
      source: "smart",
      actionLabel: "Capture",
    });
  }

  if (hasAny("proof", "audit", "evidence", "receipt", "sent email")) {
    commands.push({
      title: "Open the proof center",
      detail:
        "Review sent emails, reminders, PDF attachments, payments, and activity evidence.",
      href: `/activity?business=${business}`,
      tone: "security",
      keywords: ["intent", "proof", "audit", "evidence", "activity"],
      source: "smart",
      actionLabel: "Proof",
    });
  }

  if (
    hasAny(
      "pattern",
      "patterns",
      "repeat",
      "repeats",
      "seasonal",
      "turnover",
      "yearly",
      "frequency",
      "memory"
    )
  ) {
    commands.push({
      title: "Review recurring patterns",
      detail:
        "Jump to Trimax pattern memory for turnover rhythm, seasonal service calls, and repeated work.",
      href: `/?business=${business}#dashboard-pattern-radar`,
      tone: "system",
      keywords: [
        "intent",
        "pattern",
        "repeat",
        "seasonal",
        "turnover",
        "memory",
      ],
      source: "smart",
      actionLabel: "Pattern",
    });
  }

  if (hasAny("email", "sender", "reply", "cc", "bcc", "pdf", "resend")) {
    commands.push({
      title: "Open email and PDF delivery settings",
      detail:
        "Manage sender, reply-to, client CC, private copy, templates, and attachments.",
      href: `/settings?business=${business}#outlook-integration`,
      tone: "setup",
      keywords: ["intent", "email", "sender", "cc", "bcc", "pdf"],
      source: "smart",
      actionLabel: "Settings",
    });
  }

  if (hasAny("secure", "security", "lock", "logout", "session")) {
    commands.push({
      title: "Open security controls",
      detail:
        "Review session lock, user access, roles, and app security settings.",
      href: `/settings?business=${business}#user-role-integration`,
      tone: "security",
      keywords: ["intent", "security", "lock", "session", "roles"],
      source: "smart",
      actionLabel: "Secure",
    });
  }

  if (hasAny("schedule", "calendar", "paint due", "queue priority")) {
    commands.push({
      title: "Open queue scheduling",
      detail:
        "Review scheduled work, paint due dates, and queue priority planning.",
      href: `/schedule?business=${business}`,
      tone: "queue",
      keywords: ["intent", "schedule", "calendar", "paint", "queue"],
      source: "smart",
      actionLabel: "Schedule",
    });
  }

  if (hasAny("split", "apartment paint", "threshold")) {
    commands.push({
      title: "Review split invoice workflow",
      detail:
        "Open invoices where apartment-paint billing and split workflow decisions happen.",
      href: `/invoices?business=${business}&collection=open`,
      tone: "cash",
      keywords: ["intent", "split", "threshold", "apartment", "paint"],
      source: "smart",
      actionLabel: "Invoices",
    });
  }

  return commands;
}

export default function QuickCommandCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recordCommands, setRecordCommands] = useState<CommandItem[]>([]);
  const [smartCommands, setSmartCommands] = useState<CommandItem[]>([]);
  const [role, setRole] = useState<WorkspaceRole>("technician");
  const [isResolvingRecords, setIsResolvingRecords] = useState(false);
  const [isResolvingSmartCommands, setIsResolvingSmartCommands] =
    useState(false);
  const [typedCommandPreview, setTypedCommandPreview] =
    useState<TypedCommandPreview | null>(null);
  const [recentCommandHrefs, setRecentCommandHrefs] = useState(
    loadRecentCommandHrefs
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const business = searchParams.get("business") ?? "rnl-creations";
  const canResolveRecords = isOpen && query.trim().length >= 2;

  useEffect(() => {
    let isActive = true;

    async function loadRole() {
      const access = await loadWorkspaceAccess();
      const workspace = access.find(
        (item) => item.businessSlug === business
      );

      if (!isActive) {
        return;
      }

      setRole(normalizeWorkspaceRole(workspace?.role ?? "technician"));
    }

    loadRole();

    return () => {
      isActive = false;
    };
  }, [business]);

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        title: "Dashboard",
        detail: "Open the accounting and operations command view.",
        href: `/?business=${business}`,
        tone: "system",
        keywords: ["home", "overview", "command", "today", "platinum"],
      },
      {
        title: "Live Property Sales Dashboard",
        detail:
          "Open the live property pipeline for active turns, estimates, invoices, and unit memory.",
        href: `/property-sales?business=${business}&property=north-creek-apartments`,
        tone: "report",
        keywords: [
          "property",
          "sales",
          "manager",
          "demo",
          "pipeline",
          "turnover",
          "north creek",
        ],
        actionLabel: "Open",
      },
      {
        title: "Technician Workbench",
        detail:
          "Open daily field work, active sessions, job notes, photos, and recent completed jobs.",
        href: `/technician?business=${business}`,
        tone: "queue",
        keywords: [
          "technician",
          "field",
          "job session",
          "timer",
          "labor",
          "workbench",
          "today",
        ],
        actionLabel: "Open",
      },
      {
        title: "Client-Safe Sales Demo",
        detail:
          "Show the Evergreen sample property dashboard in meetings without exposing North Creek live data.",
        href: `/property-sales?business=${business}&demo=evergreen`,
        tone: "report",
        keywords: [
          "evergreen",
          "demo",
          "sales demo",
          "sample",
          "apartment manager",
        ],
        actionLabel: "Demo",
      },
      {
        title: "Platinum Signal",
        detail: "Jump to the dashboard command signal and top operating metrics.",
        href: `/?business=${business}#dashboard-focus`,
        tone: "system",
        keywords: ["platinum", "signal", "hero", "hud", "dashboard"],
      },
      {
        title: "Record Payment",
        detail: "Open the batch payment workspace for checks.",
        href: `/payments?business=${business}`,
        tone: "cash",
        keywords: ["check", "batch", "collect", "paid", "money"],
      },
      {
        title: "Who owes me?",
        detail: "Open open invoices and aging so you can collect first.",
        href: `/invoices?business=${business}&view=aging`,
        tone: "cash",
        keywords: [
          "who owes me",
          "owed",
          "money",
          "collect",
          "past due",
          "aging",
          "receivable",
        ],
        actionLabel: "Collect",
      },
      {
        title: "What needs attention?",
        detail: "Jump to the dashboard focus map and current operating flags.",
        href: `/?business=${business}#dashboard-map`,
        tone: "system",
        keywords: [
          "attention",
          "today",
          "next",
          "focus",
          "priority",
          "important",
          "flags",
        ],
        actionLabel: "Review",
      },
      {
        title: "Capture Check",
        detail: "Photograph a check and let Trimax suggest invoice matches.",
        href: `/payments?business=${business}#check-capture`,
        tone: "cash",
        keywords: ["camera", "photo", "match", "deposit", "payment"],
      },
      {
        title: "Late Reminders",
        detail: "Review overdue invoices ready for follow-up.",
        href: `/invoices?business=${business}&view=aging`,
        tone: "cash",
        keywords: ["overdue", "late", "reminder", "aging", "past due"],
      },
      {
        title: "Email Launch Checklist",
        detail: "Set sender address, reply-to, invoice copy, and reminders.",
        href: `/settings?business=${business}#outlook-integration`,
        tone: "setup",
        keywords: [
          "email",
          "sender",
          "from",
          "reply",
          "domain",
          "resend",
          "delivery",
        ],
      },
      {
        title: "Customer Email Studio",
        detail: "Open invoice, estimate, PDF, CC, BCC, and reminder settings.",
        href: `/settings?business=${business}#outlook-integration`,
        tone: "setup",
        keywords: [
          "customer",
          "email",
          "invoice",
          "estimate",
          "pdf",
          "attachment",
          "cc",
          "bcc",
          "copy",
        ],
      },
      {
        title: "Reminder Templates",
        detail: "Tune manual and automated late payment reminder copy.",
        href: `/settings?business=${business}#outlook-integration`,
        tone: "setup",
        keywords: [
          "late",
          "overdue",
          "payment",
          "reminder",
          "template",
          "automation",
        ],
      },
      {
        title: "PDF Delivery Setup",
        detail: "Check sender, reply-to, private copy, and attachment readiness.",
        href: `/settings?business=${business}#outlook-integration`,
        tone: "setup",
        keywords: [
          "pdf",
          "attachment",
          "invoice",
          "estimate",
          "send",
          "delivery",
          "resend",
        ],
      },
      {
        title: "Risk Radar",
        detail: "Review proof gaps for reminders, PDFs, and payment images.",
        href: `/?business=${business}#dashboard-accounting`,
        tone: "security",
        keywords: [
          "risk",
          "radar",
          "audit",
          "proof",
          "pdf",
          "reminder",
          "image",
        ],
      },
      {
        title: "Pattern Radar",
        detail:
          "Review recurring unit turnover, seasonal service, and repeated work signals.",
        href: `/?business=${business}#dashboard-pattern-radar`,
        tone: "system",
        keywords: [
          "pattern",
          "patterns",
          "memory",
          "repeat",
          "seasonal",
          "turnover",
          "frequency",
          "yearly",
        ],
        actionLabel: "Patterns",
      },
      {
        title: "Audit Export",
        detail: "Open the activity center and export a filtered evidence CSV.",
        href: `/activity?business=${business}`,
        tone: "report",
        keywords: [
          "audit",
          "export",
          "csv",
          "proof",
          "activity",
          "evidence",
        ],
      },
      {
        title: "Deposit Requests",
        detail: "Review invoices with active deposit collection.",
        href: `/invoices?business=${business}&collection=open`,
        tone: "cash",
        keywords: ["deposit", "request", "partial", "invoice"],
      },
      {
        title: "Recurring Drafts",
        detail: "Review monthly drafts, schedules, and auto-create settings.",
        href: `/recurring-invoices?business=${business}`,
        tone: "cash",
        keywords: [
          "recurring",
          "repeat",
          "monthly",
          "draft",
          "freshbooks",
          "schedule",
        ],
      },
      {
        title: "New Invoice",
        detail: "Create and send a billable invoice.",
        href: `/invoices/new?business=${business}`,
        tone: "create",
        keywords: ["bill", "send", "freshbooks", "accounting"],
      },
      {
        title: "New Queue Request",
        detail: "Add a unit turn, paint due date, priority, and scope.",
        href: `/new-request?business=${business}`,
        tone: "create",
        keywords: ["new", "add", "queue", "unit", "request", "turn"],
      },
      {
        title: "Schedule",
        detail: "Open scheduled queue work and calendar planning.",
        href: `/schedule?business=${business}`,
        tone: "queue",
        keywords: ["calendar", "schedule", "work date", "paint date"],
      },
      {
        title: "Invoices",
        detail: "Search, filter, split, print, and collect invoices.",
        href: `/invoices?business=${business}`,
        tone: "cash",
        keywords: ["invoice", "split", "paid", "draft", "sent"],
      },
      {
        title: "Queue",
        detail: "Review apartment turns, estimates, scheduling, and history.",
        href: `/queue?business=${business}`,
        tone: "queue",
        keywords: ["work", "unit", "paint", "turnover", "job"],
      },
      {
        title: "Needs Estimate",
        detail: "Jump to queue items waiting for estimate review.",
        href: `/queue?business=${business}&view=needs-estimate`,
        tone: "queue",
        keywords: ["proposal", "quote", "review", "estimate"],
      },
      {
        title: "Property Intelligence",
        detail: "Open unit labels, property records, and apartment context.",
        href: `/property-intelligence?business=${business}`,
        tone: "queue",
        keywords: [
          "property",
          "unit",
          "apartment",
          "north creek",
          "labels",
          "history",
        ],
      },
      {
        title: "New Estimate",
        detail: "Prepare a new estimate for approval or conversion.",
        href: `/estimates/new?business=${business}`,
        tone: "create",
        keywords: ["quote", "proposal", "pricing"],
      },
      {
        title: "Clients",
        detail: "Open the customer book and account follow-up view.",
        href: `/clients?business=${business}`,
        tone: "client",
        keywords: ["customer", "contacts", "account", "property"],
      },
      {
        title: "New Client",
        detail: "Create a customer profile with email, CC, and contact info.",
        href: `/clients/new?business=${business}`,
        tone: "create",
        keywords: ["new", "add", "client", "customer", "contact", "email"],
      },
      {
        title: "Imports",
        detail: "Bring FreshBooks data, invoices, estimates, and queue rows into Trimax.",
        href: `/imports?business=${business}`,
        tone: "setup",
        keywords: ["import", "freshbooks", "upload", "csv", "invoice"],
      },
      {
        title: "Reports",
        detail: "Review revenue, tax, queue, and client performance.",
        href: `/reports?business=${business}`,
        tone: "report",
        keywords: ["analytics", "tax", "money", "history"],
      },
      {
        title: "Settings",
        detail: "Manage phone app, alerts, email prep, and access.",
        href: `/settings?business=${business}`,
        tone: "system",
        keywords: ["setup", "security", "roles", "notifications"],
      },
      {
        title: "Security Controls",
        detail: "Open session lock, roles, access, and maintenance controls.",
        href: `/settings?business=${business}#user-role-integration`,
        tone: "security",
        keywords: [
          "security",
          "session",
          "lock",
          "roles",
          "access",
          "users",
          "maintenance",
        ],
      },
      {
        title: "Phone App Setup",
        detail: "Install Trimax on mobile and enable queue notifications.",
        href: `/settings?business=${business}#phone-app-notifications`,
        tone: "setup",
        keywords: [
          "mobile",
          "phone",
          "pwa",
          "install",
          "alerts",
          "notifications",
        ],
      },
      {
        title: "Media Filing Strategy",
        detail: "Set up check stubs, job-site photos, and storage strategy.",
        href: `/settings?business=${business}#media-filing-strategy`,
        tone: "setup",
        keywords: [
          "media",
          "photo",
          "photos",
          "images",
          "job site",
          "check stub",
          "storage",
          "supabase",
          "drive",
        ],
      },
      {
        title: "Check Stub Filing",
        detail: "Capture payment proof and match check stubs to invoices.",
        href: `/payments?business=${business}#check-capture`,
        tone: "cash",
        keywords: [
          "stub",
          "remittance",
          "check",
          "proof",
          "photo",
          "ocr",
          "match",
        ],
      },
    ],
    [business]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const recordLookupQuery = query.trim();
  const parsedTypedQuery = useMemo(
    () => parseTypedCommand(recordLookupQuery),
    [recordLookupQuery]
  );
  const typedCommandTakesPriority = Boolean(parsedTypedQuery);
  const intentShortcutCommands = useMemo(
    () =>
      buildIntentShortcutCommands(recordLookupQuery, business).filter(
        (command) => commandAllowedForRole(command, role)
      ),
    [business, recordLookupQuery, role]
  );
  const allowedCommands = useMemo(
    () =>
      commands.filter((command) =>
        commandAllowedForRole(command, role)
      ),
    [commands, role]
  );
  const pageContextCommands = useMemo<CommandItem[]>(() => {
    const path = pathname ?? "/";
    const pageSignals: Record<string, string[]> = {
      "/activity": ["activity", "audit", "proof", "history", "changes"],
      "/clients": ["client", "customer", "contact", "email"],
      "/deposits": ["deposit", "payment", "check", "proof"],
      "/estimates": ["estimate", "convert", "send", "proposal"],
      "/invoices": ["invoice", "aging", "reminder", "send", "pdf"],
      "/job-sessions": ["job session", "labor", "pause", "resume", "timer"],
      "/payments": ["payment", "check", "deposit", "proof", "match"],
      "/property-sales": ["property", "sales", "manager", "pipeline", "demo"],
      "/queue": ["queue", "unit", "priority", "ready", "work"],
      "/reports": ["report", "analytics", "volatility", "activity", "audit"],
      "/schedule": ["schedule", "calendar", "ready", "today", "date"],
      "/settings": ["settings", "email", "security", "setup", "domain"],
      "/technician": ["technician", "field", "session", "photo", "workbench"],
    };
    const matchedSignals =
      Object.entries(pageSignals)
        .sort((first, second) => second[0].length - first[0].length)
        .find(([segment]) =>
          segment === "/" ? path === "/" : path.startsWith(segment)
        )?.[1] ?? ["dashboard", "today", "command", "attention"];

    return allowedCommands
      .map((command) => {
        const haystack = [
          command.title,
          command.detail,
          command.href,
          ...command.keywords,
        ]
          .join(" ")
          .toLowerCase();
        const score = matchedSignals.reduce(
          (total, signal) => total + (haystack.includes(signal) ? 1 : 0),
          0
        );

        return {
          command: {
            ...command,
            source: "context" as const,
          },
          score,
        };
      })
      .filter((result) => result.score > 0)
      .sort((first, second) => second.score - first.score)
      .map((result) => result.command)
      .slice(0, 3);
  }, [allowedCommands, pathname]);
  const recentCommands = recentCommandHrefs
    .map((href) =>
      allowedCommands.find((command) => command.href === href)
    )
    .filter((command): command is CommandItem => Boolean(command));
  const fallbackRecordCommands = useMemo<CommandItem[]>(() => {
    if (typedCommandTakesPriority) {
      return [];
    }

    const intent = commandIntent(recordLookupQuery);
    const lookup = intent.lookup;
    const cleanValue = normalizeLookupValue(lookup.value);
    const encoded = encodeURIComponent(cleanValue || recordLookupQuery);

    if (!cleanValue) {
      return [];
    }

    if (lookup.type === "invoice") {
      return [
        {
          title: `Search invoices for ${cleanValue}`,
          detail:
            intent.action === "pay"
              ? "No exact invoice shortcut yet. Open Payments with this search."
              : "No exact invoice shortcut yet. Open invoice search with this value.",
          href:
            intent.action === "pay"
              ? `/payments?business=${business}&q=${encoded}`
              : `/invoices?business=${business}&q=${encoded}`,
          tone: "cash",
          keywords: ["invoice", cleanValue],
          source: "fallback",
          actionLabel: intent.action === "pay" ? "Pay" : "Search",
        },
      ];
    }

    if (lookup.type === "estimate") {
      return [
        {
          title: `Search estimates for ${cleanValue}`,
          detail: "No exact estimate shortcut yet. Open estimate search with this value.",
          href: `/estimates?business=${business}&q=${encoded}`,
          tone: "create",
          keywords: ["estimate", cleanValue],
          source: "fallback",
          actionLabel: "Search",
        },
      ];
    }

    if (lookup.type === "queue") {
      return [
        {
          title: `Search queue for ${cleanValue}`,
          detail: "Open queue search for this unit, property, or request.",
          href: `/queue?business=${business}&q=${encoded}`,
          tone: "queue",
          keywords: ["queue", "unit", cleanValue],
          source: "fallback",
          actionLabel: "Search",
        },
      ];
    }

    if (lookup.type === "client") {
      return [
        {
          title: `Search clients for ${cleanValue}`,
          detail: "Open the client book with this search filled in.",
          href: `/clients?business=${business}&q=${encoded}`,
          tone: "client",
          keywords: ["client", "customer", cleanValue],
          source: "fallback",
          actionLabel: "Search",
        },
      ];
    }

    return [
      {
        title: `Search invoices for ${cleanValue}`,
        detail: "Search invoice numbers, customers, projects, and statuses.",
        href: `/invoices?business=${business}&q=${encoded}`,
        tone: "cash",
        keywords: ["invoice", cleanValue],
        source: "fallback",
        actionLabel: "Search",
      },
      {
        title: `Search queue for ${cleanValue}`,
        detail: "Search active queue units, properties, notes, and paint due dates.",
        href: `/queue?business=${business}&q=${encoded}`,
        tone: "queue",
        keywords: ["queue", "unit", cleanValue],
        source: "fallback",
        actionLabel: "Search",
      },
    ];
  }, [business, recordLookupQuery, typedCommandTakesPriority]);
  const allowedFallbackRecordCommands = useMemo(
    () =>
      fallbackRecordCommands.filter((command) =>
        commandAllowedForRole(command, role)
      ),
    [fallbackRecordCommands, role]
  );
  const allowedSmartCommands = useMemo(
    () =>
      smartCommands.filter((command) =>
        commandAllowedForRole(command, role)
      ),
    [smartCommands, role]
  );
  const visibleCommands = (
    normalizedQuery
      ? [
          ...(typedCommandTakesPriority ? [] : intentShortcutCommands),
          ...(canResolveRecords && !typedCommandTakesPriority
            ? recordCommands.filter((command) =>
                commandAllowedForRole(command, role)
              )
            : []),
          ...allowedFallbackRecordCommands.filter(
            (fallback) =>
              !(canResolveRecords && !typedCommandTakesPriority
                ? recordCommands
                : []
              ).some(
                (record) => record.href === fallback.href
              )
          ),
          ...[...allowedSmartCommands, ...allowedCommands]
            .map((command) => ({
              command,
              score: commandSearchScore(
                command,
                normalizedQuery,
                recentCommandHrefs
              ),
            }))
            .filter((result) => result.score > 0)
            .sort((first, second) => second.score - first.score)
            .map((result) => result.command),
        ]
      : [
          ...recentCommands,
          ...pageContextCommands.filter(
            (command) => !recentCommandHrefs.includes(command.href)
          ),
          ...allowedSmartCommands.filter(
            (command) =>
              !recentCommandHrefs.includes(command.href) &&
              !pageContextCommands.some(
                (pageCommand) => pageCommand.href === command.href
              )
          ),
          ...allowedCommands.filter(
            (command) =>
              !recentCommandHrefs.includes(command.href) &&
              !pageContextCommands.some(
                (pageCommand) => pageCommand.href === command.href
              ) &&
              !allowedSmartCommands.some(
                (smartCommand) => smartCommand.href === command.href
              )
          ),
        ]
  )
    .filter(
      (command, index, allCommands) =>
        allCommands.findIndex((item) => item.href === command.href) === index
    )
    .slice(0, 10);
  const selectedCommand =
    visibleCommands[Math.min(selectedIndex, visibleCommands.length - 1)];
  const selectedCommandSourceLabel =
    selectedCommand?.source === "smart"
      ? "Smart suggestion"
      : selectedCommand?.source === "context"
        ? "This page"
      : selectedCommand?.source === "record"
        ? "Record match"
        : "Workflow";

  function openCommandCenter() {
    setIsOpen(true);
    setSelectedIndex(0);
  }

  function closeCommandCenter() {
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(0);
    setRecordCommands([]);
    setTypedCommandPreview(null);
    setIsResolvingRecords(false);
    setIsResolvingSmartCommands(false);
  }

  function rememberCommand(command: CommandItem) {
    setRecentCommandHrefs((currentHrefs) =>
      saveRecentCommandHref(command.href, currentHrefs)
    );
  }

  function runCommand(command: CommandItem) {
    rememberCommand(command);
    closeCommandCenter();
    router.push(command.href);
  }

  function applyCommandExample(example: string) {
    setQuery(example);
    setSelectedIndex(0);
    setRecordCommands([]);
    setTypedCommandPreview(null);
    setIsResolvingRecords(false);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  async function confirmTypedCommand() {
    if (
      !typedCommandPreview ||
      typedCommandPreview.state !== "ready"
    ) {
      return;
    }

    if (typedCommandPreview.targetHref) {
      closeCommandCenter();
      router.push(typedCommandPreview.targetHref);
      return;
    }

    if (
      typedCommandPreview.kind !== "set_eta" &&
      typedCommandPreview.kind !== "set_progress"
    ) {
      return;
    }

    if (typedCommandPreview.matches.length !== 1) {
      return;
    }

    const item = typedCommandPreview.matches[0];
    setTypedCommandPreview({
      ...typedCommandPreview,
      state: "saving",
      message:
        typedCommandPreview.kind === "set_eta"
          ? "Saving Robbie ETA..."
          : "Saving progress...",
    });

    const { data: businessData } = await supabase
      .from("businesses")
      .select("id")
      .eq("slug", business)
      .limit(1)
      .maybeSingle();

    if (!businessData?.id) {
      setTypedCommandPreview({
        ...typedCommandPreview,
        state: "error",
        message: "I could not load this workspace. Try opening the queue item instead.",
      });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const updatePayload =
      typedCommandPreview.kind === "set_eta"
        ? {
            projected_completion_date: typedCommandPreview.etaDate ?? null,
          }
        : {
            progress_stage: typedCommandPreview.progressStage ?? null,
            percent_complete:
              typedCommandPreview.percentComplete === undefined
                ? item.percent_complete ?? null
                : typedCommandPreview.percentComplete,
            ...(typedCommandPreview.markComplete
              ? {
                  status: "Completed",
                  completed_date: today,
                }
              : {}),
          };

    const { error } = await supabase
      .from("queue_items")
      .update(updatePayload)
      .eq("id", item.id)
      .eq("business_id", businessData.id);

    if (error) {
      setTypedCommandPreview({
        ...typedCommandPreview,
        state: "error",
        message:
          typedCommandPreview.kind === "set_eta"
            ? "Robbie ETA could not be saved. The progress/ETA SQL may still need to be applied."
            : "Progress could not be saved. The progress/ETA SQL may still need to be applied.",
      });
      return;
    }

    const progressChanges =
      typedCommandPreview.kind === "set_progress"
        ? [
            {
              field: "progress_stage",
              label: "Progress",
              previousValue: item.progress_stage ?? null,
              newValue: typedCommandPreview.progressStage ?? null,
            },
            {
              field: "percent_complete",
              label: "Percent Complete",
              previousValue: item.percent_complete ?? null,
              newValue:
                typedCommandPreview.percentComplete === undefined
                  ? item.percent_complete ?? null
                  : typedCommandPreview.percentComplete,
            },
            ...(typedCommandPreview.markComplete
              ? [
                  {
                    field: "status",
                    label: "Status",
                    previousValue: item.status ?? null,
                    newValue: "Completed",
                  },
                  {
                    field: "completed_date",
                    label: "Completed Date",
                    previousValue: item.completed_date ?? null,
                    newValue: today,
                  },
                ]
              : []),
          ].filter((change) => change.previousValue !== change.newValue)
        : [];

    await logActivity({
      businessId: businessData.id,
      action:
        typedCommandPreview.kind === "set_eta"
          ? "queue_item.robbie_eta_changed"
          : typedCommandPreview.markComplete
            ? "queue_item.completed"
            : "queue_item.progress_changed",
      entityType: "queue_item",
      entityId: item.id,
      entityLabel: `${item.property || "Property"} - Unit ${item.unit || "-"}`,
      details:
        typedCommandPreview.kind === "set_eta"
          ? {
              field: "projected_completion_date",
              label: "Robbie ETA",
              previousValue: item.projected_completion_date ?? null,
              newValue: typedCommandPreview.etaDate,
              source: "quick_command_center",
              rawCommand: query,
              changes: [
                {
                  field: "projected_completion_date",
                  label: "Robbie ETA",
                  previousValue: item.projected_completion_date ?? null,
                  newValue: typedCommandPreview.etaDate,
                },
              ],
            }
          : {
              source: "quick_command_center",
              rawCommand: query,
              changes: progressChanges,
            },
    });

    if (typedCommandPreview.markComplete) {
      await appendUnitHistoryForQueueItem({
        queueItemId: item.id,
        businessId: businessData.id,
        eventType: "general_turn",
        eventDate: today,
      });
    }

    setTypedCommandPreview({
      ...typedCommandPreview,
      state: "done",
      message:
        typedCommandPreview.kind === "set_eta"
          ? `Robbie ETA saved for ${item.unit || typedCommandPreview.unit}.`
          : `Progress saved for ${item.unit || typedCommandPreview.unit}.`,
    });
    setRecordCommands((currentCommands) =>
      currentCommands.map((command) => {
        if (command.href !== `/queue/${item.id}?business=${business}`) {
          return command;
        }

        return {
          ...command,
          detail:
            typedCommandPreview.kind === "set_eta"
              ? `${command.detail} / Robbie ETA ${typedCommandPreview.etaDate}`
              : `${command.detail} / Progress ${typedCommandPreview.progressStage}`,
        };
      })
    );
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const parsedTypedCommand = parseTypedCommand(query);

    if (!parsedTypedCommand) {
      return;
    }

    let isActive = true;
    const timer = window.setTimeout(async () => {
      if (!canUseTypedCommands(role)) {
        setTypedCommandPreview({
          kind: parsedTypedCommand.kind,
          state: "blocked",
          unit: parsedTypedCommand.unit,
          etaDate: "etaDate" in parsedTypedCommand ? parsedTypedCommand.etaDate : undefined,
          progressStage:
            "progressStage" in parsedTypedCommand
              ? parsedTypedCommand.progressStage
              : undefined,
          matches: [],
          message: "Typed queue, estimate, and invoice commands are owner/admin only.",
        });
        return;
      }

      if (
        "error" in parsedTypedCommand &&
        typeof parsedTypedCommand.error === "string"
      ) {
        setTypedCommandPreview({
          kind: parsedTypedCommand.kind,
          state: "blocked",
          unit: parsedTypedCommand.unit,
          etaDate: "etaDate" in parsedTypedCommand ? "" : undefined,
          matches: [],
          message: parsedTypedCommand.error,
        });
        return;
      }

      setTypedCommandPreview({
        kind: parsedTypedCommand.kind,
        state: "blocked",
        unit: parsedTypedCommand.unit,
        etaDate: "etaDate" in parsedTypedCommand ? parsedTypedCommand.etaDate : undefined,
        progressStage:
          "progressStage" in parsedTypedCommand
            ? parsedTypedCommand.progressStage
            : undefined,
        percentComplete:
          "percentComplete" in parsedTypedCommand
            ? parsedTypedCommand.percentComplete
            : undefined,
        markComplete:
          "markComplete" in parsedTypedCommand
            ? parsedTypedCommand.markComplete
            : undefined,
        matches: [],
        message: "Checking queue item...",
      });

      const { data: businessData } = await supabase
        .from("businesses")
        .select("id")
        .eq("slug", business)
        .limit(1)
        .maybeSingle();

      if (!isActive) {
        return;
      }

      if (!businessData?.id) {
        setTypedCommandPreview({
          kind: parsedTypedCommand.kind,
          state: "error",
          unit: parsedTypedCommand.unit,
          etaDate: "etaDate" in parsedTypedCommand ? parsedTypedCommand.etaDate : undefined,
          matches: [],
          message: "I could not load this workspace.",
        });
        return;
      }

      if (parsedTypedCommand.kind === "show_queue_group") {
        const { data, error } = await supabase
          .from("queue_items")
          .select(
            "id, property, unit, status, priority, ready_date, projected_completion_date, progress_stage, percent_complete, completed_date, linked_estimate_id"
          )
          .eq("business_id", businessData.id)
          .order("ready_date", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(60);

        if (!isActive) {
          return;
        }

        if (error) {
          setTypedCommandPreview({
            kind: parsedTypedCommand.kind,
            state: "error",
            unit: parsedTypedCommand.unit,
            group: parsedTypedCommand.group,
            matches: [],
            message: "I could not check the queue right now.",
          });
          return;
        }

        const queueItems = (data ?? []) as QueueSearchRecord[];
        const matches =
          parsedTypedCommand.group === "overdue"
            ? queueItems.filter(queueItemIsOverdue)
            : parsedTypedCommand.group === "at_risk"
              ? queueItems.filter(queueItemIsAtRisk)
              : queueItems.filter(queueItemIsBlocked);
        const label =
          parsedTypedCommand.group === "overdue"
            ? "overdue"
            : parsedTypedCommand.group === "at_risk"
              ? "at-risk"
              : "blocked/waiting";

        setTypedCommandPreview({
          kind: parsedTypedCommand.kind,
          state: "ready",
          unit: parsedTypedCommand.unit,
          group: parsedTypedCommand.group,
          matches: matches.slice(0, 8),
          targetHref: `/queue?business=${business}&sort=deadline`,
          confirmLabel: "Open Queue",
          message:
            matches.length > 0
              ? `Found ${matches.length} ${label} queue item${
                  matches.length === 1 ? "" : "s"
                }. Open Queue sorted by deadline?`
              : `No ${label} queue items found right now. Open Queue anyway?`,
        });
        return;
      }

      const unitNeedles = queueUnitNeedles(parsedTypedCommand.unit);
      const queueNeedleClauses = unitNeedles
        .map((needle) => safeIlikeNeedle(needle))
        .filter(Boolean)
        .map((needle) => `unit.ilike.%${needle}%`);
      const { data, error } = await supabase
        .from("queue_items")
        .select(
          "id, property, unit, status, priority, ready_date, projected_completion_date, progress_stage, percent_complete, completed_date, linked_estimate_id"
        )
        .eq("business_id", businessData.id)
        .or(queueNeedleClauses.join(","))
        .order("created_at", { ascending: false })
        .limit(8);

      if (!isActive) {
        return;
      }

      if (error) {
        setTypedCommandPreview({
          kind: parsedTypedCommand.kind,
          state: "error",
          unit: parsedTypedCommand.unit,
          etaDate: "etaDate" in parsedTypedCommand ? parsedTypedCommand.etaDate : undefined,
          matches: [],
          message:
            "I could not check queue items. The progress/ETA SQL may still need to be applied.",
        });
        return;
      }

      const matches = ((data ?? []) as QueueSearchRecord[]).filter((item) => {
        const itemNeedles = queueUnitNeedles(item.unit ?? "");
        return itemNeedles.some((needle) => unitNeedles.includes(needle));
      });
      const resolvedMatches =
        parsedTypedCommand.kind === "create_invoice"
          ? matches.filter(isActiveQueueItem)
          : matches;

      if (resolvedMatches.length === 1) {
        const item = resolvedMatches[0];
        const queueHref = `/queue/${item.id}?business=${business}`;

        if (parsedTypedCommand.kind === "open_queue") {
          setTypedCommandPreview({
            kind: parsedTypedCommand.kind,
            state: "ready",
            unit: parsedTypedCommand.unit,
            matches: resolvedMatches,
            targetHref: queueHref,
            confirmLabel: "Open",
            message: `Open ${item.property || "property"} Unit ${
              item.unit || parsedTypedCommand.unit
            }?`,
          });
          return;
        }

        if (parsedTypedCommand.kind === "set_progress") {
          setTypedCommandPreview({
            kind: parsedTypedCommand.kind,
            state: "ready",
            unit: parsedTypedCommand.unit,
            progressStage: parsedTypedCommand.progressStage,
            percentComplete: parsedTypedCommand.percentComplete,
            markComplete: parsedTypedCommand.markComplete,
            matches: resolvedMatches,
            confirmLabel: "Confirm",
            message: `Change ${item.property || "property"} Unit ${
              item.unit || parsedTypedCommand.unit
            } from ${item.progress_stage || "Not Started"} to ${
              parsedTypedCommand.progressStage
            }?`,
          });
          return;
        }

        if (parsedTypedCommand.kind === "create_estimate") {
          let linkedEstimate: TypedEstimateRecord | null = null;

          if (item.linked_estimate_id) {
            const { data: estimateData } = await supabase
              .from("estimates")
              .select("id, display_id, status")
              .eq("id", item.linked_estimate_id)
              .eq("business_id", businessData.id)
              .maybeSingle();
            linkedEstimate = estimateData as TypedEstimateRecord | null;
          } else {
            const { data: estimateData } = await supabase
              .from("estimates")
              .select("id, display_id, status")
              .eq("business_id", businessData.id)
              .eq("queue_item_id", item.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            linkedEstimate = estimateData as TypedEstimateRecord | null;
          }

          if (!isActive) {
            return;
          }

          setTypedCommandPreview({
            kind: parsedTypedCommand.kind,
            state: "ready",
            unit: parsedTypedCommand.unit,
            matches: resolvedMatches,
            estimate: linkedEstimate,
            targetHref: linkedEstimate
              ? `/estimates/${linkedEstimate.id}?business=${business}`
              : `/estimates/new?queueId=${item.id}&business=${business}`,
            confirmLabel: linkedEstimate ? "Open Estimate" : "Create Estimate",
            message: linkedEstimate
              ? `An estimate already exists for Unit ${
                  item.unit || parsedTypedCommand.unit
                }. Open ${linkedEstimate.display_id || "the estimate"} instead?`
              : `Create an estimate from ${item.property || "property"} Unit ${
                  item.unit || parsedTypedCommand.unit
                }?`,
          });
          return;
        }

        if (
          parsedTypedCommand.kind === "create_invoice" ||
          parsedTypedCommand.kind === "send_invoice"
        ) {
          let linkedEstimate: TypedEstimateRecord | null = null;

          if (item.linked_estimate_id) {
            const { data: estimateData } = await supabase
              .from("estimates")
              .select("id, display_id, status")
              .eq("id", item.linked_estimate_id)
              .eq("business_id", businessData.id)
              .maybeSingle();
            linkedEstimate = estimateData as TypedEstimateRecord | null;
          } else {
            const { data: estimateData } = await supabase
              .from("estimates")
              .select("id, display_id, status")
              .eq("business_id", businessData.id)
              .eq("queue_item_id", item.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            linkedEstimate = estimateData as TypedEstimateRecord | null;
          }

          let linkedInvoice: TypedInvoiceRecord | null = null;

          if (linkedEstimate?.id) {
            const { data: invoiceData } = await supabase
              .from("invoices")
              .select(
                "id, display_id, customer_name, project_title, status, invoice_amount, amount_paid, client_id"
              )
              .eq("business_id", businessData.id)
              .eq("estimate_id", linkedEstimate.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            linkedInvoice = invoiceData as TypedInvoiceRecord | null;
          }

          if (!isActive) {
            return;
          }

          if (parsedTypedCommand.kind === "create_invoice") {
            if (linkedInvoice) {
              setTypedCommandPreview({
                kind: parsedTypedCommand.kind,
                state: "ready",
                unit: parsedTypedCommand.unit,
                matches: resolvedMatches,
                estimate: linkedEstimate,
                invoice: linkedInvoice,
                targetHref: `/invoices/${linkedInvoice.id}?business=${business}`,
                confirmLabel: "Open Invoice",
                message: `An invoice already exists for Unit ${
                  item.unit || parsedTypedCommand.unit
                }. Open ${linkedInvoice.display_id || "the invoice"} instead?`,
              });
              return;
            }

            if (linkedEstimate) {
              setTypedCommandPreview({
                kind: parsedTypedCommand.kind,
                state: "ready",
                unit: parsedTypedCommand.unit,
                matches: resolvedMatches,
                estimate: linkedEstimate,
                targetHref: `/estimates/${linkedEstimate.id}?business=${business}`,
                confirmLabel: "Open Estimate",
                message: `Open ${
                  linkedEstimate.display_id || "the linked estimate"
                } so Trimax can convert it to an invoice?`,
              });
              return;
            }

            setTypedCommandPreview({
              kind: parsedTypedCommand.kind,
              state: "blocked",
              unit: parsedTypedCommand.unit,
              matches: resolvedMatches,
              message: `Unit ${
                item.unit || parsedTypedCommand.unit
              } does not have an estimate yet. Create the estimate first, then convert it to an invoice.`,
            });
            return;
          }

          if (!linkedInvoice) {
            setTypedCommandPreview({
              kind: parsedTypedCommand.kind,
              state: "blocked",
              unit: parsedTypedCommand.unit,
              matches: resolvedMatches,
              message: linkedEstimate
                ? `No invoice exists yet for Unit ${
                    item.unit || parsedTypedCommand.unit
                  }. Convert the estimate to an invoice before sending.`
                : `Unit ${
                    item.unit || parsedTypedCommand.unit
                  } does not have an invoice yet.`,
            });
            return;
          }

          let recipientEmail: string | null = null;

          if (linkedInvoice.client_id) {
            const { data: clientData } = await supabase
              .from("clients")
              .select("email")
              .eq("id", linkedInvoice.client_id)
              .eq("business_id", businessData.id)
              .maybeSingle();
            recipientEmail =
              typeof clientData?.email === "string" ? clientData.email : null;
          }

          if (!isActive) {
            return;
          }

          if (!recipientEmail) {
            setTypedCommandPreview({
              kind: parsedTypedCommand.kind,
              state: "blocked",
              unit: parsedTypedCommand.unit,
              matches: resolvedMatches,
              invoice: linkedInvoice,
              message: `${linkedInvoice.display_id || "This invoice"} is missing a saved customer email. Open the invoice and add/confirm the recipient before sending.`,
            });
            return;
          }

          setTypedCommandPreview({
            kind: parsedTypedCommand.kind,
            state: "ready",
            unit: parsedTypedCommand.unit,
            matches: resolvedMatches,
            estimate: linkedEstimate,
            invoice: linkedInvoice,
            recipientEmail,
            targetHref: `/invoices/${linkedInvoice.id}?business=${business}#send-invoice`,
            confirmLabel: "Review Send",
            message: `Review sending ${
              linkedInvoice.display_id || "invoice"
            } for ${item.property || "property"} Unit ${
              item.unit || parsedTypedCommand.unit
            } to ${recipientEmail}. Amount ${formatMoney(
              linkedInvoice.invoice_amount
            )}.`,
          });
          return;
        }

        setTypedCommandPreview({
          kind: "set_eta",
          state: "ready",
          unit: parsedTypedCommand.unit,
          etaDate: parsedTypedCommand.etaDate,
          matches: resolvedMatches,
          message: `Set Robbie ETA for ${item.property || "property"} Unit ${
            item.unit || parsedTypedCommand.unit
          } to ${parsedTypedCommand.etaDate}?`,
        });
        return;
      }

      setTypedCommandPreview({
        kind: parsedTypedCommand.kind,
        state: resolvedMatches.length > 1 ? "ambiguous" : "blocked",
        unit: parsedTypedCommand.unit,
        etaDate: "etaDate" in parsedTypedCommand ? parsedTypedCommand.etaDate : undefined,
        matches: resolvedMatches,
        message:
          resolvedMatches.length > 1
            ? `I found ${resolvedMatches.length} matching units. Open the exact queue item first or include more context.`
            : parsedTypedCommand.kind === "create_invoice"
              ? `No active queue item found for ${parsedTypedCommand.unit}.`
              : `I could not find Unit ${parsedTypedCommand.unit} in this workspace.`,
      });
    }, 220);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [business, isOpen, query, role]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isActive = true;
    const timer = window.setTimeout(async () => {
      setIsResolvingSmartCommands(true);

      const { data: businessData } = await supabase
        .from("businesses")
        .select("id, slug")
        .eq("slug", business)
        .limit(1)
        .maybeSingle();

      if (!isActive) {
        return;
      }

      const selectedBusiness = businessData as BusinessRecord | null;

      if (!selectedBusiness?.id) {
        setSmartCommands([]);
        setIsResolvingSmartCommands(false);
        return;
      }

      const [invoiceResult, estimateResult, queueResult] = await Promise.all([
        canAccessNavItem(role, "invoices")
          ? supabase
              .from("invoices")
              .select(
                "id, display_id, customer_name, project_title, status, due_date, invoice_amount, amount_paid"
              )
              .eq("business_id", selectedBusiness.id)
              .order("due_date", { ascending: true, nullsFirst: false })
              .order("created_at", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] }),
        canAccessNavItem(role, "estimates")
          ? supabase
              .from("estimates")
              .select(
                "id, display_id, customer_name, project_title, status, estimate_amount"
              )
              .eq("business_id", selectedBusiness.id)
              .order("created_at", { ascending: false })
              .limit(12)
          : Promise.resolve({ data: [] }),
        canAccessNavItem(role, "queue")
          ? supabase
              .from("queue_items")
              .select(
                "id, property, unit, status, priority, ready_date, scheduled_date"
              )
              .eq("business_id", selectedBusiness.id)
              .order("ready_date", { ascending: true, nullsFirst: false })
              .order("created_at", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] }),
      ]);

      if (!isActive) {
        return;
      }

      setSmartCommands(
        buildSmartCommands({
          business,
          invoices: (invoiceResult.data ?? []) as SmartInvoiceRecord[],
          estimates: (estimateResult.data ?? []) as SmartEstimateRecord[],
          queueItems: (queueResult.data ?? []) as SmartQueueRecord[],
        })
      );
      setIsResolvingSmartCommands(false);
    }, 120);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [business, isOpen, role]);

  useEffect(() => {
    if (!isOpen || recordLookupQuery.trim().length < 2) {
      return;
    }

    if (parsedTypedQuery) {
      const timer = window.setTimeout(() => {
        setRecordCommands([]);
        setIsResolvingRecords(false);
      }, 0);

      return () => window.clearTimeout(timer);
    }

    let isActive = true;
    const timer = window.setTimeout(async () => {
      const intent = commandIntent(recordLookupQuery);
      const lookup = intent.lookup;
      const lookupValue = normalizeLookupValue(lookup.value);
      const needle = safeIlikeNeedle(displayIdNeedle(lookupValue));
      const textNeedle = safeIlikeNeedle(lookupValue);
      const queueNeedles = queueUnitNeedles(lookupValue);

      if (!lookupValue || (!needle && queueNeedles.length === 0)) {
        setRecordCommands([]);
        setIsResolvingRecords(false);
        return;
      }

      setIsResolvingRecords(true);

      const { data: businessData } = await supabase
        .from("businesses")
        .select("id, slug")
        .eq("slug", business)
        .limit(1)
        .maybeSingle();

      if (!isActive) {
        return;
      }

      const selectedBusiness = businessData as BusinessRecord | null;

      if (!selectedBusiness?.id) {
        setRecordCommands([]);
        setIsResolvingRecords(false);
        return;
      }

      const nextCommands: CommandItem[] = [];

      if (
        (lookup.type === "invoice" || lookup.type === "general") &&
        canAccessNavItem(role, "invoices") &&
        needle.length >= 2
      ) {
        const { data } = await supabase
          .from("invoices")
          .select("id, display_id, customer_name, project_title, status")
          .eq("business_id", selectedBusiness.id)
          .or(
            `display_id.ilike.%${needle}%,customer_name.ilike.%${textNeedle}%,project_title.ilike.%${textNeedle}%,reference.ilike.%${textNeedle}%`
          )
          .order("created_at", { ascending: false })
          .limit(5);

        ((data ?? []) as InvoiceSearchRecord[]).forEach((invoice) => {
          nextCommands.push(invoiceActionCommand(invoice, business, intent.action));
        });
      }

      if (
        (lookup.type === "estimate" || lookup.type === "general") &&
        canAccessNavItem(role, "estimates") &&
        needle.length >= 2
      ) {
        const { data } = await supabase
          .from("estimates")
          .select("id, display_id, customer_name, project_title, status")
          .eq("business_id", selectedBusiness.id)
          .or(
            `display_id.ilike.%${needle}%,customer_name.ilike.%${textNeedle}%,project_title.ilike.%${textNeedle}%,reference.ilike.%${textNeedle}%`
          )
          .order("created_at", { ascending: false })
          .limit(5);

        ((data ?? []) as EstimateSearchRecord[]).forEach((estimate) => {
          nextCommands.push(
            estimateActionCommand(estimate, business, intent.action)
          );
        });
      }

      if (
        (lookup.type === "queue" || lookup.type === "general") &&
        canAccessNavItem(role, "queue")
      ) {
        const queueNeedle = safeIlikeNeedle(queueNeedles[0] ?? lookupValue);

        if (queueNeedle.length >= 1) {
          const { data } = await supabase
            .from("queue_items")
            .select("id, property, unit, status, priority, ready_date")
            .eq("business_id", selectedBusiness.id)
            .or(
              `unit.ilike.%${queueNeedle}%,property.ilike.%${queueNeedle}%,notes.ilike.%${queueNeedle}%`
            )
            .order("created_at", { ascending: false })
            .limit(5);

          ((data ?? []) as QueueSearchRecord[]).forEach((item) => {
            nextCommands.push(queueActionCommand(item, business, intent.action));
          });
        }
      }

      if (
        (lookup.type === "client" || lookup.type === "general") &&
        canAccessNavItem(role, "clients")
      ) {
        const clientNeedle = safeIlikeNeedle(lookupValue);

        if (clientNeedle.length >= 2) {
          const { data } = await supabase
            .from("clients")
            .select("id, name, contact_name, email, phone")
            .eq("business_id", selectedBusiness.id)
            .or(
              `name.ilike.%${clientNeedle}%,contact_name.ilike.%${clientNeedle}%,email.ilike.%${clientNeedle}%,phone.ilike.%${clientNeedle}%`
            )
            .order("name", { ascending: true })
            .limit(5);

          ((data ?? []) as ClientSearchRecord[]).forEach((client) => {
            nextCommands.push(clientActionCommand(client, business, intent.action));
          });
        }
      }

      if (!isActive) {
        return;
      }

      const uniqueCommands = Array.from(
        new Map(nextCommands.map((command) => [command.href, command])).values()
      ).slice(0, 8);

      setRecordCommands(uniqueCommands);
      setIsResolvingRecords(false);
    }, 180);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [business, isOpen, parsedTypedQuery, recordLookupQuery, role]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((current) => !current);
        setSelectedIndex(0);
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        openCommandCenter();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={openCommandCenter}
        className="quick-command-launcher"
        aria-label="Open quick command center"
      >
        <span aria-hidden="true">/</span>
        <span>Command</span>
        <span className="quick-command-shortcut" aria-hidden="true">
          Ctrl/⌘ K
        </span>
      </button>

      {isOpen ? (
        <div
          className="quick-command-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCommandCenter();
            }
          }}
        >
          <div
            className="quick-command-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Quick command center"
          >
            <div className="quick-command-search-row">
              <span aria-hidden="true" className="quick-command-search-icon">
                /
              </span>
              <input
                ref={searchInputRef}
                aria-activedescendant={
                  selectedCommand
                    ? `quick-command-${selectedCommand.href
                        .replace(/[^a-zA-Z0-9]+/g, "-")
                        .replace(/^-|-$/g, "")}`
                    : undefined
                }
                aria-autocomplete="list"
                aria-controls="quick-command-results"
                aria-expanded={isOpen}
                value={query}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  setQuery(nextQuery);
                  setSelectedIndex(0);
                  setTypedCommandPreview(null);

                  if (nextQuery.trim().length < 2) {
                    setRecordCommands([]);
                    setIsResolvingRecords(false);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    closeCommandCenter();
                  }

                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSelectedIndex((current) =>
                      visibleCommands.length === 0
                        ? 0
                        : Math.min(current + 1, visibleCommands.length - 1)
                    );
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSelectedIndex((current) => Math.max(current - 1, 0));
                  }

                  if (event.key === "Enter" && selectedCommand) {
                    event.preventDefault();
                    runCommand(selectedCommand);
                  }
                }}
                placeholder="Try: overdue, proof, check photo, pay INV 502, schedule G03..."
                className="quick-command-input"
                role="combobox"
              />
              <button
                type="button"
                onClick={closeCommandCenter}
                className="quick-command-close"
                aria-label="Close quick command center"
              >
                Close
              </button>
            </div>

            <div className="quick-command-hints">
              <span>
                <kbd>Type</kbd> filters
              </span>
              <span>
                <kbd>Enter</kbd> opens
              </span>
              <span>
                <kbd>Esc</kbd> closes
              </span>
              <span>
                <kbd>/</kbd> or <kbd>Ctrl/⌘ K</kbd>
              </span>
            </div>

            {!normalizedQuery ? (
              <div
                className="quick-command-examples"
                aria-label="Command examples"
              >
                <span className="quick-command-examples-label">
                  Try one
                </span>
                {COMMAND_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="quick-command-example-chip"
                    onClick={() => applyCommandExample(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="quick-command-results" id="quick-command-results">
              <div className="quick-command-brief">
                <div>
                  <p className="quick-command-brief-kicker">Command Matrix</p>
                  <p className="quick-command-brief-title">
                    Type records, actions, or plain goals like overdue, proof,
                    check photo, security, or schedule.
                  </p>
                </div>
                <span>
                  {isResolvingRecords || isResolvingSmartCommands
                    ? "Thinking..."
                    : `${visibleCommands.length} ready`}
                </span>
              </div>

              {typedCommandPreview ? (
                <div
                  className="quick-command-route"
                  data-tone={
                    typedCommandPreview.state === "ready" ||
                    typedCommandPreview.state === "done"
                      ? "queue"
                      : typedCommandPreview.state === "ambiguous"
                        ? "setup"
                        : "system"
                  }
                >
                  <div className="quick-command-route-main">
                    <p className="quick-command-route-kicker">
                      Typed command preview
                    </p>
                    <strong>{typedCommandTitle(typedCommandPreview.kind)}</strong>
                    <span>{typedCommandPreview.message}</span>
                    {typedCommandPreview.invoice ? (
                      <span>
                        {[
                          typedCommandPreview.invoice.display_id,
                          typedCommandPreview.invoice.status,
                          formatMoney(typedCommandPreview.invoice.invoice_amount),
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                      </span>
                    ) : null}
                    {typedCommandPreview.estimate ? (
                      <span>
                        {[
                          typedCommandPreview.estimate.display_id,
                          typedCommandPreview.estimate.status,
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                      </span>
                    ) : null}
                    {typedCommandPreview.matches.length > 1 ? (
                      <span>
                        {typedCommandPreview.matches
                          .map(
                            (item) =>
                              `${item.property || "Property"} Unit ${
                                item.unit || "-"
                              }`
                          )
                          .join(" / ")}
                      </span>
                    ) : null}
                  </div>
                  <div className="quick-command-route-meta">
                    <span>Owner/Admin only</span>
                    <span>Preview required</span>
                    {typedCommandPreview.state === "ready" ? (
                      <button
                        type="button"
                        onClick={confirmTypedCommand}
                        className="rounded-full border border-emerald-300/40 bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-50"
                      >
                        {typedCommandPreview.confirmLabel ?? "Confirm"}
                      </button>
                    ) : null}
                    {typedCommandPreview.state !== "saving" ? (
                      <button
                        type="button"
                        onClick={() => setTypedCommandPreview(null)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-zinc-100"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {selectedCommand ? (
                <div
                  className="quick-command-route"
                  data-tone={selectedCommand.tone}
                >
                  <div className="quick-command-route-main">
                    <p className="quick-command-route-kicker">
                      Best command route
                    </p>
                    <strong>{selectedCommand.title}</strong>
                    <span>{selectedCommand.detail}</span>
                  </div>
                  <div className="quick-command-route-meta">
                    <span>{selectedCommandSourceLabel}</span>
                    <span>{selectedCommand.actionLabel ?? "Open"}</span>
                    <span>Enter opens</span>
                  </div>
                </div>
              ) : null}

              {!normalizedQuery && recentCommands.length > 0 ? (
                <p className="quick-command-section-label">
                  Recent workflows
                </p>
              ) : null}

              {!normalizedQuery && pageContextCommands.length > 0 ? (
                <p className="quick-command-section-label">
                  This page suggestions
                </p>
              ) : null}

              {!normalizedQuery && smartCommands.length > 0 ? (
                <p className="quick-command-section-label">
                  Smart suggestions from current work
                </p>
              ) : null}

              {!normalizedQuery &&
              recentCommands.length === 0 &&
              smartCommands.length === 0 ? (
                <p className="quick-command-section-label">
                  Suggested workflows
                </p>
              ) : null}

              {normalizedQuery ? (
                <p className="quick-command-section-label">
                  {recordCommands.length > 0
                    ? `${recordCommands.length} record match${
                        recordCommands.length === 1 ? "" : "es"
                      } / `
                    : ""}
                  {visibleCommands.length} total match
                  {visibleCommands.length === 1 ? "" : "es"}
                </p>
              ) : null}

              {visibleCommands.length > 0 ? (
                visibleCommands.map((command, index) => (
                  <Link
                    key={command.href}
                    id={`quick-command-${command.href
                      .replace(/[^a-zA-Z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")}`}
                    href={command.href}
                    data-tone={command.tone}
                    data-active={index === selectedIndex}
                    data-recent={recentCommandHrefs.includes(command.href)}
                    className="quick-command-result"
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => {
                      rememberCommand(command);
                      closeCommandCenter();
                    }}
                  >
                    <span className="quick-command-result-mark" />
                    <span className="min-w-0">
                      <span className="quick-command-title-row">
                        <span className="quick-command-result-title">
                          {command.title}
                        </span>
                        {recentCommandHrefs.includes(command.href) ? (
                          <span className="quick-command-recent-pill">
                            Recent
                          </span>
                        ) : null}
                        {command.source === "record" ? (
                          <span className="quick-command-recent-pill">
                            Record
                          </span>
                        ) : null}
                        {command.source === "smart" ? (
                          <span className="quick-command-smart-pill">
                            Smart
                          </span>
                        ) : null}
                        {command.source === "context" ? (
                          <span className="quick-command-page-pill">
                            Page
                          </span>
                        ) : null}
                        {command.actionLabel ? (
                          <span className="quick-command-action-pill">
                            {command.actionLabel}
                          </span>
                        ) : null}
                      </span>
                      <span className="quick-command-result-detail">
                        {command.detail}
                      </span>
                    </span>
                  </Link>
                ))
              ) : (
                <div className="quick-command-empty">
                  No matching workflow found.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
