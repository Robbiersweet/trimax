"use client";

import { type ReactNode, useEffect, useState } from "react";
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
import { logActivity } from "../../../lib/activityLog";
import { assertCanWriteDuringMaintenance } from "../../../lib/maintenanceMode";
import {
  queueDelayReasons,
  queuePercentOptions,
  queueProgressStages,
} from "../../../lib/queueTiming";
import { supabase } from "../../../lib/supabase";
import {
  TBD_VALUE,
  normalizeTbdValue,
} from "../../../lib/tbd";
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

const flooringOptions = [
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

type QueueEditSnapshot = {
  property: string;
  unit: string;
  status: string;
  priority: string;
  priority_order: number | null;
  projected_completion_date: string | null;
  progress_stage: string | null;
  percent_complete: number | null;
  delay_reason: string | null;
  manager_update: string | null;
  ready_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  move_out_date: string | null;
};

const trackedQueueEditFields: Array<{
  key: keyof QueueEditSnapshot;
  label: string;
}> = [
  { key: "property", label: "Property" },
  { key: "unit", label: "Unit" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "priority_order", label: "Manager Priority Order" },
  { key: "progress_stage", label: "Progress" },
  { key: "percent_complete", label: "Percent Complete" },
  { key: "projected_completion_date", label: "Robbie ETA" },
  { key: "delay_reason", label: "Delay Reason" },
  { key: "manager_update", label: "Manager-visible Update" },
  { key: "ready_date", label: "Needed By Date" },
  { key: "scheduled_date", label: "Scheduled Date" },
  { key: "completed_date", label: "Completed Date" },
  { key: "move_out_date", label: "Move Out Date" },
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

function FormSection({
  eyebrow,
  title,
  detail,
  children,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-200">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-bold text-zinc-50">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{detail}</p>
      </div>

      <div className="grid gap-5">{children}</div>
    </section>
  );
}

function normalizePriorityOrderInput(value: string) {
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

function normalizePercentComplete(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);

  return [0, 25, 50, 75, 90, 100].includes(parsed) ? parsed : "invalid";
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
  const [priorityOrder, setPriorityOrder] = useState("");
  const [progressStage, setProgressStage] = useState("Not Started");
  const [percentComplete, setPercentComplete] = useState("0");
  const [projectedCompletionDate, setProjectedCompletionDate] =
    useState("");
  const [delayReason, setDelayReason] = useState("");
  const [managerUpdate, setManagerUpdate] = useState("");
  const [privateInternalNote, setPrivateInternalNote] = useState("");
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
  const [originalQueueItem, setOriginalQueueItem] =
    useState<QueueEditSnapshot | null>(null);

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
      setPriorityOrder(
        data.priority_order ? String(data.priority_order) : ""
      );
      setProgressStage(data.progress_stage ?? "Not Started");
      setPercentComplete(
        data.percent_complete === null || data.percent_complete === undefined
          ? ""
          : String(data.percent_complete)
      );
      setProjectedCompletionDate(data.projected_completion_date ?? "");
      setDelayReason(data.delay_reason ?? "");
      setManagerUpdate(data.manager_update ?? "");
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
      setOriginalQueueItem({
        property: data.property ?? "",
        unit: data.unit ?? "",
        status: data.status ?? "",
        priority: data.priority ?? "",
        priority_order: data.priority_order ?? null,
        projected_completion_date: data.projected_completion_date ?? null,
        progress_stage: data.progress_stage ?? null,
        percent_complete: data.percent_complete ?? null,
        delay_reason: data.delay_reason ?? null,
        manager_update: data.manager_update ?? null,
        ready_date: data.ready_date ?? null,
        scheduled_date: data.scheduled_date ?? null,
        completed_date: data.completed_date ?? null,
        move_out_date: data.move_out_date ?? null,
      });
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

    const normalizedPriorityOrder =
      normalizePriorityOrderInput(priorityOrder);

    if (normalizedPriorityOrder === "invalid") {
      setToast({
        type: "error",
        message: "Priority Order must be a positive whole number.",
      });
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const deadlineChanged =
      Boolean(originalQueueItem) &&
      (originalQueueItem?.ready_date ?? null) !== (readyDate || null);
    const priorityOrderChanged =
      Boolean(originalQueueItem) &&
      (originalQueueItem?.priority_order ?? null) !== normalizedPriorityOrder;
    const normalizedPercentComplete =
      normalizePercentComplete(percentComplete);

    if (normalizedPercentComplete === "invalid") {
      setToast({
        type: "error",
        message: "Percent Complete must be 0, 25, 50, 75, 90, or 100.",
      });
      return;
    }

    const managerUpdateChanged =
      Boolean(originalQueueItem) &&
      (originalQueueItem?.manager_update ?? null) !==
        (managerUpdate.trim() || null);
    const updatePayload = {
      property,
      unit: shouldCanonicalizeUnit(property, businessSlug)
        ? canonicalApartmentUnitLabel(unit)
        : unit,
      status,
      priority,
      priority_order: normalizedPriorityOrder,
      priority_updated_at: priorityOrderChanged ? now : undefined,
      priority_updated_by: priorityOrderChanged ? user?.id ?? null : undefined,
      paint_type: paintType,
      unit_layout: unitLayout.trim() || null,
      wall_paint_color: normalizeTbdValue(wallPaintColor).trim() || null,
      flooring: normalizeTbdValue(flooring),
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
      deadline_updated_at: deadlineChanged ? now : undefined,
      deadline_updated_by: deadlineChanged ? user?.id ?? null : undefined,
      scheduled_date: scheduledDate || null,
      completed_date: completedDate || null,
      projected_completion_date: projectedCompletionDate || null,
      progress_stage: progressStage || null,
      percent_complete: normalizedPercentComplete,
      delay_reason: delayReason || null,
      manager_update: managerUpdate.trim() || null,
      manager_update_at: managerUpdateChanged ? now : undefined,
      manager_update_by: managerUpdateChanged ? user?.id ?? null : undefined,
      notes,
    };
    const nextSnapshot: QueueEditSnapshot = {
      property: updatePayload.property,
      unit: updatePayload.unit,
      status: updatePayload.status,
      priority: updatePayload.priority,
      priority_order: updatePayload.priority_order,
      projected_completion_date: updatePayload.projected_completion_date,
      progress_stage: updatePayload.progress_stage,
      percent_complete: updatePayload.percent_complete,
      delay_reason: updatePayload.delay_reason,
      manager_update: updatePayload.manager_update,
      ready_date: updatePayload.ready_date,
      scheduled_date: updatePayload.scheduled_date,
      completed_date: updatePayload.completed_date,
      move_out_date: updatePayload.move_out_date,
    };

    let { error } = await supabase
      .from("queue_items")
      .update(updatePayload)
      .eq("id", queueItemId)
      .eq("business_id", businessId);

    if (
      error?.message?.includes("primer_requested") ||
      error?.message?.includes("unit_layout") ||
      error?.message?.includes("wall_paint_color") ||
      error?.message?.includes("priority_order") ||
      error?.message?.includes("priority_updated_at") ||
      error?.message?.includes("priority_updated_by") ||
      error?.message?.includes("deadline_updated_at") ||
      error?.message?.includes("deadline_updated_by") ||
      error?.message?.includes("projected_completion_date") ||
      error?.message?.includes("progress_stage") ||
      error?.message?.includes("percent_complete") ||
      error?.message?.includes("delay_reason") ||
      error?.message?.includes("manager_update")
    ) {
      const legacyUpdatePayload: Record<string, unknown> = {
        ...updatePayload,
      };
      delete legacyUpdatePayload.primer_requested;
      delete legacyUpdatePayload.unit_layout;
      delete legacyUpdatePayload.wall_paint_color;
      delete legacyUpdatePayload.priority_order;
      delete legacyUpdatePayload.priority_updated_at;
      delete legacyUpdatePayload.priority_updated_by;
      delete legacyUpdatePayload.deadline_updated_at;
      delete legacyUpdatePayload.deadline_updated_by;
      delete legacyUpdatePayload.projected_completion_date;
      delete legacyUpdatePayload.progress_stage;
      delete legacyUpdatePayload.percent_complete;
      delete legacyUpdatePayload.delay_reason;
      delete legacyUpdatePayload.manager_update;
      delete legacyUpdatePayload.manager_update_at;
      delete legacyUpdatePayload.manager_update_by;

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

    if (originalQueueItem) {
      const changes = trackedQueueEditFields
        .map(({ key, label }) => {
          const previousValue = originalQueueItem[key] ?? null;
          const newValue = nextSnapshot[key] ?? null;

          if (previousValue === newValue) {
            return null;
          }

          return {
            field: key,
            label,
            previousValue,
            newValue,
          };
        })
        .filter(Boolean);

      if (changes.length > 0) {
        await logActivity({
          businessId,
          action: "queue_item.updated",
          entityType: "queue_item",
          entityId: queueItemId,
          entityLabel: `${nextSnapshot.property || "Property"} - Unit ${
            nextSnapshot.unit || "-"
          }`,
          details: {
            changedFields: changes.map((change) => change?.field),
            changes,
          },
        });
      }

      if (deadlineChanged) {
        await logActivity({
          businessId,
          action: "queue_item.needed_by_date_changed",
          entityType: "queue_item",
          entityId: queueItemId,
          entityLabel: `${nextSnapshot.property || "Property"} - Unit ${
            nextSnapshot.unit || "-"
          }`,
          details: {
            field: "ready_date",
            label: "Needed By Date",
            previousValue: originalQueueItem.ready_date,
            newValue: nextSnapshot.ready_date,
            updatedBy: user?.id ?? null,
          },
        });
      }

      if (priorityOrderChanged) {
        await logActivity({
          businessId,
          action: "queue_item.priority_order_changed",
          entityType: "queue_item",
          entityId: queueItemId,
          entityLabel: `${nextSnapshot.property || "Property"} - Unit ${
            nextSnapshot.unit || "-"
          }`,
          details: {
            field: "priority_order",
            label: "Manager Priority Order",
            previousValue: originalQueueItem.priority_order,
            newValue: nextSnapshot.priority_order,
            updatedBy: user?.id ?? null,
          },
        });
      }

      if (privateInternalNote.trim()) {
        const { error: noteError } = await supabase
          .from("internal_notes")
          .insert({
            business_id: businessId,
            entity_type: "queue_item",
            entity_id: queueItemId,
            body: privateInternalNote.trim(),
            author_user_id: user?.id ?? null,
            author_email: user?.email ?? null,
          });

        if (!noteError) {
          await logActivity({
            businessId,
            action: "queue_item.internal_note_added",
            entityType: "queue_item",
            entityId: queueItemId,
            entityLabel: `${nextSnapshot.property || "Property"} - Unit ${
              nextSnapshot.unit || "-"
            }`,
            details: {
              internalNote: privateInternalNote.trim(),
            },
          });
        }
      }
    }

    const workWasMarkedComplete =
      originalQueueItem &&
      !["completed", "invoiced", "paid"].includes(
        originalQueueItem.status.trim().toLowerCase()
      ) &&
      (["completed", "invoiced", "paid"].includes(
        nextSnapshot.status.trim().toLowerCase()
      ) ||
        Boolean(nextSnapshot.completed_date));

    setToast({
      type: "success",
      message: workWasMarkedComplete
        ? "Work marked complete. If the invoice has been sent, this item is ready to leave the Active Queue."
        : "Queue item updated successfully.",
    });

    router.push(
      `/queue/${queueItemId}?business=${businessSlug}${
        workWasMarkedComplete ? "&completed=1" : ""
      }`
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
          <div className="grid gap-6">
            <FormSection
              eyebrow="Manager Intake"
              title="What the property is asking for"
              detail="Managers should enter the unit facts, tenant move-out timing, the property deadline, and their requested order. Robbie's schedule stays separate."
            >
              <div className="grid gap-5 md:grid-cols-2">
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

                <InputField
                  label="Move Out Date"
                  value={moveOutDate}
                  onChange={setMoveOutDate}
                  type="date"
                  helperText="When does the tenant leave?"
                />

                <InputField
                  label="Needed By Date / Property Deadline"
                  value={readyDate}
                  onChange={setReadyDate}
                  type="date"
                  helperText="When does the property need this completed?"
                />

                <InputField
                  label="Requested Priority"
                  value={priorityOrder}
                  onChange={setPriorityOrder}
                  type="number"
                  helperText="Which unit should Robbie complete first? Use 1, 2, 3 when submitting multiple units."
                />

                <InputField
                  label="Priority"
                  value={priority}
                  onChange={setPriority}
                  options={priorityOptions}
                />

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

                <InputField
                  label="Wall Color"
                  value={wallPaintColor}
                  onChange={setWallPaintColor}
                  options={wallPaintColorOptions}
                  helperText="Use To Be Determined when the manager has not inspected the unit yet."
                />
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

              <div>
                <label className="app-form-label mb-2 block text-sm text-zinc-400">
                  Notes
                </label>

                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="app-form-input min-h-36 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
                />
              </div>
            </FormSection>

            <FormSection
              eyebrow="Operations"
              title="Robbie's internal work plan"
              detail="Work Scheduled Date is the internal Robbie schedule, not the manager's Needed By Date."
            >
              <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm leading-6 text-sky-100">
                <p className="font-black uppercase tracking-[0.18em] text-sky-200">
                  Field guide
                </p>
                <p className="mt-2">
                  Move Out Date = tenant leaves. Needed By = property
                  deadline. Work Scheduled Date = internal Robbie schedule.
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <InputField
                  label="Status"
                  value={status}
                  onChange={setStatus}
                  options={statusOptions}
                />

                <InputField
                  label="Work Scheduled Date"
                  value={scheduledDate}
                  onChange={setScheduledDate}
                  type="date"
                  helperText="Use this only when the work is on Robbie's calendar."
                />

                <InputField
                  label="Robbie ETA / Projected Completion Date"
                  value={projectedCompletionDate}
                  onChange={setProjectedCompletionDate}
                  type="date"
                  helperText="Robbie's current expected finish date. This does not change the property deadline."
                />

                <InputField
                  label="Progress"
                  value={progressStage}
                  onChange={setProgressStage}
                  options={queueProgressStages}
                />

                <InputField
                  label="Percent Complete"
                  value={percentComplete}
                  onChange={setPercentComplete}
                  options={queuePercentOptions}
                  type="number"
                />

                <InputField
                  label="Delay Reason"
                  value={delayReason}
                  onChange={setDelayReason}
                  options={queueDelayReasons}
                />

                <InputField
                  label="Completion Date"
                  value={completedDate}
                  onChange={setCompletedDate}
                  type="date"
                />
              </div>

              <div className="grid gap-5">
                <div>
                  <label className="app-form-label mb-2 block text-sm text-zinc-400">
                    Manager-visible Update
                  </label>
                  <textarea
                    value={managerUpdate}
                    onChange={(event) => setManagerUpdate(event.target.value)}
                    placeholder="Example: Extra wall repair added time. Projected completion moved to July 7."
                    className="app-form-input min-h-28 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-orange-500"
                  />
                  <p className="app-helper-text mt-2 text-xs leading-5 text-zinc-500">
                    Property managers can see this update.
                  </p>
                </div>

                <div>
                  <label className="app-form-label mb-2 block text-sm text-zinc-400">
                    Private Internal Note
                  </label>
                  <textarea
                    value={privateInternalNote}
                    onChange={(event) =>
                      setPrivateInternalNote(event.target.value)
                    }
                    placeholder="Optional private note for Robbie/admin only."
                    className="app-form-input min-h-28 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-orange-500"
                  />
                  <p className="app-helper-text mt-2 text-xs leading-5 text-zinc-500">
                    Managers do not see private internal notes.
                  </p>
                </div>
              </div>
            </FormSection>

            <details className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-4">
              <summary className="cursor-pointer text-sm font-black uppercase tracking-[0.2em] text-zinc-200">
                Advanced
              </summary>

              <div className="mt-5 grid gap-5">
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

                <div className="renovation-panel rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">
                    Renovation Details
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
                        label="Renovation Needed Details"
                        placeholder="Example: PrideRock Reno, cabinet paint, bath vanity refresh"
                        value={renovationNeededDetails}
                        onChange={setRenovationNeededDetails}
                      />
                    </div>
                  ) : null}
                </div>

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
                        Primer requested
                      </span>
                      <span className="text-sm leading-6 text-amber-100">
                        Use this when smoke should be tracked but full primer
                        should not be added automatically.
                      </span>
                    </span>
                  </label>
                ) : null}
              </div>
            </details>

            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
