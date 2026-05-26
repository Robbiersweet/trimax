type StatusBadgeProps = {
  status: string;
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Record<
    string,
    {
      className: string;
      tone: string;
    }
  > = {
    "Needs Review": {
      className: "bg-yellow-500/20 text-yellow-300",
      tone: "needs-review",
    },
    "Estimate Created": {
      className: "bg-purple-500/20 text-purple-300",
      tone: "estimate-created",
    },
    Ready: {
      className: "bg-green-500/20 text-green-300",
      tone: "ready",
    },
    Scheduled: {
      className: "bg-sky-500/20 text-sky-300",
      tone: "scheduled",
    },
    "In Progress": {
      className: "bg-orange-500/20 text-orange-300",
      tone: "in-progress",
    },
    Completed: {
      className: "bg-zinc-500/20 text-zinc-300",
      tone: "completed",
    },
    Invoiced: {
      className: "bg-emerald-500/20 text-emerald-300",
      tone: "invoiced",
    },
    Archived: {
      className: "bg-zinc-700/40 text-zinc-400",
      tone: "archived",
    },
    "On Hold": {
      className: "bg-red-500/20 text-red-300",
      tone: "on-hold",
    },
  };
  const style = styles[status] ?? {
    className: "bg-zinc-500/20 text-zinc-300",
    tone: "default",
  };

  return (
    <span
      className={`status-badge status-badge-${style.tone} inline-flex rounded-full border border-transparent px-3 py-1 text-sm font-semibold ${style.className}`}
    >
      {status}
    </span>
  );
}
