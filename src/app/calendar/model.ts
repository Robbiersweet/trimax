export const defaultZone = "America/Los_Angeles";

export function dayInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) => parts.find(item => item.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function dateFor(day: string) {
  return new Date(`${day}T12:00:00Z`);
}

export function calendarDays(day: string) {
  const start = dateFor(day.slice(0, 7) + "-01");
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const days: string[] = [];
  for (const date = new Date(start); date < end; date.setUTCDate(date.getUTCDate() + 1)) {
    days.push(dateKey(date));
  }
  return { days, leading: start.getUTCDay(), end: dateKey(end) };
}

export type CalendarEntry = {
  label: string;
  state: "confirmed" | "pending" | "date_only" | "pending_date" | "deadline";
  start?: string | null;
  end?: string | null;
  window?: string;
  href?: string;
};

type ManagerSlot = {
  property: string;
  state: "confirmed" | "pending" | "date_only" | "pending_date";
  starts_at: string | null;
  ends_at: string | null;
};

export function managerEntry(slot: ManagerSlot): CalendarEntry {
  return { label: slot.property, state: slot.state, start: slot.starts_at, end: slot.ends_at };
}
