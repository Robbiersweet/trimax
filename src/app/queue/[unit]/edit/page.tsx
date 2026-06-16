"use client";

import { useEffect, useState } from "react";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import AppShell from "../../../components/AppShell";
import BackButton from "../../../components/BackButton";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import InputField from "../../../components/InputField";
import Toast from "../../../components/Toast";
import { assertCanWriteDuringMaintenance } from "../../../lib/maintenanceMode";
import { supabase } from "../../../lib/supabase";
import { canonicalApartmentUnitLabel } from "../../../utils/unitLabels";

const statusOptions = [
  "Pending Estimate",
  "Estimate Created",
  "Scheduled",
  "Completed",
  "Invoiced",
  "Paid",
  "On Hold",
];

const priorityOptions = ["Low", "Normal", "High", "Urgent"];

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

const paintTypeOptions = [
  "Classic",
  "Touch-Up",
  "Full Repaint",
  "Primer + Paint",
  "Reno Paint",
];

const wallPaintColorOptions = [
  "Sherwin-Williams Roman Column (SW 7562)",
  "Sherwin-Williams Nebulous White (SW 7063)",
  "Confirm with manager",
];

const northCreekUnitLayoutOptions = [
  "2x2 - 2 Bed / 2 Bath",
  "2x1 - 2 Bed / 1 Bath",
  "Confirm with manager",
];

