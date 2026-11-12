import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "../components/AppShell";
import { createSupabaseServerClient } from "../lib/supabaseServer";
import { appointmentInstant } from "../lib/publicScheduling/workflow";
import { isVerifiedSyntheticRequest } from "../lib/verifiedSyntheticRequests";
import CalendarView from "./CalendarView";
import { calendarDays, dateFor, dayInZone, defaultZone, managerEntry, type CalendarEntry } from "./model";

function proposedWindow(day: string, window: { start: string; end: string } | undefined, zone: string) {
  if (!window || window.start >= window.end) return [];
  try { return [appointmentInstant(day, window.start, zone), appointmentInstant(day, window.end, zone)]; }
  catch { return []; }
}

export default async function CalendarPage({ searchParams }: {
  searchParams: Promise<{ business?: string; date?: string }>;
}) {
  const params = await searchParams;
  const business = params.business || "rnl-creations";
  const query = new URLSearchParams({ business });
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login?next=" + encodeURIComponent("/calendar?" + query));
  const { data: workspace } = await client.from("businesses").select("id").eq("slug", business).maybeSingle();
  const { data: membership } = workspace
    ? await client.from("business_users").select("role").eq("business_id", workspace.id).eq("user_id", user.id).maybeSingle()
    : { data: null };
  const role = membership?.role;
  const manager = role === "property_manager";
  if (!workspace || (!manager && role !== "owner" && role !== "admin")) {
    return <AppShell><main className="p-6"><h1>Calendar</h1><p>Calendar access is unavailable for this workspace.</p></main></AppShell>;
  }

  const settings = manager ? null : await client.from("public_scheduling_settings")
    .select("time_zone, appointment_windows").eq("business_id", workspace.id).maybeSingle();
  const zone = settings?.data?.time_zone || defaultZone;
  const today = dayInZone(new Date(), zone);
  const parsed = params.date && /^20\d\d-\d\d-\d\d$/.test(params.date) ? dateFor(params.date) : null;
  const day = parsed && Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === params.date ? params.date! : today;
  const { days, end } = calendarDays(day);
  const entries: Record<string, CalendarEntry[]> = Object.fromEntries(days.map(key => [key, []]));
  let failed = Boolean(settings?.error);

  if (manager) {
    const context = await client.rpc("trimax_property_request_context");
    const assignment = (context.data?.assignments as { id: string; businessId: string }[] | undefined)
      ?.find(item => item.businessId === workspace.id);
    if (!assignment) return <AppShell><main className="space-y-3 p-6">
      <h1>Calendar</h1><p>Shared availability requires a property assignment.</p>
      <Link className="underline" href="/property-requests">Property requests</Link>
    </main></AppShell>;
    // The existing RPC is the only source of shared manager slots. Its projection contains no job IDs or private details.
    for (let offset = 0; offset < days.length; offset += 8) {
      const results = await Promise.all(days.slice(offset, offset + 8).map(async key => {
        if (Math.abs(+dateFor(key) - +dateFor(today)) > 366 * 86400000) return;
        const { data, error } = await client.rpc("trimax_manager_availability", {
          p_assignment_id: assignment.id, p_day: key, p_window: null,
        });
        if (error) return false;
        entries[key] = (data as Parameters<typeof managerEntry>[0][]).map(managerEntry);
        return true;
      }));
      failed ||= results.includes(false);
    }
    if (Math.abs(+dateFor(day) - +dateFor(today)) > 366 * 86400000) failed = true;
  } else {
    const start = appointmentInstant(days[0], "00:00", zone);
    const finish = appointmentInstant(end, "00:00", zone);
    const [work, requests] = await Promise.all([
      client.from("queue_items").select("id, property, unit, scheduled_date, ready_date, appointment_start, appointment_end, source_request_id")
        .eq("business_id", workspace.id).is("completed_date", null)
        .or(`and(scheduled_date.gte.${days[0]},scheduled_date.lt.${end}),and(ready_date.gte.${days[0]},ready_date.lt.${end}),and(appointment_start.lt.${finish},appointment_end.gt.${start})`),
      client.from("public_service_requests").select("id, customer_name, preferred_date, time_window_id")
        .eq("business_id", workspace.id).gte("preferred_date", days[0]).lt("preferred_date", end)
        .in("status", ["pending_confirmation", "needs_information", "reviewing", "approved"]),
    ]);
    failed ||= Boolean(work.error || requests.error);
    const booked = new Set<string>();
    for (const item of work.data ?? []) {
      const label = [item.property, item.unit].filter(Boolean).join(" · ") || "Queue work";
      const href = `/queue/${item.id}?${query}`;
      if (item.appointment_start && item.appointment_end) {
        if (item.source_request_id) booked.add(item.source_request_id);
        const first = dayInZone(new Date(item.appointment_start), zone);
        const last = dayInZone(new Date(Date.parse(item.appointment_end) - 1), zone);
        for (const key of days.filter(key => key >= first && key <= last)) {
          entries[key].push({ label, href, state: "confirmed", start: item.appointment_start, end: item.appointment_end });
        }
      } else if (item.scheduled_date) {
        entries[item.scheduled_date]?.push({ label, href, state: "date_only" });
      }
      if (item.ready_date && item.ready_date !== item.scheduled_date) {
        entries[item.ready_date]?.push({ label, href, state: "deadline" });
      }
    }
    const windows = (settings?.data?.appointment_windows ?? []) as { id: string; label: string; start: string; end: string }[];
    for (const request of requests.data ?? []) {
      if (booked.has(request.id) || isVerifiedSyntheticRequest(workspace.id, request.id)) continue;
      const window = windows.find(item => item.id === request.time_window_id);
      const [start, end] = proposedWindow(request.preferred_date, window, zone);
      entries[request.preferred_date]?.push({
        label: request.customer_name,
        href: `/admin/service-requests?${query}&request=${request.id}`,
        state: start && end ? "pending" : "pending_date",
        start, end,
      });
    }
    for (const list of Object.values(entries)) list.sort((a, b) => (a.start ?? "~").localeCompare(b.start ?? "~"));
  }

  return <AppShell><CalendarView {...{ business, day, today, zone, entries, failed, manager }} /></AppShell>;
}
