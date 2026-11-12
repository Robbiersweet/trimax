import type { SupabaseClient } from "@supabase/supabase-js";
import { isVerifiedSyntheticRequest } from "../verifiedSyntheticRequests";
import type { CustomerAppointment } from "./customerTransactionalEmail";

export async function customerRequest(db: SupabaseClient, business: string, requestId: string) {
  if (isVerifiedSyntheticRequest(business, requestId)) return null;
  const { data: row, error } = await db.from("public_service_requests")
    .select("id, email, public_reference, service_address, status, queue_item_id, request_type_id, contact_consent_at, source")
    .eq("business_id", business).eq("id", requestId).maybeSingle();
  if (error) throw Error("Request lookup unavailable");
  if (!row || row.source !== "public-web" || !row.contact_consent_at || !row.email) return null;
  const { data: service, error: typeError } = await db.from("public_service_request_types")
    .select("public_label").eq("business_id", business).eq("id", row.request_type_id).maybeSingle();
  if (typeError || !service) throw Error("Service lookup unavailable");
  return { row, service: service.public_label as string };
}

export async function customerAppointment(db: SupabaseClient, business: string, request: NonNullable<Awaited<ReturnType<typeof customerRequest>>>): Promise<CustomerAppointment | null> {
  const { row, service } = request;
  if (row.status !== "approved" || !row.queue_item_id) return null;
  const { data: job, error } = await db.from("queue_items")
    .select("appointment_start, appointment_end, appointment_time_zone")
    .eq("business_id", business).eq("id", row.queue_item_id).eq("source_request_id", row.id).maybeSingle();
  if (error) throw Error("Appointment lookup unavailable");
  if (!job?.appointment_start || !job.appointment_end || !job.appointment_time_zone ||
    !(Date.parse(job.appointment_end) > Math.max(Date.parse(job.appointment_start), Date.now()))) return null;
  return { start: job.appointment_start, end: job.appointment_end, zone: job.appointment_time_zone, service, location: row.service_address };
}
