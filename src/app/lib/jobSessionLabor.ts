export type CrewMode = "simple" | "detailed";

export type CrewDetail = {
  label: string;
  linkedUserId?: string | null;
  temporary: boolean;
  startTime?: string;
  endTime?: string;
  notes?: string;
};

export function formatDuration(minutes: number) {
  const safeMinutes = Math.max(Math.round(minutes), 0);
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;

  if (hours <= 0) {
    return `${remainder}m`;
  }

  return `${hours}h ${remainder.toString().padStart(2, "0")}m`;
}

export function minutesBetween(startedAt: string, endedAt?: string | null) {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }

  return Math.max(Math.round((end - start) / 60000), 0);
}

export function localDateInputValue(value: string | Date = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export function localTimeInputValue(value: string | Date = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

export function combineLocalDateTime(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) {
    return null;
  }

  const date = new Date(`${dateValue}T${timeValue}`);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function calculateSimpleLaborMinutes(
  elapsedMinutes: number,
  crewCount: number
) {
  return Math.max(Math.round(elapsedMinutes), 0) * Math.max(Math.round(crewCount), 1);
}

export function calculateDetailedLaborMinutes(
  sessionDate: string,
  sessionStartTime: string,
  sessionEndTime: string,
  crew: CrewDetail[]
) {
  const sessionStart = combineLocalDateTime(sessionDate, sessionStartTime);
  const sessionEnd = combineLocalDateTime(sessionDate, sessionEndTime);

  if (!sessionStart || !sessionEnd || sessionEnd <= sessionStart) {
    return 0;
  }

  return crew.reduce((total, member) => {
    const memberStart = combineLocalDateTime(
      sessionDate,
      member.startTime || sessionStartTime
    );
    const memberEnd = combineLocalDateTime(
      sessionDate,
      member.endTime || sessionEndTime
    );

    if (!memberStart || !memberEnd || memberEnd <= memberStart) {
      return total;
    }

    const boundedStart = Math.max(memberStart.getTime(), sessionStart.getTime());
    const boundedEnd = Math.min(memberEnd.getTime(), sessionEnd.getTime());

    if (boundedEnd <= boundedStart) {
      return total;
    }

    return total + Math.round((boundedEnd - boundedStart) / 60000);
  }, 0);
}

export function normalizeCrewCount(value: number | null | undefined) {
  if (!Number.isFinite(value) || !value || value < 1) {
    return 1;
  }

  return Math.max(1, Math.min(Math.round(value), 50));
}
