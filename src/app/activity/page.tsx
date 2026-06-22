"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type ActivityLog = {
  id: string;
  business_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

type DetailChip = {
  label: string;
  value: string;
};

type AuditSignal = {
  label: string;
  count: number;
  detail: string;
  status: "ready" | "watch" | "quiet";
};

type OperationalSignal = {
  label: string;
  value: string;
  detail: string;
  status: "ready" | "watch" | "quiet";
};

type ReportingReadinessItem = {
  label: string;
  value: string;
  detail: string;
  status: "ready" | "watch" | "quiet";
};

type ActivityChange = {
  field: string;
  label: string;
  previousValue: unknown;
  newValue: unknown;
};

type ActivityTypeFilter =
  | "all"
  | "queue"
  | "operations"
  | "estimate"
  | "invoice"
  | "payment"
  | "split";

const activityFilters: Array<{ label: string; value: ActivityTypeFilter }> = [
  { label: "All", value: "all" },
  { label: "Queue", value: "queue" },
  { label: "Operations", value: "operations" },
  { label: "Estimates", value: "estimate" },
  { label: "Invoices", value: "invoice" },
  { label: "Payments", value: "payment" },
  { label: "Splits", value: "split" },
];

function formatDateTime(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return "";
}

function formatDetailValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return new Intl.NumberFormat("en-US").format(value);
  }

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => String(item))
      .join(", ");
  }

  return String(value);
}

function dateOnly(value: unknown) {
  return typeof value === "string" && value.length >= 10
    ? value.slice(0, 10)
    : "";
}

function extractActivityChanges(log: ActivityLog): ActivityChange[] {
  const changes = log.details?.changes;

  if (!Array.isArray(changes)) {
    return [];
  }

  return changes
    .filter(
      (
        change
      ): change is {
        field?: unknown;
        label?: unknown;
        previousValue?: unknown;
        newValue?: unknown;
      } => Boolean(change) && typeof change === "object"
    )
    .map((change) => {
      const field = typeof change.field === "string" ? change.field : "";

      return {
        field,
        label:
          typeof change.label === "string"
            ? change.label
            : field
              ? prettifyKey(field)
              : "Changed",
        previousValue: change.previousValue ?? null,
        newValue: change.newValue ?? null,
      };
    })
    .filter((change) => change.field.length > 0);
}

function escapeCsv(value: unknown) {
  const stringValue = String(value ?? "");

  if (
    stringValue.includes(",") ||
    stringValue.includes("\"") ||
    stringValue.includes("\n") ||
    stringValue.includes("\r")
  ) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }

  return stringValue;
}

