"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { calendarDays, dateFor, dateKey, type CalendarEntry } from "./model";

import { federalHolidayLabel, federalHolidaysByDate } from "./federalHolidays";

const labels = {
  confirmed: "Confirmed",
  pending: "Pending approval",
  date_only: "Scheduled · time unset",
  pending_date: "Pending approval · date only",
  deadline: "Requested deadline",
};

export default function CalendarView({ business, day: initialDay, today, zone, entries, failed, manager }: {
  business: string;
  day: string;
  today: string;
  zone: string;
  entries: Record<string, CalendarEntry[]>;
  failed: boolean;
  manager: boolean;
}) {
  const { days, leading } = calendarDays(initialDay);
  const queryDay = useSearchParams().get("date");
  const day = queryDay && days.includes(queryDay) ? queryDay : initialDay;
  const title = (key: string, options: Intl.DateTimeFormatOptions) =>
    dateFor(key).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
  const url = (key: string) => "/calendar?" + new URLSearchParams({ business, date: key });
  const month = (offset: number) => {
    const date = dateFor(days[0]);
    date.setUTCMonth(date.getUTCMonth() + offset);
    return dateKey(date);
  };
  const selected = entries[day] ?? [];
  const holidays = federalHolidaysByDate(Number(day.slice(0, 4)));
  const selectedHoliday = holidays[day];
  const time = (value: string) => new Date(value).toLocaleTimeString("en-US", {
    timeZone: zone, hour: "numeric", minute: "2-digit",
  });
  const overlap = selected.some((entry, index) => entry.start && entry.end && selected.slice(index + 1).some(other =>
    other.start && other.end && Date.parse(entry.start!) < Date.parse(other.end) &&
    Date.parse(other.start) < Date.parse(entry.end!) &&
    (entry.state === "confirmed" || other.state === "confirmed")));
  const control = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-500/50 px-3 py-2 text-sm font-medium hover:bg-zinc-500/20";
  return <main className="mx-auto w-full max-w-5xl space-y-4 p-3 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-2xl font-bold">Calendar</h1>
      {manager
        ? <Link className={control} href="/property-requests">Property requests</Link>
        : <Link className={control} href={`/schedule?business=${encodeURIComponent(business)}&view=ready`}>Work needing a date</Link>}
    </header>
    <section aria-label="Monthly calendar" className="rounded-xl border border-zinc-500/40 p-2 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title(day, { month: "long", year: "numeric" })}</h2>
        <nav aria-label="Calendar month" className="flex gap-1">
          <Link aria-label="Previous month" className={control} prefetch={false} href={url(month(-1))}>‹</Link>
          <Link className={control} prefetch={false} href={url(today)}>Today</Link>
          <Link aria-label="Next month" className={control} prefetch={false} href={url(month(1))}>›</Link>
        </nav>
      </div>
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(label =>
          <div key={label} className="py-1 text-center text-xs opacity-80">{label}</div>)}
        {Array.from({ length: leading }, (_, index) => <div key={index} aria-hidden="true" />)}
        {days.map(key => {
          const items = entries[key] ?? [];
          const holiday = holidays[key];
          const confirmed = items.some(entry => entry.state === "confirmed" || entry.state === "date_only");
          const pending = items.some(entry => entry.state.startsWith("pending"));
          const deadline = items.some(entry => entry.state === "deadline");
          return <Link key={key} prefetch={false} href={url(key)} scroll={false} onClick={event => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              const location = new URL(window.location.href);
              location.searchParams.set("date", key);
              window.history.pushState(null, "", location);
            }} aria-current={day === key ? "date" : undefined}
            aria-label={`${title(key, { dateStyle: "full" })}, ${items.length} entries${holiday ? ", " + federalHolidayLabel(holiday) : ""}`}
            className={`flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md border text-sm hover:bg-zinc-500/20 ${day === key ? "border-sky-400 bg-sky-500/20 font-bold" : "border-zinc-500/30"}`}>
            <span className={holiday?.major ? "font-bold underline decoration-violet-500 decoration-2 underline-offset-2" : undefined}>{Number(key.slice(-2))}</span>
            <span aria-hidden="true" className="flex h-2 gap-0.5">
              {confirmed && <i className="size-1.5 rounded-full bg-emerald-500" />}
              {pending && <i className="size-1.5 rounded-full bg-amber-500" />}
              {deadline && <i className="size-1.5 rounded-full bg-sky-500" />}
              {holiday && <i className="size-1.5 rounded-sm bg-violet-500" />}
            </span>
          </Link>;
        })}
      </div>
      <ul aria-label="Calendar legend" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {([
          ["Scheduled", "rounded-full bg-emerald-500"],
          ["Pending", "rounded-full bg-amber-500"],
          ["Deadline", "rounded-full bg-sky-500"],
          ["Federal holiday", "rounded-sm bg-violet-500"],
        ] as const).map(([label, style]) => <li key={label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`size-2 ${style}`} />{label}
        </li>)}
      </ul>
    </section>
    <section aria-label="Selected date" className="rounded-xl border border-zinc-500/40 p-3 sm:p-4">
      <h2 className="font-semibold">{title(day, { dateStyle: "full" })}</h2>
      {selectedHoliday && <p className={`mt-2 text-sm ${selectedHoliday.major ? "font-bold" : "font-medium"}`}>{federalHolidayLabel(selectedHoliday)} <span className="font-normal opacity-80">· U.S. federal holiday</span></p>}
      {failed && <p role="alert" className="mt-2">Some calendar data is unavailable. Verify availability before booking.</p>}
      {overlap && <p role="status" className="mt-2 border-l-2 border-amber-500 pl-2 font-semibold">Overlapping appointment windows. Review before booking.</p>}
      {!selected.length && !failed && <p className="mt-2 text-sm">No commitments recorded for this date.</p>}
      <ul className="divide-y divide-zinc-500/30">
        {selected.map((entry, index) => <li key={index} className="py-2 text-sm">
          {entry.href ? <Link className="font-semibold underline" href={entry.href}>{entry.label}</Link> : <strong>{entry.label}</strong>}
          <p>{labels[entry.state]}{entry.start && entry.end ? ` · ${time(entry.start)}–${time(entry.end)}` : entry.window ? ` · ${entry.window}` : ""}</p>
        </li>)}
      </ul>
    </section>
  </main>;
}
