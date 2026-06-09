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
import { supabase } from "../lib/supabase";

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

type QueueRequestDraft = {
  property: string;
  unitsText: string;
  paintType: string;
  unitLayout: string;
  wallPaintColor: string;
  flooring: string;
  priority: string;
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
  const [paintType, setPaintType] = useState("");
  const [unitLayout, setUnitLayout] = useState("");
  const [wallPaintColor, setWallPaintColor] = useState("");
  const [flooring, setFlooring] = useState("");
  const [priority, setPriority] = useState("Normal");
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
  const [moveOutDate, setMoveOutDate] = useState("");
  const [readyDate, setReadyDate] = useState("");
  const [notes, setNotes] = useState("");

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
      paintType,
      unitLayout,
      wallPaintColor,
      flooring,
      priority,
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
      paintType,
      unitLayout,
      wallPaintColor,
      flooring,
      priority,
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
        setPaintType(draft.paintType ?? "");
        setUnitLayout(draft.unitLayout ?? "");
        setWallPaintColor(draft.wallPaintColor ?? "");
        setFlooring(draft.flooring ?? "");
        setPriority(draft.priority ?? "Normal");
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

  useEffect(() => {
    async function loadRenovationMemory() {
      if (!business || isJustKleen || !property.trim()) {
        setRenovationMemoryMessage("");
        setPaintMemoryMessage("");
        return;
      }

      const units = unitListFromText(unitsText);

      if (units.length !== 1) {
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
        .eq("unit", units[0])
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
        .eq("unit", units[0])
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
  }, [business, isJustKleen, property, unitsText]);

  const collectUnitLayout = shouldCollectUnitLayout(
    businessSlug,
    property
  );

  async function handleSubmit() {
    setToast(null);

    if (!business) {
      setToast({
        type: "error",
        message: "Business is still loading. Please try again.",
      });

      return;
    }

    const units = unitListFromText(unitsText);

    if (!property || units.length === 0 || !paintType || !flooring) {
      setToast({
        type: "error",
        message: isJustKleen
          ? "Please fill out client, at least one job/location, service type, and scope."
          : "Please fill out property, at least one unit, paint type, and flooring.",
      });

      return;
    }

    try {
      setIsSaving(true);

      const createdItems = await Promise.all(
        units.map((unit) =>
          createQueueItem({
            property,
            unit,
            paintType,
            unitLayout: collectUnitLayout ? unitLayout : "",
            wallPaintColor: isJustKleen ? "" : wallPaintColor,
            flooring,
            priority,
            smokedIn,
            primerRequested: smokedIn && primerRequested,
            priorRenovation,
            priorRenovationDetails,
            renovationNeeded,
            renovationNeededDetails,
            moveOutDate,
            readyDate,
            scheduledDate: "",
            completedDate: "",
            notes,
            businessId: business.id,
          })
        )
      );

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
              priority,
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
              ? `${units.length} work requests created successfully.`
              : `${units.length} queue items created successfully.`,
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
        <Link
          href={cancelHref}
          className="inline-flex items-center rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-orange-400 hover:text-orange-300"
        >
          Back to Queue
        </Link>

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
          <Card className="mt-6 border-orange-500/40">
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

        <Card className="mt-8">
          <div className="grid gap-5">
            {draftSavedAt && !draftLoaded ? (
              <p className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-400">
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
                }
              }}
              options={propertyOptions}
            />

            <InputField
              label={isJustKleen ? "Jobs / Locations" : "Units"}
              placeholder={
                isJustKleen
                  ? "Example: Main office, Lobby, Suite 200 or one job per line"
                  : "Example: B12, B210, C04 or one unit per line"
              }
              value={unitsText}
              onChange={setUnitsText}
            />

            {collectUnitLayout ? (
              <InputField
                label="Unit Layout"
                placeholder="Optional: 2x2 or 2x1"
                value={unitLayout}
                onChange={setUnitLayout}
                options={northCreekUnitLayoutOptions}
                helperText="Optional. Collect this over time so scheduling can show the apartment layout before paint is planned."
              />
            ) : null}

            {paintMemoryMessage ? (
              <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3">
                <p className="text-sm font-semibold text-orange-100">
                  {paintMemoryMessage}
                </p>
              </div>
            ) : null}

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
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
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

                <div className="mt-4 rounded-2xl border border-zinc-700 bg-zinc-950/70 p-4 text-sm leading-6 text-zinc-300">
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
                  <label className="flex items-start gap-3 rounded-2xl border border-zinc-700 bg-zinc-950/70 p-4">
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

                  <label className="flex items-start gap-3 rounded-2xl border border-zinc-700 bg-zinc-950/70 p-4">
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
                <label className="mb-2 block text-sm text-zinc-400">
                  Priority
                </label>

                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
                >
                  <option>Low</option>
                  <option>Normal</option>
                  <option>High</option>
                  <option>Urgent</option>
                </select>
              </div>

              <label className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
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
              label="Paint Due Date"
              placeholder="Example: 2026-07-03"
              value={readyDate}
              onChange={setReadyDate}
              type="date"
              helperText="Use the date the property wants painting finished by so urgent units can be prioritized."
            />

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
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
              <label className="mb-2 block text-sm text-zinc-400">Notes</label>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={
                  isJustKleen
                    ? "Add notes about access, supplies, timing, special cleaning details, or customer requests..."
                    : "Add notes about smoke, flooring, damages, timing, or access..."
                }
                className="min-h-40 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

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
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900 px-6 py-3 text-center font-semibold text-zinc-100 transition hover:border-orange-400 hover:text-orange-300"
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
