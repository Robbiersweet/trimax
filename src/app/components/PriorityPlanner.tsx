"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "./Button";
import { logActivity } from "../lib/activityLog";
import { supabase } from "../lib/supabase";

export type PriorityPlannerItem = {
  id: string;
  property: string | null;
  unit: string | null;
  priority_order: number | null;
  ready_date: string | null;
  move_out_date: string | null;
  status: string | null;
  paint_type: string | null;
  notes: string | null;
  created_at: string | null;
};

type PlannerRow = PriorityPlannerItem & {
  priorityInput: string;
};

function prioritySortValue(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  }

  if (!value || !String(value).trim()) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function dateSortValue(value: string | null) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime();
}

function createdSortValue(value: string | null) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime();
}

function sortPlannerRows(first: PlannerRow, second: PlannerRow) {
  return (
    prioritySortValue(first.priorityInput) -
      prioritySortValue(second.priorityInput) ||
    dateSortValue(first.ready_date) - dateSortValue(second.ready_date) ||
    createdSortValue(first.created_at) - createdSortValue(second.created_at) ||
    first.id.localeCompare(second.id)
  );
}

function normalizePriorityInput(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return "invalid";
  }

  return parsed;
}

export default function PriorityPlanner({
  businessId,
  propertyName,
  items,
}: {
  businessId: string;
  propertyName: string;
  items: PriorityPlannerItem[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<PlannerRow[]>(
    items.map((item) => ({
      ...item,
      priorityInput:
        item.priority_order === null || item.priority_order === undefined
          ? ""
          : String(item.priority_order),
    }))
  );
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);

  const sortedRows = useMemo(() => [...rows].sort(sortPlannerRows), [rows]);
  const hasInvalidRows = rows.some(
    (row) => normalizePriorityInput(row.priorityInput) === "invalid"
  );
  const changedRows = rows.filter((row) => {
    const nextPriority = normalizePriorityInput(row.priorityInput);
    return nextPriority !== "invalid" && nextPriority !== row.priority_order;
  });

  function updatePriority(itemId: string, value: string) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === itemId ? { ...row, priorityInput: value } : row
      )
    );
  }

  function renumberRowsByOrder(orderedIds: string[]) {
    setRows((currentRows) =>
      currentRows.map((row) => ({
        ...row,
        priorityInput: String(orderedIds.indexOf(row.id) + 1),
      }))
    );
  }

  function moveRow(draggedId: string, targetId: string) {
    if (draggedId === targetId) {
      return;
    }

    const orderedIds = sortedRows.map((row) => row.id);
    const fromIndex = orderedIds.indexOf(draggedId);
    const toIndex = orderedIds.indexOf(targetId);

    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const [movedId] = orderedIds.splice(fromIndex, 1);
    orderedIds.splice(toIndex, 0, movedId);
    renumberRowsByOrder(orderedIds);
    setMessage({
      type: "success",
      text: "Priority order updated in the planner. Save to update the queue.",
    });
  }

  function normalizeVisiblePriorities() {
    renumberRowsByOrder(sortedRows.map((row) => row.id));
    setMessage({
      type: "success",
      text: "Priorities normalized in the planner. Save to update the queue.",
    });
  }

  async function savePriorityOrder() {
    setMessage(null);

    if (hasInvalidRows) {
      setMessage({
        type: "error",
        text: "Priority numbers must be blank or positive whole numbers.",
      });
      return;
    }

    if (changedRows.length === 0) {
      setMessage({
        type: "success",
        text: "Priority order is already up to date.",
      });
      return;
    }

    const updates = changedRows.map((row) => ({
      ...row,
      nextPriority: normalizePriorityInput(row.priorityInput) as number | null,
    }));

    setIsSaving(true);
    const updateResults = await Promise.all(
      updates.map((row) =>
        supabase
          .from("queue_items")
          .update({
            priority_order: row.nextPriority,
            priority_updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
      )
    );
    setIsSaving(false);
    const error = updateResults.find((result) => result.error)?.error;

    if (error) {
      setMessage({
        type: "error",
        text: `Unable to save priority order: ${error.message}`,
      });
      return;
    }

    await Promise.all(
      updates.map((row) =>
        logActivity({
          businessId,
          action: "queue_item.priority_order_changed",
          entityType: "queue_item",
          entityId: row.id,
          entityLabel: `${row.property || propertyName} - Unit ${row.unit || "-"}`,
          details: {
            field: "priority_order",
            label: "Manager Priority Order",
            previousValue: row.priority_order,
            newValue: row.nextPriority,
          },
        })
      )
    );

    setRows((currentRows) =>
      currentRows.map((row) => {
        const updatedRow = updates.find((update) => update.id === row.id);

        return updatedRow
          ? {
              ...row,
              priority_order: updatedRow.nextPriority,
              priorityInput:
                updatedRow.nextPriority === null ? "" : String(updatedRow.nextPriority),
            }
          : row;
      })
    );
    setMessage({
      type: "success",
      text: "Priority order saved. The queue will use the new order.",
    });
    router.refresh();
  }

  return (
    <div className="rounded-3xl border border-sky-500/25 bg-sky-500/10 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-200">
            Priority Planner
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">
            Priority Planner
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
            Arrange the order work should be completed. {propertyName} is
            selected. Drag rows or edit priority numbers directly, then save
            when the visible order is right.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={normalizeVisiblePriorities}
          >
            Normalize Priorities
          </Button>
          <Button
            type="button"
            onClick={savePriorityOrder}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Priority Order"}
          </Button>
        </div>
      </div>

      {message ? (
        <p
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            message.type === "error"
              ? "border-red-400/40 bg-red-500/10 text-red-100"
              : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm font-semibold text-zinc-300">
          No active queue items are available for this property.
        </p>
      ) : (
        <div className="mt-5 grid gap-3">
          <div className="hidden grid-cols-[4rem_6rem_8rem_8rem_8rem_9rem_10rem_10rem] gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-zinc-400 xl:grid">
            <span>Drag</span>
            <span>Priority #</span>
            <span>Unit</span>
            <span>Needed By</span>
            <span>Move Out</span>
            <span>Status</span>
            <span>Paint Type</span>
            <span>Current Request</span>
          </div>

          {sortedRows.map((row) => {
            const invalid =
              normalizePriorityInput(row.priorityInput) === "invalid";

            return (
              <div
                key={row.id}
                draggable
                onDragStart={(event) => {
                  setDraggingRowId(row.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", row.id);
                }}
                onDragEnd={() => setDraggingRowId(null)}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const draggedId =
                    event.dataTransfer.getData("text/plain") || draggingRowId;

                  if (draggedId) {
                    moveRow(draggedId, row.id);
                  }

                  setDraggingRowId(null);
                }}
                className={`grid cursor-grab gap-3 rounded-2xl border px-4 py-4 active:cursor-grabbing xl:grid-cols-[4rem_6rem_8rem_8rem_8rem_9rem_10rem_10rem] xl:items-center ${
                  draggingRowId === row.id
                    ? "border-sky-300/60 bg-sky-400/15 opacity-70"
                    : invalid
                      ? "border-red-400/50 bg-red-500/10"
                      : "border-white/10 bg-black/20"
                } ${
                  invalid
                    ? ""
                    : "hover:border-sky-300/35"
                }`}
              >
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500 xl:hidden">
                    Drag
                  </span>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      setDraggingRowId(row.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", row.id);
                    }}
                    className="inline-flex h-10 w-10 touch-none items-center justify-center rounded-xl border border-white/10 bg-zinc-950 text-lg font-black text-zinc-300"
                    aria-label={`Drag ${row.unit || "queue item"}`}
                    title="Drag to reorder"
                  >
                    ::
                  </button>
                </div>
                <label className="grid gap-1">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500 xl:hidden">
                    Priority #
                  </span>
                  <input
                    value={row.priorityInput}
                    onChange={(event) =>
                      updatePriority(row.id, event.target.value)
                    }
                    inputMode="numeric"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 font-black text-white outline-none focus:border-sky-400"
                    aria-label={`Priority for ${row.unit || "queue item"}`}
                  />
                </label>
                <PlannerCell label="Unit" value={row.unit || "-"} strong />
                <PlannerCell label="Needed By" value={row.ready_date || "-"} />
                <PlannerCell label="Move Out" value={row.move_out_date || "-"} />
                <PlannerCell label="Status" value={row.status || "-"} />
                <PlannerCell label="Paint Type" value={row.paint_type || "-"} />
                <PlannerCell
                  label="Current Request"
                  value={
                    row.priority_order
                      ? `Priority #${row.priority_order}`
                      : "No priority"
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlannerCell({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500 xl:hidden">
        {label}
      </p>
      <p
        className={`truncate text-sm ${
          strong ? "font-black text-white" : "font-semibold text-zinc-200"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
