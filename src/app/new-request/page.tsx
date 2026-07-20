"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import InputField from "../components/InputField";
import Toast from "../components/Toast";
import { createQueueItem } from "../lib/createQueueItem";
import { logActivity } from "../lib/activityLog";
import { supabase } from "../lib/supabase";
import {
  TBD_VALUE,
  isTbdValue,
  normalizeTbdValue,
} from "../lib/tbd";
import {
  canonicalApartmentUnitLabel,
  displayUnitLayout,
} from "../utils/unitLabels";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type RenovationMemory = {
  prior_renovation: boolean | null;
  prior_renovation_details: string | null;
  renovation_needed: boolean | null;
  renovation_needed_details: string | null;
};

type PaintMemory = {
  completed_date: string | null;
  paint_type: string | null;
};

type PropertyUnitProfile = {
  id: string;
  building_letter: string | null;
  unit_number: number | null;
  unit_label: string | null;
  floor: string | null;
  floorplan: string | null;
  notes: string | null;
};

type UnitHistoryRecord = {
  property_unit_id: string | null;
  event_type: string | null;
  event_date: string | null;
  paint_type: string | null;
  flooring: string | null;
  smoker_remediation: boolean | null;
  prior_renovation: boolean | null;
  prior_renovation_details: string | null;
  queue_item_is_renovation: boolean | null;
  created_at: string | null;
};

type QueueHistoryRecord = {
  unit: string | null;
  completed_date: string | null;
  scheduled_date: string | null;
  created_at: string | null;
  paint_type: string | null;
  flooring: string | null;
  smoked_in: boolean | null;
  prior_renovation: boolean | null;
  prior_renovation_details: string | null;
  renovation_needed: boolean | null;
  renovation_needed_details: string | null;
};

type ActiveQueueItem = {
  id: string;
  unit: string | null;
  status: string | null;
  priority: string | null;
  priority_order?: number | null;
  ready_date: string | null;
  scheduled_date: string | null;
  created_at: string | null;
  notes: string | null;
};

type UnitHistorySummary = {
  lastPaintDate: string;
  lastPaintType: string;
  lastFlooring: string;
  lastRenovation: string;
  lastSmokerRemediation: "Yes" | "No" | "Never Recorded";
  totalRecordedTurns: number;
  hasHistory: boolean;
};

type QueueRequestDraft = {
  property: string;
  unitsText: string;
  bulkMode?: boolean;
  bulkRows?: BulkQueueRow[];
  paintType: string;
  unitLayout: string;
  wallPaintColor: string;
  flooring: string;
  priority: string;
  priorityOrderStart: string;
  smokedIn: boolean;
  primerRequested: boolean;
  priorRenovation: boolean;
  priorRenovationDetails: string;
  renovationNeeded: boolean;
  renovationNeededDetails: string;
  moveOutDate: string;
  readyDate: string;
  notes: string;
  savedAt: string;
};

type BulkQueueRow = {
  id: string;
  unit: string;
  moveOutDate: string;
  readyDate: string;
  priorityOrder: string;
  paintType: string;
  flooring: string;
  notes: string;
};

const QUEUE_DRAFT_VERSION = "v1";

const rnlPropertyOptions = [
  "North Creek Apartments",
  "Evergreen Apartments",
  "Global S",
];

const justKleenClientOptions = [
  "5 Star 5",
  "Bank of America",
  "Hope Church",
  "Holy Cross Church",
  "Inventive Construction",
];

const rnlPaintTypeOptions = [
  "Classic",
  "Touch-Up",
  "Full Repaint",
  "Primer + Paint",
  "Reno Paint",
];

const rnlWallPaintColorOptions = [
  TBD_VALUE,
  "Sherwin-Williams Roman Column (SW 7562)",
  "Sherwin-Williams Nebulous White (SW 7063)",
  "Confirm with manager",
];

const northCreekUnitLayoutOptions = [
  "2x2 - 2 Bed / 2 Bath",
  "2x1 - 2 Bed / 1 Bath",
  "Confirm with manager",
];

const justKleenServiceOptions = [
  "Recurring Cleaning",
  "Deep Cleaning",
  "Move-Out Cleaning",
  "Post-Construction Cleaning",
  "Bank Cleaning",
  "Church Cleaning",
];

const rnlFlooringOptions = [
  TBD_VALUE,
  "Keep Carpet & Keep Vinyl",
  "Keep Vinyl & Replace Carpet",
  "Keep Carpet & Replace Vinyl",
  "Replace Carpet & Replace Vinyl",
  "Keep Existing Flooring",
  "Replace Carpet",
  "Replace Vinyl",
  "LVP",
  "Carpet",
  "Vinyl",
];

const justKleenScopeOptions = [
  "Full Facility",
  "Office Cleaning",
  "Common Areas",
  "Restrooms",
  "Floors",
  "Windows",
  "Touch Points",
];

function optionsForBusiness(
  businessSlug: string,
  rnlOptions: string[],
  justKleenOptions: string[]
) {
  return businessSlug === "just-kleen"
    ? justKleenOptions
    : rnlOptions;
}

function propertyKey(value: string) {
  return value
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shouldCollectUnitLayout(businessSlug: string, property: string) {
  return (
    businessSlug === "rnl-creations" &&
    propertyKey(property) === "north-creek-apartments"
  );
}

function propertyFromParam(
  value: string | null,
  options: string[]
) {
  if (!value) {
    return "";
  }

  return (
    options.find(
      (option) => propertyKey(option) === value
    ) ?? ""
  );
}

function unitListFromText(value: string) {
  return value
    .split(/[\n,]+/g)
    .map((unit) => unit.trim())
    .filter(Boolean);
}

function normalizePriorityOrderStart(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return "invalid";
  }

  return parsed;
}

function normalizeUnitLabel(value: string) {
  return canonicalApartmentUnitLabel(value);
}

function legacyUnpaddedUnitLabel(value: string | null | undefined) {
  const normalized = normalizeUnitLabel(value || "");
  const match = normalized.match(/^([A-Z])0([1-9])$/);

  if (!match) {
    return normalized;
  }

  return `${match[1]}${match[2]}`;
}

function unitOptionAliases(option: string) {
  return [
    normalizeUnitLabel(option),
    legacyUnpaddedUnitLabel(option),
  ];
}

function unitLayoutLabel(floorplan: string | null | undefined) {
  if (floorplan === "2x1") {
    return "2x1 - 2 Bed / 1 Bath";
  }

  if (floorplan === "2x2") {
    return "2x2 - 2 Bed / 2 Bath";
  }

  return "";
}

function formatFloor(value: string | null | undefined) {
  if (value === "bottom") {
    return "Bottom";
  }

  if (value === "top") {
    return "Top";
  }

  return "-";
}

function dateValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

