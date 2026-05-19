type StatusBadgeProps = {
  status: string;
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Record<string, string> = {
    "Needs Review": "bg-yellow-500/20 text-yellow-300",
    "Estimate Created": "bg-purple-500/20 text-purple-300",
    Ready: "bg-green-500/20 text-green-300",
    Scheduled: "bg-sky-500/20 text-sky-300",
    "In Progress": "bg-orange-500/20 text-orange-300",
    Completed: "bg-zinc-500/20 text-zinc-300",
    Invoiced: "bg-emerald-500/20 text-emerald-300",
    Archived: "bg-zinc-700/40 text-zinc-400",
    "On Hold": "bg-red-500/20 text-red-300",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
        styles[status] ?? "bg-zinc-500/20 text-zinc-300"
      }`}
    >
      {status}
    </span>
  );
}