type CalendarEventInput = {
  title: string;
  date: string | null;
  description?: string | null;
  location?: string | null;
};

function cleanText(value: string | null | undefined) {
  return (value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function eventDate(value: string | null) {
  if (!value) {
    return null;
  }

  const compact = value.slice(0, 10).replaceAll("-", "");

  return compact.length === 8 ? compact : null;
}

function nextDate(value: string | null) {
  const date = value ? new Date(`${value.slice(0, 10)}T00:00:00`) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  date.setDate(date.getDate() + 1);

  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

export function calendarFileName(title: string, date: string | null) {
  const safeTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${date || "scheduled"}-${safeTitle || "trimax-job"}.ics`;
}

export function calendarDataUri(input: CalendarEventInput) {
  const date = eventDate(input.date);
  const endDate = nextDate(input.date);

  if (!date || !endDate) {
    return null;
  }

  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const uid = `${date}-${cleanText(input.title).replace(/[^a-zA-Z0-9]/g, "")}@trimax`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Trimax Operations Platform//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${date}`,
    `DTEND;VALUE=DATE:${endDate}`,
    `SUMMARY:${cleanText(input.title)}`,
    input.location ? `LOCATION:${cleanText(input.location)}` : null,
    input.description
      ? `DESCRIPTION:${cleanText(input.description)}`
      : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(
    lines.join("\r\n")
  )}`;
}
