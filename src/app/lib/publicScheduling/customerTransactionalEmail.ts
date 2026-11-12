import { createHmac, timingSafeEqual } from "node:crypto";
import { emailBranding, escapeEmail } from "../documentEmailBranding.ts";
import { calendarDataUri } from "../calendar.ts";

export type CustomerAppointment = { start: string; end: string; zone: string; service: string; location: string };

const origin = "https://app.rnlcreations.com";
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function signature(requestId: string, start: string, end: string, secret: string) {
  return createHmac("sha256", secret).update(JSON.stringify(["customer-calendar-v1", requestId, Date.parse(start), Date.parse(end)])).digest("hex");
}

export function calendarLink(requestId: string, appointment: CustomerAppointment, secret: string) {
  const token = signature(requestId, appointment.start, appointment.end, secret);
  return `${origin}/api/public-scheduling/calendar?request=${requestId}&token=${token}`;
}

export function validCalendarToken(requestId: string, token: string, appointment: CustomerAppointment, secret: string) {
  return uuid.test(requestId) && /^[0-9a-f]{64}$/.test(token) &&
    timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(signature(requestId, appointment.start, appointment.end, secret), "hex"));
}

export function appointmentCalendar(requestId: string, appointment: CustomerAppointment) {
  const uri = calendarDataUri({
    id: requestId, title: `R&L Creations: ${appointment.service}`, date: appointment.start.slice(0, 10),
    start: appointment.start, end: appointment.end, location: appointment.location,
  });
  if (!uri) throw Error("Calendar date unavailable");
  return decodeURIComponent(uri.slice(uri.indexOf(",") + 1));
}

export function renderSchedulingEmail(reference: string, service: string, appointment?: CustomerAppointment, link?: string) {
  const heading = appointment ? "Appointment Confirmed" : "Request Received";
  const paragraphs = appointment ? [
    "Your appointment with R&L Creations is confirmed.",
    `Service: ${service}`,
    `Location: ${appointment.location}`,
    `When: ${new Intl.DateTimeFormat("en-US", { timeZone: appointment.zone, dateStyle: "full", timeStyle: "short" }).formatRange(new Date(appointment.start), new Date(appointment.end))} (${appointment.zone})`,
  ] : ["We received your service request. It is pending owner approval and is not a confirmed appointment.", `Service: ${service}`];
  paragraphs.push(`Request reference: ${reference}`);
  const branding = emailBranding("rnl-creations", "R&L Creations");
  return {
    subject: `R&L Creations | ${heading}`,
    text: [heading, ...paragraphs, ...(link ? [`Add to Calendar: ${link}`] : []), branding.text].join("\n\n"),
    html: `<h1>${heading}</h1>${paragraphs.map(value => `<p>${escapeEmail(value)}</p>`).join("")}${link ? `<p><a href="${escapeEmail(link)}">Add to Calendar</a></p>` : ""}${branding.html}`,
  };
}
