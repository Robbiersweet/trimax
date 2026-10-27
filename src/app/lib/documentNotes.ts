// Queue/job notes are internal. Only explicitly customer-facing document notes
// cross the billing boundary. These exact legacy templates were automatically
// appended to Queue notes before that boundary was enforced.
const priorityCheck = /^Priority check: [^\r\n]+ may need to jump ahead of [^\r\n]+ due [^\r\n]+\. Confirm with management before scheduling\.(?: Trimax will keep the selected existing unit behind this new request\.)?$/;
const prioritySwap = /^Priority swap: [^\r\n]+ was placed ahead of [^\r\n]+ on [^\r\n]+\. Keep this unit behind the new urgent request unless management changes it\.$/;

export function isAutomaticOperationalNote(line: string) {
  return priorityCheck.test(line.trim()) || prioritySwap.test(line.trim());
}

/** Presentation/forward-copy only: never mutate the original stored notes. */
export function customerFacingNotes(notes: string | null | undefined): string {
  return String(notes ?? "").split(/\r?\n/)
    .filter((line) => !isAutomaticOperationalNote(line)).join("\n").trim();
}

export function retainedOperationalNotes(notes: string | null | undefined): string {
  return String(notes ?? "").split(/\r?\n/)
    .filter(isAutomaticOperationalNote).join("\n");
}

/** Explicit allowlist: never accept Queue notes as customer-facing scope. */
export function queueCustomerScopeNotes(queue: {
  wall_paint_color?: string | null;
  unit_layout?: string | null;
}): string {
  return [queue.wall_paint_color ? `Wall paint color: ${queue.wall_paint_color}` : null,
    queue.unit_layout ? `Unit layout: ${queue.unit_layout}` : null]
    .filter(Boolean).join("\n");
}

/** Collapse only this generated warning, including its richer swap variant. */
export function appendPriorityNote(notes: string, warning: string, swap = false): string {
  if (!priorityCheck.test(warning)) return notes;
  const suffix = " Trimax will keep the selected existing unit behind this new request.";
  const base = warning.endsWith(suffix) ? warning.slice(0, -suffix.length) : warning;
  const lines = notes.split(/\r?\n/);
  const hasSwap = lines.some((line) => line.trim() === base + suffix);
  const remaining = lines.filter((line) => line.trim() !== base && line.trim() !== base + suffix).join("\n").trim();
  return [remaining, base + (swap || hasSwap ? suffix : "")].filter(Boolean).join("\n\n");
}
