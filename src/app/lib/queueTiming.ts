export const queueProgressStages = [
  "Not Started",
  "Walked / Reviewed",
  "Prep Started",
  "Prep Complete",
  "Painting Started",
  "First Coat Complete",
  "Final Coat Complete",
  "Touchups",
  "Complete",
  "Blocked / Waiting",
];

export const queuePercentOptions = ["", "0", "25", "50", "75", "90", "100"];

export const queueDelayReasons = [
  "",
  "Manager priority changed",
  "Access issue",
  "Materials delay",
  "Extra prep required",
  "Unit condition worse than expected",
  "Waiting on maintenance",
  "Waiting on flooring/carpet",
  "Waiting on approval",
  "Schedule conflict",
  "Other",
];

type TimingItem = {
  ready_date: string | null;
  projected_completion_date?: string | null;
  progress_stage?: string | null;
  completed_date: string | null;
  status?: string | null;
};

function dateValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function isComplete(item: TimingItem) {
  const status = (item.status || "").trim().toLowerCase();

  return (
    Boolean(item.completed_date) ||
    item.progress_stage === "Complete" ||
    ["completed", "invoiced", "paid"].includes(status)
  );
}

export function queueTimingBadge(item: TimingItem) {
  const neededBy = dateValue(item.ready_date);
  const robbieEta = dateValue(item.projected_completion_date);
  const completedDate = dateValue(item.completed_date);

  if (item.progress_stage === "Blocked / Waiting") {
    return "Blocked / Waiting";
  }

  if (!neededBy) {
    return "No Deadline Provided";
  }

  if (isComplete(item)) {
    if (completedDate && completedDate.getTime() <= neededBy.getTime()) {
      return "Completed On Time";
    }

    return "Completed Late";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (today.getTime() > neededBy.getTime()) {
    return "Past Due";
  }

  if (robbieEta && robbieEta.getTime() > neededBy.getTime()) {
    return "At Risk";
  }

  return "On Track";
}

export function queueTimingTone(label: string) {
  if (label === "On Track" || label === "Completed On Time") {
    return "emerald";
  }

  if (label === "At Risk") {
    return "amber";
  }

  if (label === "Past Due" || label === "Completed Late") {
    return "rose";
  }

  if (label === "Blocked / Waiting") {
    return "violet";
  }

  return "zinc";
}
