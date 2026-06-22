type StatusBadgeProps = {
  status: string;
};

function titleCaseStatus(status: string) {
  return status
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) =>
      word.length > 0
        ? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
        : word
    )
    .join(" ");
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Record<
    string,
    {
      className: string;
      tone: string;
    }
  > = {
    "needs review": {
      className: "bg-yellow-500/20 text-yellow-300",
      tone: "needs-review",
    },
    "pending estimate": {
      className: "bg-amber-500/20 text-amber-300",
      tone: "pending-estimate",
    },
    pending: {
      className: "bg-amber-500/20 text-amber-300",
      tone: "pending-estimate",
    },
    draft: {
      className: "bg-sky-500/20 text-sky-300",
      tone: "draft",
    },
    "estimate created": {
      className: "bg-purple-500/20 text-purple-300",
      tone: "estimate-created",
    },
    approved: {
      className: "bg-emerald-500/20 text-emerald-300",
      tone: "approved",
    },
    converted: {
      className: "bg-emerald-500/20 text-emerald-300",
      tone: "converted",
    },
    ready: {
      className: "bg-green-500/20 text-green-300",
      tone: "ready",
    },
    scheduled: {
      className: "bg-sky-500/20 text-sky-300",
      tone: "scheduled",
    },
    sent: {
      className: "bg-blue-500/20 text-blue-300",
      tone: "sent",
    },
    "in progress": {
      className: "bg-orange-500/20 text-orange-300",
      tone: "in-progress",
    },
    completed: {
      className: "bg-zinc-500/20 text-zinc-300",
      tone: "completed",
    },
    invoiced: {
      className: "bg-emerald-500/20 text-emerald-300",
      tone: "invoiced",
    },
    "invoice sent": {
      className: "bg-emerald-500/20 text-emerald-300",
      tone: "invoice-sent",
    },
    paid: {
      className: "bg-emerald-500/20 text-emerald-300",
      tone: "paid",
    },
    "partially paid": {
      className: "bg-teal-500/20 text-teal-300",
      tone: "partially-paid",
    },
    overdue: {
      className: "bg-rose-500/20 text-rose-300",
      tone: "overdue",
    },
    late: {
      className: "bg-rose-500/20 text-rose-300",
      tone: "overdue",
    },
    "deposit request": {
      className: "bg-emerald-500/20 text-emerald-300",
      tone: "deposit-request",
    },
    "deposit requested": {
      className: "bg-emerald-500/20 text-emerald-300",
      tone: "deposit-request",
    },
    requested: {
      className: "bg-emerald-500/20 text-emerald-300",
      tone: "deposit-request",
    },
    archived: {
      className: "bg-zinc-700/40 text-zinc-400",
      tone: "archived",
    },
    "on hold": {
      className: "bg-red-500/20 text-red-300",
      tone: "on-hold",
    },
  };
  const statusKey = status.trim().toLowerCase().replace(/[_-]+/g, " ");
  const style = styles[statusKey] ?? {
    className: "bg-zinc-500/20 text-zinc-300",
    tone: "default",
  };
  const displayStatus = status.trim() || "Unknown";
  const displayLabel =
    styles[statusKey] && statusKey
      ? titleCaseStatus(statusKey)
      : displayStatus === displayStatus.toLowerCase()
        ? titleCaseStatus(displayStatus)
        : displayStatus;

  return (
    <span
      className={`status-badge status-badge-${style.tone} inline-flex rounded-full border border-transparent px-3 py-1 text-sm font-semibold ${style.className}`}
      data-status-tone={style.tone}
    >
      {displayLabel}
    </span>
  );
}