const flooringOptions = [
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

function propertyKey(value: string) {
  return value
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shouldCanonicalizeUnit(property: string, businessSlug: string) {
  return (
    businessSlug === "rnl-creations" &&
    propertyKey(property) === "north-creek-apartments"
  );
}

export default function EditQueueItemPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queueItemId = params.unit as string;
  const businessSlug =
    searchParams.get("business") ?? "rnl-creations";
  const propertyOptions =
    businessSlug === "just-kleen"
      ? justKleenClientOptions
      : rnlPropertyOptions;

  const [businessId, setBusinessId] = useState("");
  const [property, setProperty] = useState("");
  const [unit, setUnit] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [paintType, setPaintType] = useState("");
  const [unitLayout, setUnitLayout] = useState("");
  const [wallPaintColor, setWallPaintColor] = useState("");
  const [flooring, setFlooring] = useState("");
  const [smokedIn, setSmokedIn] = useState(false);
  const [primerRequested, setPrimerRequested] = useState(true);
  const [priorRenovation, setPriorRenovation] = useState(false);
  const [priorRenovationDetails, setPriorRenovationDetails] =
    useState("");
  const [renovationNeeded, setRenovationNeeded] = useState(false);
  const [renovationNeededDetails, setRenovationNeededDetails] =
    useState("");
  const [moveOutDate, setMoveOutDate] = useState("");
  const [readyDate, setReadyDate] = useState("");
  const [scheduledDate, setScheduledDate] =
    useState("");
  const [completedDate, setCompletedDate] =
    useState("");
  const [notes, setNotes] = useState("");

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadQueueItem() {
      const { data: businessData, error: businessError } = await supabase
        .from("businesses")
        .select("id")
        .eq("slug", businessSlug)
        .limit(1)
        .maybeSingle();

      if (businessError || !businessData) {
        setToast({
          type: "error",
          message: "Selected business was not found.",
        });
        return;
      }

      setBusinessId(businessData.id);

      const { data, error } = await supabase
        .from("queue_items")
        .select("*")
        .eq("id", queueItemId)
        .eq("business_id", businessData.id)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setToast({
          type: "error",
          message: "Unable to load queue item for this workspace.",
        });
        return;
      }

      setProperty(data.property ?? "");
      setUnit(data.unit ?? "");
      setStatus(data.status ?? "");
      setPriority(data.priority ?? "");
      setPaintType(data.paint_type ?? "");
      setUnitLayout(data.unit_layout ?? "");
      setWallPaintColor(data.wall_paint_color ?? "");
      setFlooring(data.flooring ?? "");
      setSmokedIn(Boolean(data.smoked_in));
      setPrimerRequested(
        data.primer_requested === false ? false : true
      );
      setPriorRenovation(Boolean(data.prior_renovation));
      setPriorRenovationDetails(data.prior_renovation_details ?? "");
      setRenovationNeeded(Boolean(data.renovation_needed));
      setRenovationNeededDetails(data.renovation_needed_details ?? "");
      setMoveOutDate(data.move_out_date ?? "");
      setReadyDate(data.ready_date ?? "");
      setScheduledDate(data.scheduled_date ?? "");
      setCompletedDate(data.completed_date ?? "");
      setNotes(data.notes ?? "");
    }

    loadQueueItem();
  }, [businessSlug, queueItemId]);

  const handleSave = async () => {
    setToast(null);

    try {
      await assertCanWriteDuringMaintenance(businessSlug);
    } catch (error) {
      setToast({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Trimax is being updated. Try again in a few minutes.",
      });
      return;
    }

    if (!businessId) {
      setToast({
        type: "error",
        message: "Workspace is still loading. Try again in a moment.",
      });
      return;
    }

    const updatePayload = {
      property,
      unit: shouldCanonicalizeUnit(property, businessSlug)
        ? canonicalApartmentUnitLabel(unit)
        : unit,
      status,
      priority,
      paint_type: paintType,
      unit_layout: unitLayout.trim() || null,
      wall_paint_color: wallPaintColor.trim() || null,
      flooring,
      smoked_in: smokedIn,
      primer_requested: smokedIn && primerRequested,
      prior_renovation: priorRenovation,
      prior_renovation_details:
        priorRenovationDetails.trim() || null,
      renovation_needed: renovationNeeded,
      renovation_needed_details:
        renovationNeededDetails.trim() || null,
      move_out_date: moveOutDate || null,
      ready_date: readyDate || null,
      scheduled_date: scheduledDate || null,
      completed_date: completedDate || null,
      notes,
    };

    let { error } = await supabase
      .from("queue_items")
      .update(updatePayload)
      .eq("id", queueItemId)
      .eq("business_id", businessId);

    if (
      error?.message?.includes("primer_requested") ||
      error?.message?.includes("unit_layout") ||
      error?.message?.includes("wall_paint_color")
    ) {
      const legacyUpdatePayload: Record<string, unknown> = {
        ...updatePayload,
      };
      delete legacyUpdatePayload.primer_requested;
      delete legacyUpdatePayload.unit_layout;
      delete legacyUpdatePayload.wall_paint_color;

      const retry = await supabase
        .from("queue_items")
        .update(legacyUpdatePayload)
        .eq("id", queueItemId)
        .eq("business_id", businessId);

      error = retry.error;
    }

    if (error) {
      console.error(error);
      setToast({
        type: "error",
        message: "Unable to update queue item.",
      });
      return;
    }

    setToast({
      type: "success",
      message: "Queue item updated successfully.",
    });

    router.push(
      `/queue/${queueItemId}?business=${businessSlug}`
    );
    router.refresh();
  };

  return (
    <AppShell>
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
        />
      )}

      <div className="mx-auto max-w-3xl space-y-6">
        <BackButton
          label="Back"
          fallbackHref={`/queue/${queueItemId}?business=${businessSlug}`}
        />

        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Trimax Queue
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            Edit Queue Item
          </h1>
        </div>

        <Card>
          <div className="grid gap-5">
            <InputField
              label="Property"
              value={property}
              onChange={setProperty}
              options={propertyOptions}
            />

            <InputField
              label="Unit"
              value={unit}
              onChange={setUnit}
            />

            {businessSlug === "rnl-creations" &&
            (propertyKey(property) === "north-creek-apartments" ||
              unitLayout) ? (
              <InputField
                label="Unit Layout"
                placeholder="Optional: 2x2 or 2x1"
                value={unitLayout}
                onChange={setUnitLayout}
                options={northCreekUnitLayoutOptions}
                helperText="Optional. This helps the schedule show which North Creek layout is being painted."
              />
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <InputField
                label="Status"
                value={status}
                onChange={setStatus}
                options={statusOptions}
              />

              <InputField
                label="Priority"
                value={priority}
                onChange={setPriority}
                options={priorityOptions}
              />
            </div>

            <InputField
              label="Paint Type"
              value={paintType}
              onChange={setPaintType}
              options={paintTypeOptions}
            />

            <InputField
              label="Wall Paint Color"
              value={wallPaintColor}
              onChange={setWallPaintColor}
              options={wallPaintColorOptions}
              helperText="Use this for North Creek's current color transition."
            />

            <InputField
              label="Flooring"
              value={flooring}
              onChange={setFlooring}
              options={flooringOptions}
            />

            <div className="renovation-panel rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">
                Renovation History
              </p>

              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Prior renovation is the unit history already known. Current
                renovation is the work happening now, and it can become the
                remembered history for the next queue entry.
              </p>

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
                      Prior renovation
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-zinc-400">
                      Keep the past renovation style tied to this unit.
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
                      Current renovation
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-zinc-400">
                      Queue-to-estimate can add this renovation work.
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
                  />
                </div>
              ) : null}
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
                  Smoker / remediation unit
                </span>
                <span className="text-sm text-zinc-400">
                  Include this queue item in remediation reporting.
                </span>
              </span>
            </label>

            {smokedIn ? (
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
                    Turn this off when smoke should be tracked but full primer
                    should not be added automatically.
                  </span>
                </span>
              </label>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <InputField
                label="Move Out Date"
                value={moveOutDate}
                onChange={setMoveOutDate}
                type="date"
              />

              <InputField
                label="Paint Due Date"
                value={readyDate}
                onChange={setReadyDate}
                type="date"
                helperText="Use the date the property wants painting finished by so urgent units can be prioritized."
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <InputField
                label="Work Scheduled Date"
                value={scheduledDate}
                onChange={setScheduledDate}
                type="date"
                helperText="Optional. Use this only when the work is already on the calendar."
              />

              <InputField
                label="Completed Date"
                value={completedDate}
                onChange={setCompletedDate}
                type="date"
              />
            </div>

            <div>
              <label className="app-form-label mb-2 block text-sm text-zinc-400">
                Notes
              </label>

              <textarea
                value={notes}
                onChange={(event) =>
                  setNotes(event.target.value)
                }
                className="app-form-input min-h-40 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <Button onClick={handleSave}>
              Save Changes
            </Button>

          </div>
        </Card>
      </div>
    </AppShell>
  );
}
