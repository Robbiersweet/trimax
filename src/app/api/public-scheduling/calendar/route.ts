import { createClient } from "@supabase/supabase-js";
import { customerAppointment, customerRequest } from "@/app/lib/publicScheduling/customerAppointment";
import { appointmentCalendar, validCalendarToken } from "@/app/lib/publicScheduling/customerTransactionalEmail";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("request") ?? "";
  const token = params.get("token") ?? "";
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  const unavailable = () => new Response("Calendar entry unavailable", { status: 404, headers });
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key,
    SERVICE_REQUEST_EMAIL_BUSINESS_ID: business, CRON_SECRET: secret } = process.env;
  if (!url || !key || !business || !secret || !/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{64}$/.test(token)) return unavailable();
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const customer = await customerRequest(db, business, id);
    const appointment = customer && await customerAppointment(db, business, customer);
    if (!appointment || !validCalendarToken(id, token, appointment, secret)) return unavailable();
    return new Response(appointmentCalendar(id, appointment), { headers: {
      ...headers, "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="rnl-appointment.ics"',
    } });
  } catch {
    return unavailable();
  }
}