function formatShortDate(value: string | null | undefined) {
  const parsedDate = dateValue(value);

  if (!parsedDate) {
    return "-";
  }

  return parsedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function daysBetweenDates(
  startValue: string | null | undefined,
  endValue: string | null | undefined
) {
  const start = dateValue(startValue);
  const end = dateValue(endValue);

  if (!start || !end) {
    return null;
  }

  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function isOpenQueueStatus(status: string | null | undefined) {
  const normalized = (status || "").trim().toLowerCase();

  return !["completed", "invoiced", "paid", "archived"].includes(normalized);
}

function priorityBehindNewRequest(value: string | null | undefined) {
  return value === "Urgent" ? "High" : "Normal";
}

function formatHistoryDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsedDate = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isFutureHistoryDate(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const parsedDate = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return parsedDate > today;
}

function isActualUnitHistory(row: UnitHistoryRecord) {
  const eventType = (row.event_type || "").toLowerCase();

  if (eventType === "scheduled") {
    return false;
  }

  if (isFutureHistoryDate(row.event_date)) {
    return false;
  }

  return true;
}

function isPaintUnitHistory(row: UnitHistoryRecord) {
  const eventType = (row.event_type || "").toLowerCase();

  return (
    Boolean(row.paint_type) &&
    ["paint", "general_turn", "renovation"].includes(eventType) &&
    !isFutureHistoryDate(row.event_date)
  );
}

function isCompletedQueueHistory(row: QueueHistoryRecord) {
  return Boolean(row.completed_date) && !isFutureHistoryDate(row.completed_date);
}

function emptyHistorySummary(): UnitHistorySummary {
  return {
    lastPaintDate: "Never Recorded",
    lastPaintType: "Never Recorded",
    lastFlooring: "Never Recorded",
    lastRenovation: "Never Recorded",
    lastSmokerRemediation: "Never Recorded",
    totalRecordedTurns: 0,
    hasHistory: false,
  };
}

function buildUnitHistorySummary({
  unitProfile,
  historyRows,
  queueRows,
}: {
  unitProfile: PropertyUnitProfile;
  historyRows: UnitHistoryRecord[];
  queueRows: QueueHistoryRecord[];
}) {
  const summary = emptyHistorySummary();
  const actualHistoryRows = historyRows.filter(
    (row) => row.property_unit_id === unitProfile.id && isActualUnitHistory(row)
  );

  for (const row of actualHistoryRows) {
    summary.hasHistory = true;

    if (
      isPaintUnitHistory(row) &&
      row.paint_type &&
      summary.lastPaintType === "Never Recorded"
    ) {
      summary.lastPaintType = row.paint_type;
      summary.lastPaintDate =
        formatHistoryDate(row.event_date) || summary.lastPaintDate;
    }

    if (row.flooring && summary.lastFlooring === "Never Recorded") {
      summary.lastFlooring = row.flooring;
    }

    if (
      (row.queue_item_is_renovation ||
        row.prior_renovation ||
        row.prior_renovation_details) &&
      summary.lastRenovation === "Never Recorded"
    ) {
      summary.lastRenovation =
        row.prior_renovation_details ||
        (row.queue_item_is_renovation ? "Renovation recorded" : "Yes");
    }

    if (
      row.smoker_remediation !== null &&
      summary.lastSmokerRemediation === "Never Recorded"
    ) {
      summary.lastSmokerRemediation = row.smoker_remediation ? "Yes" : "No";
    }
  }

  const queueRowsForUnit = queueRows.filter(
    (row) =>
      normalizeUnitLabel(row.unit || "") ===
      normalizeUnitLabel(unitProfile.unit_label || "")
  );
  const completedQueueRowsForUnit = queueRowsForUnit.filter(
    isCompletedQueueHistory
  );

  summary.totalRecordedTurns = Math.max(
    actualHistoryRows.length,
    completedQueueRowsForUnit.length
  );

  for (const row of completedQueueRowsForUnit) {
    summary.hasHistory = true;

    if (row.paint_type && summary.lastPaintType === "Never Recorded") {
      summary.lastPaintType = row.paint_type;
      summary.lastPaintDate =
        formatHistoryDate(row.completed_date) || summary.lastPaintDate;
    }

    if (row.flooring && summary.lastFlooring === "Never Recorded") {
      summary.lastFlooring = row.flooring;
    }

    if (
      (row.renovation_needed ||
        row.prior_renovation ||
        row.renovation_needed_details ||
        row.prior_renovation_details) &&
      summary.lastRenovation === "Never Recorded"
    ) {
      summary.lastRenovation =
        row.renovation_needed_details ||
        row.prior_renovation_details ||
        (row.renovation_needed ? "Renovation recorded" : "Yes");
    }

    if (
      row.smoked_in !== null &&
      summary.lastSmokerRemediation === "Never Recorded"
    ) {
      summary.lastSmokerRemediation = row.smoked_in ? "Yes" : "No";
    }
  }

  summary.hasHistory =
    summary.hasHistory ||
    summary.totalRecordedTurns > 0 ||
    summary.lastPaintType !== "Never Recorded" ||
    summary.lastFlooring !== "Never Recorded" ||
    summary.lastRenovation !== "Never Recorded" ||
    summary.lastSmokerRemediation !== "Never Recorded";

  return summary;
}

function previousRenovationLabel(value: string | null | undefined) {
  const detail = (value || "").trim();

  if (!detail) {
    return "";
  }

  return detail.toLowerCase().startsWith("previous ")
    ? detail
    : `Previous ${detail}`;
}

function formatLastPaintedMessage(memory: PaintMemory) {
  if (!memory.completed_date) {
    return "";
  }

  const completedDate = new Date(
    `${memory.completed_date.slice(0, 10)}T00:00:00`
  );

  if (Number.isNaN(completedDate.getTime())) {
    return "";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysAgo = Math.max(
    Math.round((today.getTime() - completedDate.getTime()) / 86400000),
    0
  );
  const monthsAgo = Math.floor(daysAgo / 30);
  const yearsAgo = Math.floor(daysAgo / 365);
  const relative =
    yearsAgo >= 1
      ? `${yearsAgo} year${yearsAgo === 1 ? "" : "s"} ago`
      : monthsAgo >= 1
        ? `${monthsAgo} month${monthsAgo === 1 ? "" : "s"} ago`
        : daysAgo === 0
          ? "today"
          : `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`;
  const formattedDate = completedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `Last painted ${formattedDate} (${relative})${
    memory.paint_type ? ` with ${memory.paint_type}` : ""
  }.`;
}

function queueDraftKey(businessSlug: string, propertyParam: string | null) {
  return [
    "trimax",
    QUEUE_DRAFT_VERSION,
    "new-queue-request",
    businessSlug,
    propertyParam || "all-properties",
  ].join(":");
}

function hasDraftContent(draft: QueueRequestDraft) {
  return Boolean(
    draft.unitsText ||
      draft.paintType ||
      draft.unitLayout ||
      draft.wallPaintColor ||
      draft.flooring ||
      draft.smokedIn ||
      draft.priorRenovation ||
      draft.priorRenovationDetails ||
      draft.renovationNeeded ||
      draft.renovationNeededDetails ||
      draft.moveOutDate ||
      draft.readyDate ||
      draft.priorityOrderStart ||
      draft.notes
  );
}

function formatDraftSavedAt(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function createBulkQueueRow(
  defaults?: Partial<Omit<BulkQueueRow, "id">>
): BulkQueueRow {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    unit: defaults?.unit ?? "",
    moveOutDate: defaults?.moveOutDate ?? "",
    readyDate: defaults?.readyDate ?? "",
    priorityOrder: defaults?.priorityOrder ?? "",
    paintType: defaults?.paintType ?? "",
    flooring: defaults?.flooring ?? "",
    notes: defaults?.notes ?? "",
  };
}

function NewRequestPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const businessSlug = searchParams.get("business") ?? "rnl-creations";
  const propertyParam = searchParams.get("property");
  const isJustKleen = businessSlug === "just-kleen";
  const propertyOptions = optionsForBusiness(
    businessSlug,
    rnlPropertyOptions,
    justKleenClientOptions
  );
  const paintTypeOptions = optionsForBusiness(
    businessSlug,
    rnlPaintTypeOptions,
    justKleenServiceOptions
  );
  const flooringOptions = optionsForBusiness(
    businessSlug,
    rnlFlooringOptions,
    justKleenScopeOptions
  );
  const cancelParams = new URLSearchParams({
    business: businessSlug,
  });

  if (propertyParam) {
    cancelParams.set("property", propertyParam);
  }

  const cancelHref = `/queue?${cancelParams.toString()}`;

  const [business, setBusiness] = useState<Business | null>(null);

  const [property, setProperty] = useState(
    propertyFromParam(propertyParam, propertyOptions)
  );
  const [unitsText, setUnitsText] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkQueueRow[]>([
    createBulkQueueRow(),
  ]);
  const [paintType, setPaintType] = useState("");
  const [unitLayout, setUnitLayout] = useState("");
  const [wallPaintColor, setWallPaintColor] = useState("");
  const [flooring, setFlooring] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [priorityOrderStart, setPriorityOrderStart] = useState("");
  const [smokedIn, setSmokedIn] = useState(false);
  const [primerRequested, setPrimerRequested] = useState(true);
  const [priorRenovation, setPriorRenovation] = useState(false);
  const [priorRenovationDetails, setPriorRenovationDetails] =
    useState("");
  const [renovationNeeded, setRenovationNeeded] = useState(false);
  const [renovationNeededDetails, setRenovationNeededDetails] =
    useState("");
  const [renovationMemoryMessage, setRenovationMemoryMessage] =
    useState("");
  const [paintMemoryMessage, setPaintMemoryMessage] =
    useState("");
  const [propertyUnits, setPropertyUnits] = useState<PropertyUnitProfile[]>(
    []
  );
  const [historyByUnitId, setHistoryByUnitId] = useState<
    Record<string, UnitHistorySummary>
  >({});
  const [propertyUnitMessage, setPropertyUnitMessage] = useState("");
  const [unitLayoutTouched, setUnitLayoutTouched] = useState(false);
  const [moveOutDate, setMoveOutDate] = useState("");
  const [readyDate, setReadyDate] = useState("");
  const [notes, setNotes] = useState("");
  const [prioritySignals, setPrioritySignals] = useState<ActiveQueueItem[]>(
    []
  );
  const [isCheckingPriority, setIsCheckingPriority] = useState(false);
  const [plannedPrioritySwapIds, setPlannedPrioritySwapIds] = useState<
    string[]
  >([]);

  const [isSaving, setIsSaving] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState("");

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const draftKey = queueDraftKey(businessSlug, propertyParam);
  const currentDraft = useMemo<QueueRequestDraft>(
    () => ({
      property,
      unitsText,
      bulkMode,
      bulkRows,
      paintType,
      unitLayout,
      wallPaintColor,
      flooring,
      priority,
      priorityOrderStart,
      smokedIn,
      primerRequested,
      priorRenovation,
      priorRenovationDetails,
      renovationNeeded,
      renovationNeededDetails,
      moveOutDate,
      readyDate,
      notes,
      savedAt: new Date().toISOString(),
    }),
    [
      property,
      unitsText,
      bulkMode,
      bulkRows,
      paintType,
      unitLayout,
      wallPaintColor,
      flooring,
      priority,
      priorityOrderStart,
      smokedIn,
      primerRequested,
      priorRenovation,
      priorRenovationDetails,
      renovationNeeded,
      renovationNeededDetails,
      moveOutDate,
      readyDate,
      notes,
    ]
  );

  function clearSavedDraft() {
    window.localStorage.removeItem(draftKey);
    setDraftLoaded(false);
    setDraftSavedAt("");
  }

  useEffect(() => {
    async function loadBusiness() {
      const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .eq("slug", businessSlug)
        .single();

      if (error || !data) {
        console.error(error);

        setToast({
          type: "error",
          message: "Unable to load selected business.",
        });

        return;
      }

      setBusiness(data as Business);
    }

    loadBusiness();
  }, [businessSlug]);

  useEffect(() => {
    let isActive = true;

    try {
      const rawDraft = window.localStorage.getItem(draftKey);

      if (!rawDraft) {
        window.setTimeout(() => {
          if (isActive) {
            setDraftReady(true);
          }
        }, 0);
        return () => {
          isActive = false;
        };
      }

      const draft = JSON.parse(rawDraft) as Partial<QueueRequestDraft>;

      window.setTimeout(() => {
        if (!isActive) {
          return;
        }

        setProperty(draft.property ?? "");
        setUnitsText(draft.unitsText ?? "");
        setBulkMode(Boolean(draft.bulkMode));
        setBulkRows(
          draft.bulkRows && draft.bulkRows.length > 0
            ? draft.bulkRows.map((row) =>
                createBulkQueueRow({
                  unit: row.unit,
                  moveOutDate: row.moveOutDate,
                  readyDate: row.readyDate,
                  priorityOrder: row.priorityOrder,
                  paintType: row.paintType,
                  flooring: row.flooring,
                  notes: row.notes,
                })
              )
            : [createBulkQueueRow()]
        );
        setPaintType(draft.paintType ?? "");
        setUnitLayout(draft.unitLayout ?? "");
        setUnitLayoutTouched(Boolean(draft.unitLayout));
        setWallPaintColor(draft.wallPaintColor ?? "");
        setFlooring(draft.flooring ?? "");
        setPriority(draft.priority ?? "Normal");
        setPriorityOrderStart(draft.priorityOrderStart ?? "");
        setSmokedIn(Boolean(draft.smokedIn));
        setPrimerRequested(draft.primerRequested === false ? false : true);
        setPriorRenovation(Boolean(draft.priorRenovation));
        setPriorRenovationDetails(draft.priorRenovationDetails ?? "");
        setRenovationNeeded(Boolean(draft.renovationNeeded));
        setRenovationNeededDetails(draft.renovationNeededDetails ?? "");
        setMoveOutDate(draft.moveOutDate ?? "");
        setReadyDate(draft.readyDate ?? "");
        setNotes(draft.notes ?? "");
        setDraftLoaded(true);
        setDraftSavedAt(draft.savedAt ?? "");
        setDraftReady(true);
      }, 0);
    } catch {
      window.localStorage.removeItem(draftKey);
      window.setTimeout(() => {
        if (isActive) {
          setDraftReady(true);
        }
      }, 0);
    }

    return () => {
      isActive = false;
    };
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady || isSaving) {
      return;
    }

    if (!hasDraftContent(currentDraft)) {
      window.localStorage.removeItem(draftKey);
      window.setTimeout(() => setDraftSavedAt(""), 0);
      return;
    }

    const timeout = window.setTimeout(() => {
      const draft = {
        ...currentDraft,
        savedAt: new Date().toISOString(),
      };

      window.localStorage.setItem(draftKey, JSON.stringify(draft));
      setDraftSavedAt(draft.savedAt);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [currentDraft, draftKey, draftReady, isSaving]);

  useEffect(() => {
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      if (!draftReady || isSaving || !hasDraftContent(currentDraft)) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeLeaving);

    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
    };
  }, [currentDraft, draftReady, isSaving]);

  const collectUnitLayout = shouldCollectUnitLayout(
    businessSlug,
    property
  );
  const units = useMemo(
    () =>
      bulkMode
        ? bulkRows
            .map((row) => row.unit.trim())
            .filter((unit) => unit.length > 0)
        : unitListFromText(unitsText),
    [bulkMode, bulkRows, unitsText]
  );
  const normalizedUnits = useMemo(
    () => units.map(normalizeUnitLabel),
    [units]
  );

  function updateBulkRow(
    rowId: string,
    field: keyof Omit<BulkQueueRow, "id">,
    value: string
  ) {
    setBulkRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row
      )
    );
  }

  function addBulkRow() {
    setBulkRows((currentRows) => [
      ...currentRows,
        createBulkQueueRow({
          moveOutDate,
          readyDate,
          priorityOrder:
          priorityOrderStart.trim() &&
          Number.isInteger(Number(priorityOrderStart)) &&
          currentRows.length > 0
            ? String(Number(priorityOrderStart) + currentRows.length)
            : "",
        paintType,
        flooring,
      }),
    ]);
  }

  function duplicatePreviousBulkRow() {
    setBulkRows((currentRows) => {
      const previousRow = currentRows.at(-1);

      return [
        ...currentRows,
        createBulkQueueRow({
          unit: "",
          moveOutDate: previousRow?.moveOutDate || moveOutDate,
          readyDate: previousRow?.readyDate || readyDate,
          priorityOrder:
            previousRow?.priorityOrder &&
            Number.isInteger(Number(previousRow.priorityOrder))
              ? String(Number(previousRow.priorityOrder) + 1)
              : previousRow?.priorityOrder || "",
          paintType: previousRow?.paintType || paintType,
          flooring: previousRow?.flooring || flooring,
          notes: previousRow?.notes || "",
        }),
      ];
    });
  }

  function removeBulkRow(rowId: string) {
    setBulkRows((currentRows) =>
      currentRows.length === 1
        ? [createBulkQueueRow()]
        : currentRows.filter((row) => row.id !== rowId)
    );
  }

  useEffect(() => {
    async function loadRenovationMemory() {
      if (!business || isJustKleen || !property.trim()) {
        setRenovationMemoryMessage("");
        setPaintMemoryMessage("");
        return;
      }

      const memoryUnits = units.map((unit) =>
        collectUnitLayout ? normalizeUnitLabel(unit) : unit
      );

      if (memoryUnits.length !== 1) {
        setRenovationMemoryMessage("");
        setPaintMemoryMessage("");
        return;
      }

      const { data, error } = await supabase
        .from("queue_items")
        .select(
          "prior_renovation, prior_renovation_details, renovation_needed, renovation_needed_details"
        )
        .eq("business_id", business.id)
        .eq("property", property)
        .eq("unit", memoryUnits[0])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        if (error) {
          console.warn("Renovation memory lookup failed:", error.message);
        }
        setRenovationMemoryMessage("");
      } else {
        const memory = data as RenovationMemory;
        const currentRenovationBecomesHistory =
          Boolean(memory.renovation_needed) &&
          Boolean(memory.renovation_needed_details);
        const hasPriorRenovation =
          Boolean(memory.prior_renovation) ||
          Boolean(memory.prior_renovation_details) ||
          currentRenovationBecomesHistory;

        setPriorRenovation(hasPriorRenovation);
        setPriorRenovationDetails(
          memory.prior_renovation_details ||
            previousRenovationLabel(memory.renovation_needed_details)
        );
        setRenovationNeeded(false);
        setRenovationNeededDetails("");
        setRenovationMemoryMessage(
          "Loaded renovation history for this unit."
        );
      }

      const { data: paintData, error: paintError } = await supabase
        .from("queue_items")
        .select("completed_date, paint_type")
        .eq("business_id", business.id)
        .eq("property", property)
        .eq("unit", memoryUnits[0])
        .not("completed_date", "is", null)
        .order("completed_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (paintError || !paintData) {
        if (paintError) {
          console.warn("Paint memory lookup failed:", paintError.message);
        }
        setPaintMemoryMessage("");
        return;
      }

      setPaintMemoryMessage(
        formatLastPaintedMessage(paintData as PaintMemory)
      );
    }

    loadRenovationMemory();
  }, [business, collectUnitLayout, isJustKleen, property, units]);
  const normalizedUnitsKey = normalizedUnits.join("|");
  const unitOptions = collectUnitLayout
    ? propertyUnits.map((unitProfile) => unitProfile.unit_label || "")
    : [];

  useEffect(() => {
    let isActive = true;

    async function loadPrioritySignals() {
      if (
        !business ||
        isJustKleen ||
        !property.trim() ||
        !readyDate ||
        normalizedUnits.length === 0
      ) {
        setPrioritySignals([]);
        setPlannedPrioritySwapIds([]);
        setIsCheckingPriority(false);
        return;
      }

      setIsCheckingPriority(true);

      const selectedUnitSet = new Set(
        normalizedUnits.flatMap((unit) => [
          normalizeUnitLabel(unit),
          legacyUnpaddedUnitLabel(unit),
        ])
      );

      const { data, error } = await supabase
        .from("queue_items")
        .select(
          "id, unit, status, priority, priority_order, ready_date, scheduled_date, created_at, notes"
        )
        .eq("business_id", business.id)
        .eq("property", property)
        .is("completed_date", null)
        .order("ready_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

      if (!isActive) {
        return;
      }

      setIsCheckingPriority(false);

      if (error) {
        console.warn("Priority intelligence lookup failed:", error.message);
        setPrioritySignals([]);
        return;
      }

      const rows = ((data ?? []) as ActiveQueueItem[]).filter((item) => {
        if (!isOpenQueueStatus(item.status)) {
          return false;
        }

        const unitLabel = normalizeUnitLabel(item.unit || "");

        if (selectedUnitSet.has(unitLabel)) {
          return false;
        }

        const dayGap = daysBetweenDates(item.ready_date, readyDate);

        if (dayGap === null) {
          return false;
        }

        return Math.abs(dayGap) <= 3 || (dayGap > 0 && dayGap <= 7);
      });

      setPrioritySignals(rows.slice(0, 4));
      setPlannedPrioritySwapIds((currentIds) =>
        currentIds.filter((id) => rows.some((row) => row.id === id))
      );
    }

    loadPrioritySignals();

    return () => {
      isActive = false;
    };
  }, [
    business,
    isJustKleen,
    normalizedUnits,
    normalizedUnitsKey,
    property,
    readyDate,
  ]);

  const selectedUnitProfiles = useMemo(
    () =>
      normalizedUnits
        .map((unitLabel) =>
          propertyUnits.find(
            (unitProfile) =>
              normalizeUnitLabel(unitProfile.unit_label || "") === unitLabel
          )
        )
        .filter((unitProfile): unitProfile is PropertyUnitProfile =>
          Boolean(unitProfile)
        ),
    [normalizedUnits, propertyUnits]
  );
  const selectedFloorplans = useMemo(
    () =>
      Array.from(
        new Set(
          selectedUnitProfiles
            .map((unitProfile) => unitProfile.floorplan)
            .filter((floorplan): floorplan is string => Boolean(floorplan))
        )
      ),
    [selectedUnitProfiles]
  );
  const selectedFloorplansKey = selectedFloorplans.join("|");
  const selectedUnitProfileKey = selectedUnitProfiles
    .map((unitProfile) => unitProfile.id)
    .join("|");

  useEffect(() => {
    async function loadPropertyUnits() {
      if (!business || !collectUnitLayout) {
        setPropertyUnits([]);
        setPropertyUnitMessage("");
        return;
      }

      const { data: propertyData, error: propertyError } = await supabase
        .from("properties")
        .select("id")
        .eq("business_id", business.id)
        .eq("name", "North Creek Apartments")
        .limit(1)
        .maybeSingle();

      if (propertyError || !propertyData) {
        if (propertyError) {
          console.warn("Property lookup failed:", propertyError.message);
        }
        setPropertyUnits([]);
        setPropertyUnitMessage(
          "North Creek unit map is not loaded yet. Run the Property Intelligence SQL, then this form can auto-fill unit facts."
        );
        return;
      }

      const { data, error } = await supabase
        .from("property_units")
        .select(
          "id, building_letter, unit_number, unit_label, floor, floorplan, notes"
        )
        .eq("property_id", propertyData.id)
        .order("building_letter", { ascending: true })
        .order("unit_number", { ascending: true });

      if (error) {
        console.warn("Property unit lookup failed:", error.message);
        setPropertyUnits([]);
        setPropertyUnitMessage(
          "North Creek unit map is not available yet. Queue creation still works, but unit facts cannot auto-fill."
        );
        return;
      }

      setPropertyUnits((data ?? []) as PropertyUnitProfile[]);
      setPropertyUnitMessage("");
    }

    loadPropertyUnits();
  }, [business, collectUnitLayout]);

  useEffect(() => {
    async function loadSelectedUnitHistory() {
      if (
        !business ||
        !collectUnitLayout ||
        selectedUnitProfiles.length === 0
      ) {
        setHistoryByUnitId({});
        return;
      }

      const selectedUnitIds = selectedUnitProfiles.map(
        (unitProfile) => unitProfile.id
      );
      const selectedUnitLabels = selectedUnitProfiles
        .map((unitProfile) => unitProfile.unit_label)
        .filter((label): label is string => Boolean(label));
      const selectedQueueUnitLabels = Array.from(
        new Set(
          selectedUnitLabels.flatMap((label) => [
            normalizeUnitLabel(label),
            legacyUnpaddedUnitLabel(label),
          ])
        )
      );

      const { data: unitHistoryData, error: unitHistoryError } =
        await supabase
          .from("unit_history")
          .select(
            "property_unit_id, event_type, event_date, paint_type, flooring, smoker_remediation, prior_renovation, prior_renovation_details, queue_item_is_renovation, created_at"
          )
          .in("property_unit_id", selectedUnitIds)
          .order("event_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });

      if (unitHistoryError) {
        console.warn(
          "Unit history preview lookup failed:",
          unitHistoryError.message
        );
      }

      const { data: queueHistoryData, error: queueHistoryError } =
        await supabase
          .from("queue_items")
          .select(
            "unit, completed_date, scheduled_date, created_at, paint_type, flooring, smoked_in, prior_renovation, prior_renovation_details, renovation_needed, renovation_needed_details"
          )
          .eq("business_id", business.id)
          .eq("property", property)
          .in("unit", selectedQueueUnitLabels)
          .order("completed_date", { ascending: false, nullsFirst: false })
          .order("scheduled_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });

      if (queueHistoryError) {
        console.warn(
          "Queue history preview lookup failed:",
          queueHistoryError.message
        );
      }

      const unitHistoryRows =
        (unitHistoryData ?? []) as UnitHistoryRecord[];
      const queueHistoryRows =
        (queueHistoryData ?? []) as QueueHistoryRecord[];

      setHistoryByUnitId(
        Object.fromEntries(
          selectedUnitProfiles.map((unitProfile) => [
            unitProfile.id,
            buildUnitHistorySummary({
              unitProfile,
              historyRows: unitHistoryRows,
              queueRows: queueHistoryRows,
            }),
          ])
        )
      );
    }

    loadSelectedUnitHistory();
  }, [
    business,
    collectUnitLayout,
    property,
    selectedUnitProfileKey,
    selectedUnitProfiles,
  ]);

  useEffect(() => {
    if (!collectUnitLayout || unitLayoutTouched) {
      return;
    }

    if (selectedFloorplans.length === 1) {
      window.setTimeout(() => {
        setUnitLayout(unitLayoutLabel(selectedFloorplans[0]));
      }, 0);
    }
  }, [
    collectUnitLayout,
    selectedFloorplans,
    selectedFloorplansKey,
    unitLayoutTouched,
  ]);

  const priorityLeadUnit = prioritySignals[0] ?? null;
  const priorityLeadUnitLabel = priorityLeadUnit
    ? normalizeUnitLabel(priorityLeadUnit.unit || "")
    : "";
  const requestedUnitLabel =
    normalizedUnits.length === 1
      ? normalizedUnits[0]
      : `${normalizedUnits.length} units`;
  const priorityNoteText = priorityLeadUnit
    ? `Priority check: ${requestedUnitLabel} may need to jump ahead of ${priorityLeadUnitLabel || "an existing queue item"} due ${formatShortDate(priorityLeadUnit.ready_date)}. Confirm with management before scheduling.`
    : "";
  const requestCount = units.length;
  const propertyReady = Boolean(property.trim());
  const bulkRowsWithContent = bulkRows.filter(
    (row) =>
      row.unit.trim() ||
      row.moveOutDate ||
      row.readyDate ||
      row.priorityOrder.trim() ||
      row.paintType.trim() ||
      row.flooring.trim() ||
      row.notes.trim()
  );
  const bulkCompleteRows = bulkRowsWithContent.filter(
    (row) =>
      row.unit.trim() &&
      row.paintType.trim() &&
      row.flooring.trim() &&
      normalizePriorityOrderStart(row.priorityOrder) !== "invalid"
  );
  const scopeReady = bulkMode
    ? bulkCompleteRows.length > 0 &&
      bulkCompleteRows.length === bulkRowsWithContent.length
    : Boolean(paintType.trim());
  const flooringReady = bulkMode
    ? bulkCompleteRows.length > 0 &&
      bulkCompleteRows.length === bulkRowsWithContent.length
    : Boolean(flooring.trim());
  const flooringIsTbd = bulkMode
    ? bulkRows.some((row) => isTbdValue(row.flooring))
    : isTbdValue(flooring);
  const wallPaintColorIsTbd = isTbdValue(wallPaintColor);
  const outstandingDecisionFields = [
    flooringIsTbd ? "Flooring" : null,
    wallPaintColorIsTbd ? "Paint Color" : null,
  ].filter(Boolean);
  const dueDateReady = bulkMode
    ? bulkRows.some((row) => Boolean(row.readyDate))
    : Boolean(readyDate);
  const hasUnitHistoryConfidence =
    !collectUnitLayout ||
    selectedUnitProfiles.length === 0 ||
    selectedUnitProfiles.every((unitProfile) =>
      Boolean(historyByUnitId[unitProfile.id]?.hasHistory)
    );
  const intakePreflightItems = [
    {
      label: isJustKleen ? "Client / site" : "Property",
      complete: propertyReady,
      detail: propertyReady
        ? `${property} is selected.`
        : isJustKleen
          ? "Choose the customer or site before saving."
          : "Choose the property before saving.",
    },
    {
      label: isJustKleen ? "Jobs / locations" : "Units",
      complete: requestCount > 0,
      detail:
        requestCount > 0
          ? `${requestCount} ${isJustKleen ? "job" : "unit"}${
              requestCount === 1 ? "" : "s"
            } ready for intake.`
          : isJustKleen
            ? "Add at least one job or location."
            : "Add at least one apartment unit.",
    },
    {
      label: "Scope",
      complete: scopeReady && flooringReady,
      detail:
        scopeReady && flooringReady
          ? isJustKleen
            ? "Service type and scope are set."
            : flooringIsTbd
              ? "Paint type is set. Flooring is awaiting a decision."
              : "Paint type and flooring are set."
          : isJustKleen
            ? "Choose both service type and scope."
            : "Choose both paint type and flooring.",
    },
    ...(!isJustKleen && outstandingDecisionFields.length > 0
      ? [
          {
            label: "Outstanding Decisions",
            complete: false,
            detail: `${outstandingDecisionFields.length} TBD: ${outstandingDecisionFields.join(
              ", "
            )}.`,
          },
        ]
      : []),
    {
      label: "Date",
      complete: dueDateReady,
      detail: dueDateReady
        ? `Target date is ${formatShortDate(readyDate)}.`
        : "Add the target date to support scheduling intelligence.",
    },
    {
      label: "Unit memory",
      complete: hasUnitHistoryConfidence,
      detail: collectUnitLayout
        ? hasUnitHistoryConfidence
          ? "Selected unit history is available or no specific map match is required."
          : "Some selected units do not have saved history yet."
        : "Unit memory is not required for this request type.",
    },
    {
      label: "Priority check",
      complete: prioritySignals.length === 0 || plannedPrioritySwapIds.length > 0,
      detail:
        prioritySignals.length === 0
          ? "No nearby deadline conflict is currently visible."
          : plannedPrioritySwapIds.length > 0
            ? `${plannedPrioritySwapIds.length} priority move${
                plannedPrioritySwapIds.length === 1 ? "" : "s"
              } planned.`
            : "Review nearby queue conflicts before submitting.",
    },
  ];
  const preflightReadyCount = intakePreflightItems.filter(
    (item) => item.complete
  ).length;
  const preflightScore = Math.round(
    (preflightReadyCount / intakePreflightItems.length) * 100
  );
  const draftStatus = draftSavedAt
    ? `Saved ${formatDraftSavedAt(draftSavedAt)}`
    : "Not started";
  const requestReadinessCards = [
    {
      label: isJustKleen ? "Jobs" : "Units",
      value: requestCount > 0 ? String(requestCount) : "0",
      detail:
        requestCount > 0
          ? isJustKleen
            ? "Job locations are ready for submission."
            : "Unit list is ready for this queue request."
          : isJustKleen
            ? "Add one job or location to continue."
            : "Add one unit or a batch of units to continue.",
      tone: requestCount > 0 ? "emerald" : "amber",
    },
    {
      label: "Scope",
      value: bulkMode
        ? scopeReady
          ? `${bulkCompleteRows.length} row${
              bulkCompleteRows.length === 1 ? "" : "s"
            }`
          : "Needed"
        : scopeReady
          ? paintType
          : "Needed",
      detail: scopeReady
        ? bulkMode
          ? "Bulk row scope is ready."
          : isJustKleen
            ? "Service type is set."
            : "Paint type is set."
        : isJustKleen
          ? "Choose the service type before saving."
          : "Choose the paint type before saving.",
      tone: scopeReady ? "emerald" : "amber",
    },
    {
      label: isJustKleen ? "Target Date" : "Needed By",
      value: dueDateReady
        ? bulkMode
          ? "Set per row"
          : formatShortDate(readyDate)
        : "Open",
      detail: dueDateReady
        ? "Property deadline is saved."
        : "No deadline provided.",
      tone: dueDateReady ? "emerald" : "zinc",
    },
    {
      label: "Queue Check",
      value: isCheckingPriority
        ? "Checking"
        : prioritySignals.length > 0
          ? `${prioritySignals.length} flag${
              prioritySignals.length === 1 ? "" : "s"
            }`
          : "Clear",
      detail: isCheckingPriority
        ? "Looking for nearby deadline conflicts."
        : prioritySignals.length > 0
          ? "Review priority before submitting."
          : propertyReady && requestCount > 0
            ? "No active conflict is currently visible."
            : "Starts once property, units, and date are set.",
      tone: prioritySignals.length > 0 ? "amber" : "zinc",
    },
  ];

  function addPriorityNote() {
    if (!priorityNoteText) {
      return;
    }

    setNotes((currentNotes) => {
      if (currentNotes.includes(priorityNoteText)) {
        return currentNotes;
      }

      return [currentNotes.trim(), priorityNoteText]
        .filter(Boolean)
        .join("\n\n");
    });
  }

  function planPrioritySwap(item: ActiveQueueItem) {
    setPriority("Urgent");
    setPlannedPrioritySwapIds((currentIds) =>
      currentIds.includes(item.id) ? currentIds : [...currentIds, item.id]
    );
    addPriorityNote();
  }

  function unplanPrioritySwap(itemId: string) {
    setPlannedPrioritySwapIds((currentIds) =>
      currentIds.filter((id) => id !== itemId)
    );
  }

  async function handleSubmit() {
    setToast(null);

    if (!business) {
      setToast({
        type: "error",
        message: "Business is still loading. Please try again.",
      });

      return;
    }

    const validBulkRows = bulkMode
      ? bulkRows.filter(
          (row) =>
            row.unit.trim() &&
            row.paintType.trim() &&
            row.flooring.trim() &&
            normalizePriorityOrderStart(row.priorityOrder) !== "invalid"
        )
      : [];
    const invalidBulkRows = bulkMode
      ? bulkRows.filter(
          (row) =>
            row.unit.trim() ||
            row.moveOutDate ||
            row.readyDate ||
            row.priorityOrder.trim() ||
            row.paintType.trim() ||
            row.flooring.trim() ||
            row.notes.trim()
        ).length - validBulkRows.length
      : 0;

    if (
      !property ||
      (bulkMode
        ? validBulkRows.length === 0
        : units.length === 0 || !paintType || !flooring)
    ) {
      setToast({
        type: "error",
        message: bulkMode
          ? "Add at least one complete row with unit, paint type, and flooring."
          : isJustKleen
            ? "Please fill out client, at least one job/location, service type, and scope."
            : "Please fill out property, at least one unit, paint type, and flooring.",
      });

      return;
    }

    try {
      setIsSaving(true);
      const normalizedPriorityOrderStart =
        normalizePriorityOrderStart(priorityOrderStart);

      if (!bulkMode && normalizedPriorityOrderStart === "invalid") {
        setToast({
          type: "error",
          message: "Priority Order must be a positive whole number.",
        });
        setIsSaving(false);
        return;
      }

      const plannedPrioritySwaps = bulkMode
        ? []
        : prioritySignals.filter((item) =>
        plannedPrioritySwapIds.includes(item.id)
          );
      const submittedPriority =
        plannedPrioritySwaps.length > 0 ? "Urgent" : priority;
      const queueRows = bulkMode
        ? validBulkRows.map((row) => ({
            unit: row.unit.trim(),
            paintType: row.paintType,
            flooring: row.flooring,
            moveOutDate: row.moveOutDate,
            readyDate: row.readyDate,
            priorityOrder: normalizePriorityOrderStart(row.priorityOrder),
            notes: row.notes.trim(),
          }))
        : units.map((unit, index) => ({
            unit,
            paintType,
            flooring,
            moveOutDate,
            readyDate,
            priorityOrder:
              typeof normalizedPriorityOrderStart === "number"
                ? normalizedPriorityOrderStart + index
                : null,
            notes: [
              notes.trim(),
              plannedPrioritySwaps.length > 0 && priorityNoteText
                ? `${priorityNoteText} Trimax will keep the selected existing unit behind this new request.`
                : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
          }));

      const createdItems = await Promise.all(
        queueRows.map((row) => {
          const savedUnit = collectUnitLayout
            ? normalizeUnitLabel(row.unit)
            : row.unit;

          return createQueueItem({
            property,
            unit: savedUnit,
            paintType: row.paintType,
            unitLayout: collectUnitLayout ? unitLayout : "",
            wallPaintColor: isJustKleen ? "" : normalizeTbdValue(wallPaintColor),
            flooring: normalizeTbdValue(row.flooring),
            priority: submittedPriority,
            priorityOrder:
              typeof row.priorityOrder === "number" ? row.priorityOrder : null,
            smokedIn,
            primerRequested: smokedIn && primerRequested,
            priorRenovation,
            priorRenovationDetails,
            renovationNeeded,
            renovationNeededDetails,
            moveOutDate: row.moveOutDate,
            readyDate: row.readyDate,
            scheduledDate: "",
            completedDate: "",
            notes: row.notes,
            businessId: business.id,
            businessSlug,
          });
        })
      );

      if (plannedPrioritySwaps.length > 0) {
        await Promise.all(
          plannedPrioritySwaps.map(async (item) => {
            const targetUnit = normalizeUnitLabel(item.unit || "");
            const swapNote = `Priority swap: ${requestedUnitLabel} was placed ahead of ${targetUnit || "this queue item"} on ${new Date().toLocaleDateString("en-US")}. Keep this unit behind the new urgent request unless management changes it.`;
            const updatedNotes = [item.notes?.trim(), swapNote]
              .filter(Boolean)
              .join("\n\n");

            const { error } = await supabase
              .from("queue_items")
              .update({
                priority: priorityBehindNewRequest(item.priority),
                notes: updatedNotes,
              })
              .eq("id", item.id)
              .eq("business_id", business.id);

            if (error) {
              console.warn("Priority swap update failed:", error.message);
              return;
            }

            await logActivity({
              businessId: business.id,
              action: "queue_item.priority_swapped",
              entityType: "queue_item",
              entityId: item.id,
              entityLabel: `${property || "Property"} - Unit ${
                targetUnit || "-"
              }`,
          details: {
                movedBehind: requestedUnitLabel,
                previousPriority: item.priority,
                newPriority: priorityBehindNewRequest(item.priority),
                newQueueItemIds: createdItems.map(
                  (createdItem) => createdItem.id
                ),
                newQueueUnits: createdItems
                  .map((createdItem) => createdItem.unit)
                  .filter(Boolean),
              },
            });
          })
        );
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.access_token) {
          await fetch("/api/push/queue-created", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              businessId: business.id,
              businessSlug: business.slug,
              property,
              units: createdItems.map((item) => item.unit ?? "").filter(Boolean),
              priority: submittedPriority,
            }),
          });
        }
      } catch (notificationError) {
        console.warn("Queue push notification skipped:", notificationError);
      }

      setToast({
        type: "success",
        message:
              units.length === 1
            ? isJustKleen
              ? "Work request created successfully."
              : "Queue item created successfully."
            : isJustKleen
              ? `${createdItems.length} work requests created successfully${
                  invalidBulkRows > 0
                    ? `; ${invalidBulkRows} row${
                        invalidBulkRows === 1 ? "" : "s"
                      } still need attention.`
                    : "."
                }`
              : `${createdItems.length} queue items created successfully${
                  invalidBulkRows > 0
                    ? `; ${invalidBulkRows} row${
                        invalidBulkRows === 1 ? "" : "s"
                      } still need attention.`
                    : "."
                }`,
      });

      const queueParams = new URLSearchParams({
        business: business.slug,
      });

      if (propertyParam) {
        queueParams.set("property", propertyParam);
      }

      clearSavedDraft();
      router.push(`/queue?${queueParams.toString()}`);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while saving the queue item.";

      setToast({
        type: "error",
        message,
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      {toast && <Toast type={toast.type} message={toast.message} />}

      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Trimax
        </p>

        <h1 className="mt-3 text-5xl font-bold">
          {isJustKleen ? "New Work Request" : "New Queue Request"}
        </h1>

        <p className="mt-3 text-zinc-400">
          {isJustKleen
            ? "Add a cleaning job, customer request, or follow-up item."
            : "Add a new apartment turn, work request, or queue item."}
        </p>

        {business && (
          <Card className="queue-context-card mt-6 border-orange-500/40">
            <p className="text-sm uppercase tracking-[0.25em] text-orange-400">
              Selected Business
            </p>

            <p className="mt-2 text-lg font-semibold">{business.name}</p>
          </Card>
        )}

        {draftLoaded ? (
          <Card className="mt-6 border-green-500/30 bg-green-500/10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-green-200">
                  Draft restored
                </p>

                <p className="mt-1 text-sm leading-6 text-zinc-300">
                  Trimax restored the queue request you were working on
                  {formatDraftSavedAt(draftSavedAt)
                    ? ` at ${formatDraftSavedAt(draftSavedAt)}`
                    : ""}
                  .
                </p>
              </div>

              <button
                type="button"
                onClick={clearSavedDraft}
                className="rounded-2xl border border-green-500/40 px-4 py-2 text-sm font-semibold text-green-100 transition hover:bg-green-500/10"
              >
                Dismiss Notice
              </button>
            </div>
          </Card>
        ) : null}

        <div className="request-readiness-panel mt-6 rounded-3xl border border-zinc-800 bg-zinc-950/70 p-4 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.28em] text-orange-300">
                Intake Command
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                {propertyReady
                  ? `${property} request readiness`
                  : "Request readiness"}
              </h2>
            </div>

            <p className="text-sm font-semibold text-zinc-400">
              Draft: {draftStatus}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {requestReadinessCards.map((card) => (
              <div
                key={card.label}
                className={`request-readiness-card request-readiness-${card.tone} rounded-2xl border px-4 py-3`}
              >
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                  {card.label}
                </p>
                <p className="mt-2 truncate text-lg font-black text-white">
                  {card.value}
                </p>
                <p className="mt-1 text-sm leading-5 text-zinc-400">
                  {card.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="request-preflight-panel mt-6 rounded-3xl border border-zinc-800 bg-zinc-950/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.28em] text-sky-300">
                Intake Preflight
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Catch missing details before they hit the queue
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Trimax checks the request for scope, dates, unit memory, and
                priority conflicts before saving.
              </p>
            </div>

            <div className="request-preflight-score rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                Ready
              </p>
              <p className="mt-2 text-3xl font-black text-white">
                {preflightScore}%
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {intakePreflightItems.map((item) => (
              <div
                key={item.label}
                data-complete={item.complete ? "true" : "false"}
                className="request-preflight-item rounded-2xl border border-white/10 bg-black/25 p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="request-preflight-dot mt-1" />
                  <div>
                    <p className="text-sm font-black text-white">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-zinc-400">
                      {item.detail}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Card className="mt-8">
          <div className="grid gap-5">
            {draftSavedAt && !draftLoaded ? (
              <p className="app-empty-state rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-400">
                Draft autosaved at {formatDraftSavedAt(draftSavedAt)}.
              </p>
            ) : null}

            <InputField
              label={isJustKleen ? "Client / Site" : "Property"}
              placeholder={
                isJustKleen
                  ? "Example: 5 Star 5"
                  : "Example: North Creek Apartments"
              }
              value={property}
              onChange={(value) => {
                setProperty(value);

                if (!shouldCollectUnitLayout(businessSlug, value)) {
                  setUnitLayout("");
                  setUnitLayoutTouched(false);
                }
              }}
              options={propertyOptions}
            />

            <div className="flex flex-col gap-3 rounded-2xl border border-sky-500/25 bg-sky-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-sky-100">
                  {bulkMode
                    ? "Bulk Queue Intake is on"
                    : "Entering several apartments?"}
                </p>
                <p className="mt-1 text-sm leading-6 text-sky-100/75">
                  Add multiple units as rows so dates, flooring, and requested
                  priority stay clear.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setBulkMode((current) => {
                    const next = !current;

                    if (next && bulkRows.length === 1 && !bulkRows[0].unit) {
                      setBulkRows([
                        createBulkQueueRow({
                          moveOutDate,
                          readyDate,
                          priorityOrder: priorityOrderStart,
                          paintType,
                          flooring,
                          notes,
                        }),
                      ]);
                    }

                    return next;
                  });
                }}
                className="app-button-secondary inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-2 text-sm font-black"
              >
                {bulkMode ? "Use Single Entry" : "Add Multiple Units"}
              </button>
            </div>

            {bulkMode ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.22em] text-orange-300">
                      Bulk Queue Intake
                    </p>
                    <h2 className="mt-2 text-2xl font-bold">
                      What apartments need work?
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      Property stays selected once. Each row becomes its own
                      normal queue item.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={addBulkRow}
                      className="app-button-secondary inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-2 text-sm font-black"
                    >
                      + Add Row
                    </button>
                    <button
                      type="button"
                      onClick={duplicatePreviousBulkRow}
                      className="app-button-secondary inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-2 text-sm font-black"
                    >
                      Duplicate Previous Row
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-4">
                  {bulkRows.map((row, index) => {
                    const priorityIsInvalid =
                      normalizePriorityOrderStart(row.priorityOrder) ===
                      "invalid";
                    const rowHasContent = Boolean(
                      row.unit.trim() ||
                        row.moveOutDate ||
                        row.readyDate ||
                        row.priorityOrder.trim() ||
                        row.paintType.trim() ||
                        row.flooring.trim() ||
                        row.notes.trim()
                    );
                    const rowIsInvalid =
                      rowHasContent &&
                      (!row.unit.trim() ||
                        !row.paintType.trim() ||
                        !row.flooring.trim() ||
                        priorityIsInvalid);

                    return (
                      <div
                        key={row.id}
                        className={`rounded-2xl border p-4 ${
                          rowIsInvalid
                            ? "border-red-400/50 bg-red-500/10"
                            : "border-zinc-800 bg-black/25"
                        }`}
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <p className="font-black text-zinc-100">
                            Row {index + 1}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeBulkRow(row.id)}
                            className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-bold text-zinc-200"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                          <InputField
                            label="Unit"
                            value={row.unit}
                            onChange={(value) =>
                              updateBulkRow(row.id, "unit", value)
                            }
                            options={unitOptions}
                            maxVisibleOptions={
                              collectUnitLayout ? 10 : undefined
                            }
                            emptyOptionsMessage={
                              collectUnitLayout
                                ? "No matching North Creek units."
                                : "No matching options."
                            }
                            optionAliases={
                              collectUnitLayout ? unitOptionAliases : undefined
                            }
                          />
                          <InputField
                            label="Move Out Date"
                            value={row.moveOutDate}
                            onChange={(value) =>
                              updateBulkRow(row.id, "moveOutDate", value)
                            }
                            type="date"
                            helperText="When does the tenant leave?"
                          />
                          <InputField
                            label="Needed By Date"
                            value={row.readyDate}
                            onChange={(value) =>
                              updateBulkRow(row.id, "readyDate", value)
                            }
                            type="date"
                            helperText="When does the property need this completed?"
                          />
                          <InputField
                            label="Manager Requested Priority"
                            value={row.priorityOrder}
                            onChange={(value) =>
                              updateBulkRow(row.id, "priorityOrder", value)
                            }
                            type="number"
                            helperText="Use 1, 2, 3 to tell Robbie the requested order."
                          />
                          <InputField
                            label={isJustKleen ? "Service Type" : "Paint Type"}
                            value={row.paintType}
                            onChange={(value) =>
                              updateBulkRow(row.id, "paintType", value)
                            }
                            options={paintTypeOptions}
                          />
                          <InputField
                            label={isJustKleen ? "Scope / Area" : "Flooring"}
                            value={row.flooring}
                            onChange={(value) =>
                              updateBulkRow(row.id, "flooring", value)
                            }
                            options={flooringOptions}
                          />
                        </div>

                        <div className="mt-4">
                          <label className="app-form-label mb-2 block text-sm text-zinc-400">
                            Notes
                          </label>
                          <textarea
                            value={row.notes}
                            onChange={(event) =>
                              updateBulkRow(row.id, "notes", event.target.value)
                            }
                            placeholder="Optional row-specific notes..."
                            className="app-form-input min-h-24 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-orange-500"
                          />
                        </div>

                        {rowIsInvalid ? (
                          <p className="mt-3 text-sm font-semibold text-red-100">
                            This row needs unit, paint type, flooring, and a
                            positive priority number if priority is provided.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <InputField
                label={isJustKleen ? "Jobs / Locations" : "Units"}
                placeholder={
                  isJustKleen
                    ? "Example: Main office, Lobby, Suite 200 or one job per line"
                    : "Example: B12, B210, C04 or one unit per line"
                }
                value={unitsText}
                onChange={setUnitsText}
                options={unitOptions}
                maxVisibleOptions={collectUnitLayout ? 10 : undefined}
                emptyOptionsMessage={
                  collectUnitLayout
                    ? "No matching North Creek units."
                    : "No matching options."
                }
                optionAliases={collectUnitLayout ? unitOptionAliases : undefined}
              />
            )}

            {collectUnitLayout ? (
              <>
                {propertyUnitMessage ? (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    <p className="text-sm font-semibold text-amber-100">
                      {propertyUnitMessage}
                    </p>
                  </div>
                ) : null}

                {selectedUnitProfiles.length > 0 ? (
                  <div className="unit-intelligence-preview rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4">
                    <p className="text-sm uppercase tracking-[0.25em] text-sky-300">
                      Unit Intelligence Preview
                    </p>

                    <div className="mt-3 grid gap-3">
                      {selectedUnitProfiles.map((unitProfile) => (
                        <div
                          key={unitProfile.id}
                          className="unit-intelligence-preview-row rounded-2xl border border-sky-500/20 bg-zinc-950/70 p-3 text-sm"
                        >
                          <div className="grid gap-3 sm:grid-cols-4">
                            <div>
                              <p className="text-zinc-500">Unit</p>
                              <p className="font-semibold text-zinc-100">
                                {unitProfile.unit_label || "-"}
                              </p>
                            </div>
                            <div>
                              <p className="text-zinc-500">Building</p>
                              <p className="font-semibold text-zinc-100">
                                {unitProfile.building_letter || "-"}
                              </p>
                            </div>
                            <div>
                              <p className="text-zinc-500">Floor</p>
                              <p className="font-semibold text-zinc-100">
                                {formatFloor(unitProfile.floor)}
                              </p>
                            </div>
                            <div>
                              <p className="text-zinc-500">Layout</p>
                              <p className="font-semibold text-zinc-100">
                                {displayUnitLayout(unitProfile.floorplan) ||
                                  "-"}
                              </p>
                            </div>
                          </div>

                          {historyByUnitId[unitProfile.id]?.hasHistory ? (
                            <div className="unit-intelligence-history-card mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                              <p className="text-xs uppercase tracking-[0.25em] text-sky-300">
                                History Summary
                              </p>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <div>
                                  <p className="text-zinc-500">
                                    Last Paint Date
                                  </p>
                                  <p className="font-semibold text-zinc-100">
                                    {
                                      historyByUnitId[unitProfile.id]
                                        .lastPaintDate
                                    }
                                  </p>
                                </div>
                                <div>
                                  <p className="text-zinc-500">
                                    Last Paint Type
                                  </p>
                                  <p className="font-semibold text-zinc-100">
                                    {
                                      historyByUnitId[unitProfile.id]
                                        .lastPaintType
                                    }
                                  </p>
                                </div>
                                <div>
                                  <p className="text-zinc-500">
                                    Last Flooring
                                  </p>
                                  <p className="font-semibold text-zinc-100">
                                    {
                                      historyByUnitId[unitProfile.id]
                                        .lastFlooring
                                    }
                                  </p>
                                </div>
                                <div>
                                  <p className="text-zinc-500">
                                    Last Renovation
                                  </p>
                                  <p className="font-semibold text-zinc-100">
                                    {
                                      historyByUnitId[unitProfile.id]
                                        .lastRenovation
                                    }
                                  </p>
                                </div>
                                <div>
                                  <p className="text-zinc-500">
                                    Last Smoker Remediation
                                  </p>
                                  <p className="font-semibold text-zinc-100">
                                    {
                                      historyByUnitId[unitProfile.id]
                                        .lastSmokerRemediation
                                    }
                                  </p>
                                </div>
                                <div>
                                  <p className="text-zinc-500">
                                    Total Recorded Turns
                                  </p>
                                  <p className="font-semibold text-zinc-100">
                                    {
                                      historyByUnitId[unitProfile.id]
                                        .totalRecordedTurns
                                    }
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="unit-intelligence-history-card mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                              <p className="text-xs uppercase tracking-[0.25em] text-sky-300">
                                History Summary
                              </p>
                              <p className="mt-2 font-semibold text-zinc-100">
                                No recorded history yet.
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : normalizedUnits.length > 0 && propertyUnits.length > 0 ? (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    <p className="text-sm font-semibold text-amber-100">
                      No saved North Creek unit facts matched this unit yet.
                      You can still create the queue item and correct the map
                      later.
                    </p>
                  </div>
                ) : null}

                <InputField
                  label="Unit Layout"
                  placeholder="Optional: 2x2 or 2x1"
                  value={unitLayout}
                  onChange={(value) => {
                    setUnitLayoutTouched(true);
                    setUnitLayout(value);
                  }}
                  options={northCreekUnitLayoutOptions}
                  helperText="Auto-fills from the saved North Creek unit map when Trimax knows this unit. You can still override it."
                />
              </>
            ) : null}

            {paintMemoryMessage ? (
              <div className="queue-memory-notice rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3">
                <p className="text-sm font-semibold text-orange-100">
                  {paintMemoryMessage}
                </p>
              </div>
            ) : null}

            {!bulkMode ? (
              <>
            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
              <p className="font-semibold text-blue-100">
                {isJustKleen
                  ? "Add one job or several at once"
                  : "Add one unit or several at once"}
              </p>

              <p className="mt-1 text-sm leading-6 text-blue-100/75">
                {isJustKleen
                  ? "Separate jobs or locations with commas or new lines. Trimax will create one work request per item while copying the same dates, service details, priority, and notes."
                  : "Separate units with commas or new lines. Trimax will create one queue item per unit while copying the same dates, paint, flooring, priority, and notes."}
              </p>
            </div>

            <InputField
              label={isJustKleen ? "Service Type" : "Paint Type"}
              placeholder={
                isJustKleen
                  ? "Example: Deep Cleaning, Bank Cleaning, Recurring Cleaning"
                  : "Example: Reno Paint, Classic Paint, Primer + Paint"
              }
              value={paintType}
              onChange={setPaintType}
              options={paintTypeOptions}
            />

            {!isJustKleen ? (
              <InputField
                label="Wall Paint Color"
                placeholder="Example: Sherwin-Williams Roman Column (SW 7562)"
                value={wallPaintColor}
                onChange={setWallPaintColor}
                options={rnlWallPaintColorOptions}
                helperText="Use this for North Creek's current color transition so the requested wall color is clear before pricing or scheduling."
              />
            ) : null}

            <InputField
              label={isJustKleen ? "Scope / Area" : "Flooring"}
              placeholder={
                isJustKleen
                  ? "Example: Full Facility, Restrooms, Floors"
                  : "Example: Keep Vinyl & Replace Carpet"
              }
              value={flooring}
              onChange={setFlooring}
              options={flooringOptions}
            />

            {!isJustKleen ? (
              <div className="renovation-panel rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">
                  Renovation History
                </p>

                <h2 className="mt-2 text-xl font-bold text-zinc-100">
                  Prior renovation
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Track whether this unit was renovated before and by which
                  prior property management style. When one unit is entered,
                  Trimax will reuse the latest saved details for that same
                  property and unit.
                </p>

                <div className="app-soft-panel mt-4 rounded-2xl border border-zinc-700 bg-zinc-950/70 p-4 text-sm leading-6 text-zinc-300">
                  <p className="font-semibold text-zinc-100">
                    How to use this
                  </p>
                  <p className="mt-1">
                    Use <strong>Prior renovation</strong> for history already
                    known, like Previous Avenue5 Reno. Use{" "}
                    <strong>This queue item is for a renovation</strong> when
                    the current job should become the new history, like
                    PrideRock Reno.
                  </p>
                </div>

                {renovationMemoryMessage ? (
                  <p className="mt-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-100">
                    {renovationMemoryMessage}
                  </p>
                ) : null}

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="app-soft-panel flex items-start gap-3 rounded-2xl border border-zinc-700 bg-zinc-950/70 p-4">
                    <input
                      type="checkbox"
                      checked={priorRenovation}
                      onChange={(event) => {
                        setPriorRenovation(event.target.checked);

                        if (!event.target.checked) {
                          setPriorRenovationDetails("");
                        }
                      }}
                      className="mt-1 h-5 w-5 accent-orange-500"
                    />

                    <span>
                      <span className="block font-semibold text-zinc-100">
                        This unit had a prior renovation
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-zinc-400">
                        Example: Previous PrideRock Reno.
                      </span>
                    </span>
                  </label>

                  <label className="app-soft-panel flex items-start gap-3 rounded-2xl border border-zinc-700 bg-zinc-950/70 p-4">
                    <input
                      type="checkbox"
                      checked={renovationNeeded}
                      onChange={(event) => {
                        setRenovationNeeded(event.target.checked);

                        if (!event.target.checked) {
                          setRenovationNeededDetails("");
                        }
                      }}
                      className="mt-1 h-5 w-5 accent-orange-500"
                    />

                    <span>
                      <span className="block font-semibold text-zinc-100">
                        This queue item is for a renovation
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-zinc-400">
                        Use this when the current turn should become the new
                        renovation history for the unit.
                      </span>
                    </span>
                  </label>
                </div>

                {priorRenovation ? (
                  <div className="mt-4">
                    <InputField
                      label="Prior Renovation Details"
                      placeholder="Example: Previous PrideRock Reno"
                      value={priorRenovationDetails}
                      onChange={setPriorRenovationDetails}
                    />
                  </div>
                ) : null}

                {renovationNeeded ? (
                  <div className="mt-4">
                    <InputField
                      label="Current Renovation Style / Scope"
                      placeholder="Example: PrideRock Reno, Cabinet paint, bath vanity refresh"
                      value={renovationNeededDetails}
                      onChange={setRenovationNeededDetails}
                      helperText="Example: PrideRock Reno. Next time this unit is entered, Trimax can remember it as Previous PrideRock Reno."
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="app-form-label mb-2 block text-sm text-zinc-400">
                  Priority
                </label>

                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                  className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
                >
                  <option>Low</option>
                  <option>Normal</option>
                  <option>High</option>
                  <option>Urgent</option>
                </select>
              </div>

              <label className="app-soft-panel flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                <input
                  type="checkbox"
                  checked={smokedIn}
                  onChange={(event) => {
                    setSmokedIn(event.target.checked);
                    setPrimerRequested(event.target.checked);
                  }}
                  className="h-5 w-5 accent-orange-500"
                />

                <span>
                  <span className="block font-semibold">
                    {isJustKleen
                      ? "Special attention needed"
                      : "Smoker / remediation unit"}
                  </span>
                  <span className="text-sm text-zinc-400">
                    {isJustKleen
                      ? "Flag extra notes, rework, or follow-up risk."
                      : "Include this in remediation reporting."}
                  </span>
                </span>
              </label>
            </div>

            {!isJustKleen && smokedIn ? (
              <label className="flex items-center gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={primerRequested}
                  onChange={(event) =>
                    setPrimerRequested(event.target.checked)
                  }
                  className="h-5 w-5 accent-orange-500"
                />

                <span>
                  <span className="block font-semibold text-amber-900">
                    Add full primer to estimate
                  </span>
                  <span className="text-sm leading-6 text-amber-900">
                    Turn this off when the property wants the smoke noted for
                    reporting but does not want the whole unit primed.
                  </span>
                </span>
              </label>
            ) : null}

            <InputField
              label="Move Out Date"
              placeholder="Example: 2026-06-30"
              value={moveOutDate}
              onChange={setMoveOutDate}
              type="date"
            />

            <InputField
              label="Needed By Date"
              placeholder="Example: 2026-07-03"
              value={readyDate}
              onChange={setReadyDate}
              type="date"
              helperText="Use this only for the date the unit needs to be completed by. Do not estimate Robbie's work time here."
            />

            <InputField
              label="Priority Order Start"
              placeholder="Example: 1"
              value={priorityOrderStart}
              onChange={setPriorityOrderStart}
              type="number"
              helperText="Use this to tell Robbie which units should be handled first. For a batch, units are numbered in the order typed."
            />

            {!isJustKleen && units.length > 1 ? (
              <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm leading-6 text-sky-100">
                <p className="font-black uppercase tracking-[0.18em] text-sky-200">
                  Batch order preview
                </p>
                <p className="mt-2">
                  {priorityOrderStart.trim()
                    ? `Trimax will save ${units.length} units starting at Priority ${priorityOrderStart.trim()} in the order you typed them.`
                    : "Add a Priority Order Start if this batch needs a manager order."}
                </p>
              </div>
            ) : null}

            {!isJustKleen && readyDate && units.length > 0 ? (
              <div
                className={`rounded-2xl border px-4 py-4 ${
                  prioritySignals.length > 0
                    ? "border-amber-400/40 bg-amber-500/10"
                    : "border-emerald-500/30 bg-emerald-500/10"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p
                      className={`text-sm uppercase tracking-[0.22em] ${
                        prioritySignals.length > 0
                          ? "text-amber-200"
                          : "text-emerald-200"
                      }`}
                    >
                      Priority Check
                    </p>

                    <h2 className="mt-2 text-lg font-black text-white">
                      {isCheckingPriority
                        ? "Checking active queue..."
                        : prioritySignals.length > 0
                          ? "Possible queue order conflict"
                          : "No active deadline conflict found"}
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                      {prioritySignals.length > 0
                        ? `Trimax found active ${property} work already due on or near ${formatShortDate(readyDate)}. Review whether ${requestedUnitLabel} should jump ahead before submitting.`
                        : "Trimax did not find another active unit that appears to conflict with this needed-by date."}
                    </p>
                  </div>

                  {prioritySignals.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (priorityLeadUnit) {
                          planPrioritySwap(priorityLeadUnit);
                        }
                      }}
                      className="app-button-primary inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl px-4 py-2 text-sm font-black"
                    >
                      Put New Request First
                    </button>
                  ) : null}
                </div>

                {prioritySignals.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {prioritySignals.map((item) => {
                      const dayGap = daysBetweenDates(
                        item.ready_date,
                        readyDate
                      );
                      const isSwapPlanned = plannedPrioritySwapIds.includes(
                        item.id
                      );
                      const dueCopy =
                        dayGap === 0
                          ? "same needed-by date"
                          : dayGap && dayGap > 0
                            ? `due ${dayGap} day${dayGap === 1 ? "" : "s"} before this request`
                            : `within ${Math.abs(dayGap ?? 0)} day${
                                Math.abs(dayGap ?? 0) === 1 ? "" : "s"
                              } of this request`;

                      return (
                        <div
                          key={item.id}
                          className="app-soft-panel rounded-2xl border border-amber-400/20 bg-zinc-950/70 px-4 py-3"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-black text-white">
                                Unit {normalizeUnitLabel(item.unit || "-")}
                              </p>
                              <p className="mt-1 text-sm leading-6 text-zinc-400">
                                Paint due {formatShortDate(item.ready_date)} /{" "}
                                {item.scheduled_date
                                  ? `scheduled ${formatShortDate(
                                      item.scheduled_date
                                    )}`
                                  : "not scheduled yet"}{" "}
                                / {item.priority || "Normal"} priority /{" "}
                                {dueCopy}
                              </p>
                              {isSwapPlanned ? (
                                <p className="mt-2 inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-emerald-100">
                                  Will move behind new request on submit
                                </p>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  isSwapPlanned
                                    ? unplanPrioritySwap(item.id)
                                    : planPrioritySwap(item)
                                }
                                className={
                                  isSwapPlanned
                                    ? "app-button-secondary inline-flex min-h-10 items-center justify-center rounded-2xl px-4 py-2 text-sm font-black"
                                    : "app-button-primary inline-flex min-h-10 items-center justify-center rounded-2xl px-4 py-2 text-sm font-black"
                                }
                              >
                                {isSwapPlanned
                                  ? "Undo Swap"
                                  : "Put Behind New"}
                              </button>

                              <Link
                                href={`/queue/${item.id}?business=${businessSlug}`}
                                className="app-button-secondary inline-flex min-h-10 items-center justify-center rounded-2xl px-4 py-2 text-sm font-black"
                              >
                                Open
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {plannedPrioritySwapIds.length > 0 ? (
                        <p className="w-full rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
                          On submit, the new request will be saved as Urgent
                          and selected existing units will be placed behind it.
                        </p>
                      ) : null}

                      <button
                        type="button"
                        onClick={addPriorityNote}
                        className="app-button-secondary inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-2 text-sm font-black"
                      >
                        Add Priority Note
                      </button>

                      <button
                        type="button"
                        onClick={() => setPriority("High")}
                        className="app-button-secondary inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-2 text-sm font-black"
                      >
                        Set High Priority
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="app-soft-panel rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <p className="font-semibold text-white">
                Scheduling happens after submission
              </p>

              <p className="mt-1 text-sm leading-6 text-zinc-400">
                {isJustKleen
                  ? "Trimax saves the request automatically. After reviewing it, open the item, choose the work date, and click Schedule."
                  : "Trimax saves the submitted date automatically. After reviewing the request, open the queue item, choose the work date, and click Schedule."}
              </p>
            </div>

            <div>
              <label className="app-form-label mb-2 block text-sm text-zinc-400">Notes</label>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={
                  isJustKleen
                    ? "Add notes about access, supplies, timing, special cleaning details, or customer requests..."
                    : "Add notes about smoke, flooring, damages, timing, or access..."
                }
                className="app-form-input min-h-40 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>
              </>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <Button onClick={handleSubmit} disabled={isSaving}>
                {isSaving
                  ? "Saving..."
                  : isJustKleen
                    ? "Create Work Request(s)"
                    : "Create Queue Item(s)"}
              </Button>

              <Link
                href={cancelHref}
                className="app-button-secondary inline-flex min-h-12 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900 px-6 py-3 text-center font-semibold text-zinc-100 transition hover:border-orange-400 hover:text-orange-300"
              >
                Cancel and return
              </Link>
            </div>

          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export default function NewRequestPage() {
  return (
    <Suspense fallback={<NewRequestLoading />}>
      <NewRequestPageContent />
    </Suspense>
  );
}

function NewRequestLoading() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Trimax
          </p>
          <h1 className="mt-3 text-5xl font-bold">New Work Request</h1>
          <p className="mt-3 text-zinc-400">
            Preparing the intake form for this workspace.
          </p>
        </div>

        <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-zinc-900 to-sky-500/10">
          <div className="h-3 w-40 rounded-full bg-orange-500/40" />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="h-24 rounded-2xl bg-zinc-950/70" />
            <div className="h-24 rounded-2xl bg-zinc-950/70" />
            <div className="h-24 rounded-2xl bg-zinc-950/70" />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
