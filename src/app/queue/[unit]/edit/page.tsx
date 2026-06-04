"use client";

import { useEffect, useState } from "react";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import Link from "next/link";
import AppShell from "../../../components/AppShell";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import InputField from "../../../components/InputField";
import Toast from "../../../components/Toast";
import { supabase } from "../../../lib/supabase";

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

  const [property, setProperty] = useState("");
  const [unit, setUnit] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [paintType, setPaintType] = useState("");
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
      const { data, error } = await supabase
        .from("queue_items")
        .select("*")
        .eq("id", queueItemId)
        .single();

      if (error || !data) {
        setToast({
          type: "error",
          message: "Unable to load queue item.",
        });
        return;
      }

      setProperty(data.property ?? "");
      setUnit(data.unit ?? "");
      setStatus(data.status ?? "");
      setPriority(data.priority ?? "");
      setPaintType(data.paint_type ?? "");
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
  }, [queueItemId]);

  const handleSave = async () => {
    setToast(null);

    const updatePayload = {
      property,
      unit,
      status,
      priority,
      paint_type: paintType,
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
      .eq("id", queueItemId);

    if (error?.message?.includes("primer_requested")) {
      const legacyUpdatePayload: Record<string, unknown> = {
        ...updatePayload,
      };
      delete legacyUpdatePayload.primer_requested;

      const retry = await supabase
        .from("queue_items")
        .update(legacyUpdatePayload)
        .eq("id", queueItemId);

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
        <Link
          href={`/queue/${queueItemId}?business=${businessSlug}`}
          className="inline-flex text-sm text-orange-400 hover:text-orange-300"
        >
          Back to Queue Item
        </Link>

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
              label="Flooring"
              value={flooring}
              onChange={setFlooring}
              options={flooringOptions}
            />

            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">
                Renovation History
              </p>

              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Prior renovation is the unit history already known. Current
                renovation is the work happening now, and it can become the
                remembered history for the next queue entry.
              </p>

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
                      Prior renovation
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-zinc-400">
                      Keep the past renovation style tied to this unit.
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
                  <span className="block font-semibold text-amber-100">
                    Add full primer to estimate
                  </span>
                  <span className="text-sm text-amber-100/75">
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
              <label className="mb-2 block text-sm text-zinc-400">
                Notes
              </label>

              <textarea
                value={notes}
                onChange={(event) =>
                  setNotes(event.target.value)
                }
                className="min-h-40 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
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
