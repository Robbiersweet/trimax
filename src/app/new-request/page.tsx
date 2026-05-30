"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
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
  const [flooring, setFlooring] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [smokedIn, setSmokedIn] = useState(false);
  const [priorRenovation, setPriorRenovation] = useState(false);
  const [priorRenovationDetails, setPriorRenovationDetails] =
    useState("");
  const [renovationNeeded, setRenovationNeeded] = useState(false);
  const [renovationNeededDetails, setRenovationNeededDetails] =
    useState("");
  const [renovationMemoryMessage, setRenovationMemoryMessage] =
    useState("");
  const [moveOutDate, setMoveOutDate] = useState("");
  const [readyDate, setReadyDate] = useState("");
  const [notes, setNotes] = useState("");

  const [isSaving, setIsSaving] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

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
    async function loadRenovationMemory() {
      if (!business || isJustKleen || !property.trim()) {
        setRenovationMemoryMessage("");
        return;
      }

      const units = unitListFromText(unitsText);

      if (units.length !== 1) {
        setRenovationMemoryMessage("");
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
        return;
      }

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

    loadRenovationMemory();
  }, [business, isJustKleen, property, unitsText]);

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

      await Promise.all(
        units.map((unit) =>
          createQueueItem({
            property,
            unit,
            paintType,
            flooring,
            priority,
            smokedIn,
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

        <Card className="mt-8">
          <div className="grid gap-5">
            <InputField
              label={isJustKleen ? "Client / Site" : "Property"}
              placeholder={
                isJustKleen
                  ? "Example: 5 Star 5"
                  : "Example: North Creek Apartments"
              }
              value={property}
              onChange={setProperty}
              list="property-options"
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
              list="paint-type-options"
            />

            <InputField
              label={isJustKleen ? "Scope / Area" : "Flooring"}
              placeholder={
                isJustKleen
                  ? "Example: Full Facility, Restrooms, Floors"
                  : "Example: Keep Vinyl & Replace Carpet"
              }
              value={flooring}
              onChange={setFlooring}
              list="flooring-options"
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
                  onChange={(event) => setSmokedIn(event.target.checked)}
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

            <InputField
              label="Move Out Date"
              placeholder="Example: 2026-06-30"
              value={moveOutDate}
              onChange={setMoveOutDate}
              type="date"
            />

            <InputField
              label="Date R&L Can Start"
              placeholder="Example: 2026-07-03"
              value={readyDate}
              onChange={setReadyDate}
              type="date"
              helperText="Use the first date R&L can begin work, not the property's final ready date."
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

            <datalist id="property-options">
              {propertyOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>

            <datalist id="paint-type-options">
              {paintTypeOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>

            <datalist id="flooring-options">
              {flooringOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
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