function downloadCsv({
  fileName,
  logs,
}: {
  fileName: string;
  logs: ActivityLog[];
}) {
  const rows = [
    [
      "Date",
      "Action",
      "Item",
      "Type",
      "User",
      "Recipient",
      "CC",
      "Private Copy",
      "PDF Attached",
      "Payment Reference",
      "Check Amount",
      "Amount Applied",
      "Changed Fields",
      "Changes",
      "Details",
    ],
    ...logs.map((log) => {
      const details = log.details ?? {};
      const changes = extractActivityChanges(log);

      return [
        formatDateTime(log.created_at),
        actionLabel(log.action),
        log.entity_label ?? "",
        log.entity_type,
        log.actor_email ?? "",
        formatDetailValue(details.recipient_email),
        formatDetailValue(details.cc_email),
        formatDetailValue(details.bcc_email),
        formatDetailValue(details.pdf_attached),
        formatDetailValue(details.paymentReference),
        formatMoney(details.checkAmount),
        formatMoney(details.amountApplied),
        changes.map((change) => change.field).join("; "),
        changes
          .map(
            (change) =>
              `${change.label}: ${formatDetailValue(
                change.previousValue
              ) || "Blank"} -> ${
                formatDetailValue(change.newValue) || "Blank"
              }`
          )
          .join("; "),
        JSON.stringify(details),
      ];
    }),
  ];
  const csv = rows
    .map((row) => row.map((value) => escapeCsv(value)).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function prettifyKey(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "queue_item.created": "Queue Item Created",
    "queue_item.updated": "Queue Item Updated",
    "queue_item.scheduled": "Queue Item Scheduled",
    "queue_item.completed": "Queue Item Completed",
    "estimate.created": "Estimate Created",
    "estimate.updated": "Estimate Updated",
    "estimate.converted_to_invoice": "Estimate Converted",
    "estimate.deleted": "Estimate Deleted",
    "invoice.created": "Invoice Created",
    "invoice.updated": "Invoice Updated",
    "invoice.status_updated": "Invoice Status Updated",
    "invoice.email_sent": "Invoice Emailed",
    "invoice.payment_reminder_sent": "Payment Reminder Sent",
    "invoice.batch_payment_applied": "Batch Payment Applied",
    "invoice.recurring_draft_created": "Recurring Draft Created",
    "invoice.split_created": "Split Invoices Created",
    "job_session.started": "Job Session Started",
    "job_session.resumed": "Job Session Resumed",
    "job_session.stopped": "Job Session Stopped",
    "job_session.breakdown_saved": "Job Time Breakdown Saved",
    "job_session.breakdown_skipped": "Job Time Breakdown Skipped",
    "technician.job_session_started": "Technician Session Started",
    "technician.job_session_resumed": "Technician Session Resumed",
    "technician.job_session_paused": "Technician Session Paused",
    "technician.job_session_stopped": "Technician Session Stopped",
    "technician.job_completed": "Technician Job Completed",
    "access_request.created": "Access Request Created",
    "import.clients_csv_completed": "Client CSV Import",
    "import.invoices_csv_completed": "Invoice CSV Import",
  };

  return labels[action] ?? action;
}

function actionTone(action: string) {
  if (action.includes("payment")) {
    return "text-emerald-200 border-emerald-400/30 bg-emerald-400/10";
  }

  if (action.includes("split")) {
    return "text-orange-300 border-orange-500/30 bg-orange-500/10";
  }

  if (action.startsWith("queue_item")) {
    return "text-sky-300 border-sky-500/30 bg-sky-500/10";
  }

  if (action.startsWith("job_session") || action.startsWith("technician")) {
    return "text-teal-200 border-teal-400/30 bg-teal-400/10";
  }

  if (action.startsWith("estimate")) {
    return "text-purple-300 border-purple-500/30 bg-purple-500/10";
  }

  if (action.startsWith("invoice")) {
    return "text-amber-300 border-amber-500/30 bg-amber-500/10";
  }

  if (action.startsWith("access_request")) {
    return "text-orange-300 border-orange-500/30 bg-orange-500/10";
  }

  if (action.startsWith("import")) {
    return "text-green-300 border-green-500/30 bg-green-500/10";
  }

  return "text-zinc-300 border-zinc-700 bg-zinc-950";
}

function actionAccent(action: string) {
  if (action.includes("payment")) {
    return "bg-emerald-300 shadow-[0_0_24px_rgba(110,231,183,0.5)]";
  }

  if (action.includes("split")) {
    return "bg-orange-300 shadow-[0_0_24px_rgba(253,186,116,0.5)]";
  }

  if (action.startsWith("queue_item")) {
    return "bg-sky-300 shadow-[0_0_24px_rgba(125,211,252,0.5)]";
  }

  if (action.startsWith("job_session") || action.startsWith("technician")) {
    return "bg-teal-300 shadow-[0_0_24px_rgba(94,234,212,0.5)]";
  }

  if (action.startsWith("estimate")) {
    return "bg-violet-300 shadow-[0_0_24px_rgba(196,181,253,0.5)]";
  }

  if (action.startsWith("invoice")) {
    return "bg-amber-300 shadow-[0_0_24px_rgba(252,211,77,0.5)]";
  }

  return "bg-zinc-400";
}

function detailChips(log: ActivityLog): DetailChip[] {
  const details = log.details ?? {};
  const changes = Array.isArray(details.changes)
    ? details.changes
        .filter(
          (
            change
          ): change is {
            label?: unknown;
            field?: unknown;
            previousValue?: unknown;
            newValue?: unknown;
          } => Boolean(change) && typeof change === "object"
        )
        .slice(0, 4)
    : [];

  if (changes.length > 0) {
    return changes
      .map((change) => {
        const label =
          typeof change.label === "string"
            ? change.label
            : typeof change.field === "string"
              ? prettifyKey(change.field)
              : "Changed";
        const isDateField =
          typeof change.field === "string" &&
          change.field.toLowerCase().includes("date");
        const previousValue =
          isDateField && typeof change.previousValue === "string"
            ? formatDate(change.previousValue)
            : formatDetailValue(change.previousValue);
        const newValue =
          isDateField && typeof change.newValue === "string"
            ? formatDate(change.newValue)
            : formatDetailValue(change.newValue);

        return {
          label,
          value: `${previousValue || "Blank"} -> ${newValue || "Blank"}`,
        };
      })
      .filter((chip) => chip.value.length > 0);
  }

  if (
    log.action === "invoice.email_sent" ||
    log.action === "invoice.payment_reminder_sent" ||
    log.action === "estimate.email_sent"
  ) {
    return [
      { label: "To", value: formatDetailValue(details.recipient_email) },
      { label: "CC", value: formatDetailValue(details.cc_email) },
      { label: "Private Copy", value: formatDetailValue(details.bcc_email) },
      { label: "Subject", value: formatDetailValue(details.subject) },
      {
        label: "PDF",
        value:
          details.pdf_attached === true
            ? `Attached${
                details.pdf_attachment_source
                  ? ` (${formatDetailValue(details.pdf_attachment_source)})`
                  : ""
              }`
            : "Not attached",
      },
      { label: "Sender", value: formatDetailValue(details.sender_email) },
    ].filter((chip) => chip.value.length > 0);
  }

  if (log.action === "invoice.batch_payment_applied") {
    return [
      { label: "Payment Date", value: formatDate(details.paymentDate) },
      { label: "Type", value: formatDetailValue(details.paymentType) },
      {
        label: "Reference",
        value: formatDetailValue(details.paymentReference),
      },
      { label: "Check Amount", value: formatMoney(details.checkAmount) },
      { label: "Applied", value: formatMoney(details.amountApplied) },
      {
        label: "Batch Count",
        value: formatDetailValue(details.batchInvoiceCount),
      },
      {
        label: "Stub Match",
        value: formatDetailValue(details.remittanceStubMatched),
      },
      {
        label: "Stub Image",
        value: formatDetailValue(details.paymentImageFileName),
      },
      { label: "Note", value: formatDetailValue(details.internalNote) },
    ].filter((chip) => chip.value.length > 0);
  }

  if (log.action === "invoice.split_created") {
    return [
      { label: "Split Count", value: formatDetailValue(details.splitCount) },
      { label: "Target", value: formatMoney(details.targetAmount) },
      { label: "Subtotal", value: formatMoney(details.subtotalAmount) },
      {
        label: "Created",
        value: formatDetailValue(details.createdInvoiceDisplayIds),
      },
    ].filter((chip) => chip.value.length > 0);
  }

  if (log.action === "queue_item.scheduled") {
    return [
      {
        label: "Work Date",
        value: formatDate(details.scheduledDate),
      },
    ].filter((chip) => chip.value.length > 0);
  }

  if (log.action === "queue_item.completed") {
    return [
      {
        label: "Completed",
        value: formatDate(details.completedDate),
      },
    ].filter((chip) => chip.value.length > 0);
  }

  if (
    log.action.startsWith("job_session") ||
    log.action.startsWith("technician.job_session")
  ) {
    return [
      { label: "Job Type", value: formatDetailValue(details.jobType) },
      { label: "Started", value: formatDateTime(details.startedAt) },
      { label: "Ended", value: formatDateTime(details.endedAt) },
      { label: "Minutes", value: formatDetailValue(details.totalMinutes) },
      { label: "Queue Item", value: formatDetailValue(details.queueItemId) },
      {
        label: "Resumed",
        value: formatDetailValue(details.resumedFromPriorSession),
      },
      { label: "Assigned", value: formatDetailValue(details.assignedMinutes) },
      { label: "Work Types", value: formatDetailValue(details.workTypes) },
      { label: "Note", value: formatDetailValue(details.notes) },
    ].filter((chip) => chip.value.length > 0);
  }

  if (log.action === "estimate.converted_to_invoice") {
    return Object.entries(details)
      .filter((entry) => entry[1] !== null && entry[1] !== undefined)
      .slice(0, 4)
      .map(([key, value]) => ({
        label: prettifyKey(key),
        value: formatDetailValue(value),
      }))
      .filter((chip) => chip.value.length > 0);
  }

  return Object.entries(details)
    .filter((entry) => entry[1] !== null && entry[1] !== undefined)
    .slice(0, 4)
    .map(([key, value]) => ({
      label: prettifyKey(key),
      value:
        key.toLowerCase().includes("date") && typeof value === "string"
          ? formatDate(value)
          : formatDetailValue(value),
    }))
    .filter((chip) => chip.value.length > 0);
}

function entityHref(log: ActivityLog, businessSlug: string) {
  if (!log.entity_id) {
    return null;
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

  return null;
}

function normalizeActivityFilter(value: string | undefined): ActivityTypeFilter {
  if (
    value === "queue" ||
    value === "operations" ||
    value === "estimate" ||
    value === "invoice" ||
    value === "payment" ||
    value === "split"
  ) {
    return value;
  }

  return "all";
}

function activityMatchesType(log: ActivityLog, filter: ActivityTypeFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "payment") {
    return log.action.includes("payment");
  }

  if (filter === "split") {
    return log.action.includes("split");
  }

  if (filter === "queue") {
    return log.action.startsWith("queue_item") || log.entity_type === "queue_item";
  }

  if (filter === "operations") {
    return (
      log.action.startsWith("queue_item") ||
      log.action.startsWith("job_session") ||
      log.action.startsWith("technician") ||
      log.entity_type === "queue_item" ||
      log.entity_type === "job_session"
    );
  }

  return log.action.startsWith(filter) || log.entity_type === filter;
}

function searchableActivityText(log: ActivityLog) {
  return [
    actionLabel(log.action),
    log.action,
    log.entity_type,
    log.entity_label,
    log.actor_email,
    JSON.stringify(log.details ?? {}),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function activityFilterHref({
  businessSlug,
  filter,
  searchTerm,
}: {
  businessSlug: string;
  filter: ActivityTypeFilter;
  searchTerm: string;
}) {
  const params = new URLSearchParams({ business: businessSlug });

  if (filter !== "all") {
    params.set("type", filter);
  }

  if (searchTerm.length > 0) {
    params.set("q", searchTerm);
  }

  return `/activity?${params.toString()}`;
}

function buildAuditSignals(logs: ActivityLog[]): AuditSignal[] {
  const sendCount = logs.filter(
    (log) => log.action.includes("email_sent") || log.action.includes("reminder")
  ).length;
  const pdfCount = logs.filter((log) => log.details?.pdf_attached === true).length;
  const paymentCount = logs.filter((log) =>
    log.action.includes("payment")
  ).length;
  const paymentAttachmentCount = logs.filter(
    (log) => Boolean(log.details?.paymentAttachmentId) || Boolean(log.details?.paymentImagePath)
  ).length;

  return [
    {
      label: "Send Proof",
      count: sendCount,
      detail: "Invoices, estimates, and reminders with recipients and subjects",
      status: sendCount > 0 ? "ready" : "quiet",
    },
    {
      label: "PDF Proof",
      count: pdfCount,
      detail: "Customer-facing PDFs attached to outgoing messages",
      status: pdfCount > 0 ? "ready" : sendCount > 0 ? "watch" : "quiet",
    },
    {
      label: "Payment Proof",
      count: paymentCount,
      detail: "Checks, references, notes, and applied amounts",
      status: paymentCount > 0 ? "ready" : "quiet",
    },
    {
      label: "Image Proof",
      count: paymentAttachmentCount,
      detail: "Stored check or remittance images linked to payment actions",
      status:
        paymentAttachmentCount > 0 ? "ready" : paymentCount > 0 ? "watch" : "quiet",
    },
  ];
}

function buildOperationalSignals(logs: ActivityLog[]): OperationalSignal[] {
  const queueLogs = logs.filter(
    (log) => log.action.startsWith("queue_item") || log.entity_type === "queue_item"
  );
  const changeLogs = queueLogs.filter((log) => extractActivityChanges(log).length > 0);
  const priorityChangeLogs = changeLogs.filter((log) =>
    extractActivityChanges(log).some((change) => change.field === "priority")
  );
  const scheduleChangeLogs = changeLogs.filter((log) =>
    extractActivityChanges(log).some((change) =>
      ["scheduled_date", "ready_date", "completed_date", "move_out_date"].includes(
        change.field
      )
    )
  );
  const statusChangeLogs = changeLogs.filter((log) =>
    extractActivityChanges(log).some((change) => change.field === "status")
  );
  const latestActivityDay = dateOnly(
    logs.reduce<string | null>((latest, log) => {
      if (!log.created_at) {
        return latest;
      }

      if (!latest) {
        return log.created_at;
      }

      return new Date(log.created_at).getTime() > new Date(latest).getTime()
        ? log.created_at
        : latest;
    }, null)
  );
  const sameDayPriorityChanges = priorityChangeLogs.filter((log) => {
    const createdDate = dateOnly(log.created_at);

    return Boolean(createdDate && latestActivityDay && createdDate === latestActivityDay);
  }).length;
  const interruptionLogs = logs.filter(
    (log) =>
      log.action.includes("job_session_paused") ||
      log.action === "job_session.stopped" ||
      log.action === "technician.job_session_stopped" ||
      log.action === "technician.job_session_paused"
  );
  const resumeLogs = logs.filter(
    (log) =>
      log.action === "job_session.resumed" ||
      log.action === "technician.job_session_resumed"
  );
  const changesByEntity = new Map<string, number>();

  changeLogs.forEach((log) => {
    const entityKey =
      log.entity_id || `${log.entity_type}:${log.entity_label || "unknown"}`;
    changesByEntity.set(entityKey, (changesByEntity.get(entityKey) ?? 0) + 1);
  });

  const mostVolatileCount = Math.max(0, ...Array.from(changesByEntity.values()));

  return [
    {
      label: "Priority Changes",
      value: String(priorityChangeLogs.length),
      detail: "Tracked with previous and new priority values",
      status: priorityChangeLogs.length > 0 ? "ready" : "quiet",
    },
    {
      label: "Date Changes",
      value: String(scheduleChangeLogs.length),
      detail: "Scheduled, ready, move-out, and completion date changes",
      status: scheduleChangeLogs.length > 0 ? "ready" : "quiet",
    },
    {
      label: "Status Moves",
      value: String(statusChangeLogs.length),
      detail: "Queue status movement across edit, schedule, and technician flows",
      status: statusChangeLogs.length > 0 ? "ready" : "quiet",
    },
    {
      label: "Session Interruptions",
      value: String(interruptionLogs.length),
      detail: "Stopped or paused job sessions that can explain disruption",
      status: interruptionLogs.length > 0 ? "watch" : "quiet",
    },
    {
      label: "Session Resumes",
      value: String(resumeLogs.length),
      detail: "Interrupted work that was picked back up",
      status: resumeLogs.length > 0 ? "ready" : "quiet",
    },
    {
      label: "Same-Day Priority",
      value: String(sameDayPriorityChanges),
      detail: "Priority changes on the latest activity day in this view",
      status: sameDayPriorityChanges > 0 ? "watch" : "quiet",
    },
    {
      label: "Most Changed Job",
      value: mostVolatileCount > 0 ? String(mostVolatileCount) : "-",
      detail: "Highest number of captured change events on one queue item",
      status: mostVolatileCount > 1 ? "watch" : mostVolatileCount > 0 ? "ready" : "quiet",
    },
  ];
}

function buildReportingReadiness(logs: ActivityLog[]): ReportingReadinessItem[] {
  const changeLogs = logs.filter((log) => extractActivityChanges(log).length > 0);
  const queueChangeLogs = changeLogs.filter(
    (log) => log.action.startsWith("queue_item") || log.entity_type === "queue_item"
  );
  const priorityChanges = queueChangeLogs.filter((log) =>
    extractActivityChanges(log).some((change) => change.field === "priority")
  );
  const dateChanges = queueChangeLogs.filter((log) =>
    extractActivityChanges(log).some((change) =>
      [
        "scheduled_date",
        "ready_date",
        "move_out_date",
        "completed_date",
        "property_deadline",
        "deadline",
      ].includes(change.field)
    )
  );
  const assignmentChanges = queueChangeLogs.filter((log) =>
    extractActivityChanges(log).some((change) =>
      ["property", "unit", "assigned_to_user_id", "assigned_to"].includes(
        change.field
      )
    )
  );
  const interruptionLogs = logs.filter(
    (log) =>
      log.action.includes("job_session_paused") ||
      log.action === "job_session.stopped" ||
      log.action === "technician.job_session_stopped" ||
      log.action === "technician.job_session_paused"
  );
  const actorCount = new Set(
    logs.map((log) => log.actor_email).filter((email): email is string => Boolean(email))
  ).size;
  const proofLogs = logs.filter(
    (log) =>
      log.details?.pdf_attached === true ||
      Boolean(log.details?.paymentAttachmentId) ||
      Boolean(log.details?.paymentImagePath)
  );

  return [
    {
      label: "Priority Analytics",
      value: String(priorityChanges.length),
      detail:
        "Supports priority changes by property, unit, user, and same-day follow-up when queue metadata is present.",
      status: priorityChanges.length > 0 ? "ready" : "quiet",
    },
    {
      label: "Schedule Volatility",
      value: String(dateChanges.length),
      detail:
        "Supports date change frequency, schedule volatility, and average changes before completion.",
      status: dateChanges.length > 0 ? "ready" : "quiet",
    },
    {
      label: "Reassignment Trail",
      value: String(assignmentChanges.length),
      detail:
        "Supports property, unit, and assignment movement reports without a second tracking table.",
      status: assignmentChanges.length > 0 ? "ready" : "quiet",
    },
    {
      label: "Interruptions",
      value: String(interruptionLogs.length),
      detail:
        "Supports mid-project interruption review using pause and stop activity.",
      status: interruptionLogs.length > 0 ? "watch" : "quiet",
    },
    {
      label: "User History",
      value: String(actorCount),
      detail:
        "Supports user activity history and accountability across the filtered activity view.",
      status: actorCount > 0 ? "ready" : "quiet",
    },
    {
      label: "Proof Reporting",
      value: String(proofLogs.length),
      detail:
        "Supports PDF, send, payment image, and audit packet reporting from the same trail.",
      status: proofLogs.length > 0 ? "ready" : "watch",
    },
  ];
}

function ActivityPageContent() {
  const searchParams = useSearchParams();
  const businessSlug = searchParams.get("business") ?? "rnl-creations";
  const searchTerm = (searchParams.get("q") ?? "").trim();
  const typeFilter = normalizeActivityFilter(
    searchParams.get("type") ?? undefined
  );
  const [business, setBusiness] = useState<Business | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadActivity() {
      setLoading(true);
      setSetupNeeded(false);

      const { data: businessData, error: businessError } = await supabase
        .from("businesses")
        .select("id, name, slug")
        .eq("slug", businessSlug)
        .limit(1)
        .maybeSingle();

      if (!active) {
        return;
      }

      if (businessError) {
        console.warn("Activity workspace lookup failed:", businessError.message);
        setBusiness(null);
        setLogs([]);
        setSetupNeeded(true);
        setLoading(false);
        return;
      }

      const selectedBusiness = businessData as Business | null;
      setBusiness(selectedBusiness);

      if (!selectedBusiness?.id) {
        setLogs([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("business_id", selectedBusiness.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!active) {
        return;
      }

      if (error) {
        console.warn("Activity logs could not be loaded:", error.message);
        setLogs([]);
        setSetupNeeded(true);
      } else {
        setLogs((data ?? []) as ActivityLog[]);
      }

      setLoading(false);
    }

    loadActivity();

    return () => {
      active = false;
    };
  }, [businessSlug]);

  const filteredLogs = useMemo(() => logs.filter((log) => {
    if (!activityMatchesType(log, typeFilter)) {
      return false;
    }

    if (searchTerm.length === 0) {
      return true;
    }

    return searchableActivityText(log).includes(searchTerm.toLowerCase());
  }), [logs, searchTerm, typeFilter]);

  const activityPulse = useMemo(() => {
    const latestTimestamp = logs.reduce((latest, log) => {
      if (!log.created_at) {
        return latest;
      }

      const timestamp = new Date(log.created_at).getTime();

      return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
    }, 0);
    const sevenDaysAgo = latestTimestamp - 7 * 24 * 60 * 60 * 1000;
    const recentCount = logs.filter((log) => {
      if (!log.created_at || latestTimestamp === 0) {
        return false;
      }

      const timestamp = new Date(log.created_at).getTime();

      return Number.isFinite(timestamp) && timestamp >= sevenDaysAgo;
    }).length;
    const paymentCount = logs.filter((log) => activityMatchesType(log, "payment")).length;
    const reminderCount = logs.filter((log) =>
      log.action.includes("reminder") || log.action.includes("email_sent")
    ).length;
    const latestLog = logs[0];

    return [
      {
        label: "Total Trail",
        value: String(logs.length),
        detail: "All recorded workspace actions",
        href: activityFilterHref({ businessSlug, filter: "all", searchTerm: "" }),
      },
      {
        label: "Last 7 Days",
        value: String(recentCount),
        detail: "Recent changes and sends",
        href: activityFilterHref({ businessSlug, filter: "all", searchTerm: "" }),
      },
      {
        label: "Payment Proof",
        value: String(paymentCount),
        detail: "Checks and payment actions",
        href: activityFilterHref({ businessSlug, filter: "payment", searchTerm: "" }),
      },
      {
        label: "Send History",
        value: String(reminderCount),
        detail: latestLog
          ? `Latest: ${actionLabel(latestLog.action)}`
          : "Invoice emails and reminders",
        href: activityFilterHref({ businessSlug, filter: "invoice", searchTerm: "" }),
      },
    ];
  }, [businessSlug, logs]);
  const auditSignals = useMemo(() => buildAuditSignals(filteredLogs), [filteredLogs]);
  const operationalSignals = useMemo(
    () => buildOperationalSignals(filteredLogs),
    [filteredLogs]
  );
  const reportingReadiness = useMemo(
    () => buildReportingReadiness(filteredLogs),
    [filteredLogs]
  );
  const exportFileName = useMemo(() => {
    const parts = [
      "trimax-audit-trail",
      businessSlug,
      typeFilter !== "all" ? typeFilter : null,
      searchTerm.length > 0
        ? searchTerm.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        : null,
      new Date().toISOString().slice(0, 10),
    ].filter(Boolean);

    return `${parts.join("-")}.csv`;
  }, [businessSlug, searchTerm, typeFilter]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Operations Memory
          </p>

          <h1 className="mt-3 text-4xl font-bold">Activity Log</h1>

          <p className="mt-3 max-w-3xl text-zinc-400">
            A running history of important queue, estimate, invoice, payment,
            and split-invoice actions for {business?.name ?? "this business"}.
          </p>
        </div>

        <Card className="activity-command-card futuristic-proof-card border-sky-500/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-slate-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
                Proof Center
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                Find the paper trail fast
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                Every sent invoice, reminder, payment, split, estimate, and
                queue move should leave a clean trail here for follow-up and
                accountability.
              </p>
            </div>

            <Link
              href={`/reports?business=${businessSlug}`}
              className="app-button-primary inline-flex rounded-2xl px-5 py-3 text-sm font-black"
            >
              Open Reports
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {activityPulse.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="activity-pulse-card rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:-translate-y-0.5 hover:border-sky-300/60"
              >
                <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-200">
                  {item.label}
                </p>

                <p className="mt-3 text-3xl font-black text-white">
                  {item.value}
                </p>

                <p className="mt-2 text-sm leading-5 text-zinc-400">
                  {item.detail}
                </p>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="activity-operations-card border-cyan-500/20 bg-gradient-to-br from-zinc-950 via-slate-950 to-zinc-900">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-200">
              Operations Intelligence
            </p>

            <h2 className="mt-2 text-2xl font-black text-white">
              Schedule and workload signals
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
              These counts come from the same activity trail. They show whether
              Trimax is already collecting enough history for priority,
              schedule, interruption, and bottleneck reports.
            </p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {operationalSignals.map((signal) => {
              const tone =
                signal.status === "ready"
                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                  : signal.status === "watch"
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                    : "border-zinc-700 bg-black/20 text-zinc-300";

              return (
                <div
                  key={signal.label}
                  className={`activity-operations-signal rounded-2xl border p-4 ${tone}`}
                >
                  <p className="text-xs font-black uppercase tracking-[0.22em] opacity-80">
                    {signal.label}
                  </p>

                  <p className="mt-3 text-3xl font-black">{signal.value}</p>

                  <p className="mt-2 text-sm leading-5 opacity-80">
                    {signal.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="activity-reporting-card border-orange-500/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-slate-950">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-300">
                Reporting Readiness
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                Analytics this trail can already support
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                Trimax uses the existing activity log as the source of truth.
                This matrix shows which future reports can be generated without
                creating duplicate tracking systems.
              </p>
            </div>

            <div className="activity-reporting-score rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                Ready Signals
              </p>
              <p className="mt-2 text-3xl font-black text-white">
                {
                  reportingReadiness.filter(
                    (item) => item.status === "ready"
                  ).length
                }
                /{reportingReadiness.length}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {reportingReadiness.map((item) => (
              <div
                key={item.label}
                data-status={item.status}
                className="activity-reporting-item rounded-2xl border border-white/10 bg-black/25 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                    {item.label}
                  </p>
                  <span className="activity-reporting-value rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm font-black text-white">
                    {item.value}
                  </span>
                </div>

                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="futuristic-audit-card border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-zinc-950">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">
                Audit Readiness
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                Evidence packet for this view
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                Export the filtered trail when you need proof of delivery,
                payment history, check references, attached PDFs, or stored
                remittance images.
              </p>
            </div>

            <button
              type="button"
              onClick={() => downloadCsv({ fileName: exportFileName, logs: filteredLogs })}
              disabled={filteredLogs.length === 0}
              className="app-button-primary inline-flex rounded-2xl px-5 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export Audit CSV
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {auditSignals.map((signal) => {
              const tone =
                signal.status === "ready"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                  : signal.status === "watch"
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                    : "border-zinc-700 bg-black/20 text-zinc-300";

              return (
                <div
                  key={signal.label}
                  className={`rounded-2xl border p-4 ${tone}`}
                >
                  <p className="text-xs font-black uppercase tracking-[0.22em] opacity-80">
                    {signal.label}
                  </p>

                  <p className="mt-3 text-3xl font-black">{signal.count}</p>

                  <p className="mt-2 text-sm leading-5 opacity-80">
                    {signal.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <form action="/activity" className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input type="hidden" name="business" value={businessSlug} />
              {typeFilter !== "all" ? (
                <input type="hidden" name="type" value={typeFilter} />
              ) : null}

              <label className="block">
                <span className="app-form-label mb-2 block text-sm text-zinc-400">
                  Search activity
                </span>
                <input
                  name="q"
                  defaultValue={searchTerm}
                  placeholder="Search invoice number, client, check #, user, notes..."
                  className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-orange-500"
                />
              </label>

              <button
                type="submit"
                className="app-button-primary rounded-2xl px-6 py-3 font-bold md:self-end"
              >
                Search
              </button>
            </form>

            <div className="app-soft-panel rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-400">
              Showing{" "}
              <span className="font-bold text-white">{filteredLogs.length}</span>{" "}
              of <span className="font-bold text-white">{logs.length}</span>{" "}
              records
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {activityFilters.map((filter) => {
              const active = filter.value === typeFilter;

              return (
                <Link
                  key={filter.value}
                  href={activityFilterHref({
                    businessSlug,
                    filter: filter.value,
                    searchTerm,
                  })}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    active
                      ? "app-chip-active bg-orange-500 text-black"
                      : "app-chip bg-zinc-950 text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  {filter.label}
                </Link>
              );
            })}

            {searchTerm.length > 0 ? (
              <Link
                href={activityFilterHref({
                  businessSlug,
                  filter: typeFilter,
                  searchTerm: "",
                })}
                className="app-chip rounded-full border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-300 hover:border-orange-500 hover:text-orange-300"
              >
                Clear search
              </Link>
            ) : null}
          </div>
        </Card>

        {loading ? (
          <Card>
            <p className="font-semibold text-white">Loading activity...</p>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Checking the latest history for this workspace.
            </p>
          </Card>
        ) : setupNeeded ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <p className="font-semibold text-amber-200">
              Activity tracking setup needs one more step.
            </p>

            <p className="mt-2 text-sm leading-6 text-amber-100/90">
              Once the activity setup is finished, this page will start
              showing new queue, estimate, invoice, payment, and split
              actions.
            </p>
          </Card>
        ) : logs.length === 0 ? (
          <Card className="app-empty-state border-sky-200 bg-sky-50">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-700">
                  Clean Slate
                </p>

                <h2 className="mt-2 text-2xl font-black text-slate-950">
                  Activity will appear here automatically
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  New queue, estimate, invoice, payment, email, and split
                  actions will build a searchable workspace trail as you work.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`/queue?business=${businessSlug}`}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-black text-slate-800 shadow-sm transition hover:border-sky-300 hover:bg-sky-50"
                >
                  Open Queue
                </Link>
                <Link
                  href={`/invoices?business=${businessSlug}`}
                  className="app-button-primary rounded-2xl px-5 py-3 text-center text-sm font-black"
                >
                  Open Invoices
                </Link>
              </div>
            </div>
          </Card>
        ) : filteredLogs.length === 0 ? (
          <Card className="app-empty-state border-dashed border-slate-300 bg-white">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">
                  Search Check
                </p>

                <h2 className="mt-2 text-2xl font-black text-slate-950">
                  No activity matches this view
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Try a broader search or return to the full activity trail to
                  verify the latest invoices, reminders, payments, and queue
                  updates.
                </p>
              </div>

              <Link
                href={activityFilterHref({
                  businessSlug,
                  filter: "all",
                  searchTerm: "",
                })}
                className="app-button-primary inline-flex rounded-2xl px-5 py-3 text-center text-sm font-black"
              >
                Show All Activity
              </Link>
            </div>
          </Card>
        ) : (
          <div className="activity-timeline overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            {filteredLogs.map((log) => {
              const href = entityHref(log, businessSlug);
              const chips = detailChips(log);

              return (
                <div
                  key={log.id}
                  className="activity-timeline-row relative grid gap-4 border-b border-zinc-800 p-5 pl-9 last:border-b-0 md:grid-cols-[1fr_auto]"
                >
                  <span
                    className={`activity-timeline-dot absolute left-4 top-6 h-2.5 w-2.5 rounded-full ${actionAccent(
                      log.action
                    )}`}
                  />

                  <div>
                    <p
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] ${actionTone(
                        log.action
                      )}`}
                    >
                      {actionLabel(log.action)}
                    </p>

                    <p className="mt-3 text-lg font-semibold text-white">
                      {log.entity_label || log.entity_type}
                    </p>

                    <p className="mt-1 text-sm text-zinc-400">
                      {log.actor_email || "Unknown user"}
                    </p>

                    {chips.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {chips.map((chip) => (
                          <span
                            key={`${log.id}-${chip.label}`}
                            className="activity-proof-chip rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300"
                          >
                            <span className="text-zinc-500">
                              {chip.label}:{" "}
                            </span>
                            <span className="font-semibold text-white">
                              {chip.value}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2 md:items-end">
                    <p className="activity-time-pill rounded-full border border-zinc-800 bg-black/30 px-3 py-1 text-sm text-zinc-300">
                      {formatDateTime(log.created_at)}
                    </p>

                    {href ? (
                      <Link
                        href={href}
                        className="text-sm font-semibold text-orange-400"
                      >
                        Open item
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function ActivityPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <Card>
            <p className="text-zinc-400">Loading activity...</p>
          </Card>
        </AppShell>
      }
    >
      <ActivityPageContent />
    </Suspense>
  );
}
